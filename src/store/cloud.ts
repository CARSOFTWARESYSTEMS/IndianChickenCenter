/**
 * The cloud store (P5): the same AppState and the same commands as the demo store, kept in Firestore.
 *
 * Reading. Listeners fill maps of documents, which become AppState through the P4 document shapes
 * (src/data/docs.ts). Only a recent window is read, to stay inside the free plan's daily reads:
 *  - in full: settings, people, vehicles, customers, each customer's last closed month
 *  - from the window start on: trips, their events, purchases and totals, ledger entries
 *  - month-end snapshots from the earliest last-closed month, so balances can start from them
 * The window starts on the first day of last month, or earlier for a customer whose months are not closed yet
 * (see LedgerWindow in the engine).
 *
 * Saving. A command runs on AppState exactly as in the demo. What changed becomes batched writes
 * (src/data/diff.ts), which Firestore queues while offline. Until the listeners show a write, it is kept as an
 * overlay so the screen never jumps back. Each save is tracked in sync.ts: saved on phone, saved to cloud, or
 * needs attention (refused by the rules; the reason comes from running the command again on fresh data).
 */
import {
  collection,
  collectionGroup,
  doc,
  getDocFromServer,
  onSnapshot,
  query,
  runTransaction,
  waitForPendingWrites,
  where,
  type DocumentData,
  type Firestore,
  type Query,
  type QuerySnapshot,
  type DocumentSnapshot,
} from 'firebase/firestore'
import {
  can,
  DEFAULT_SETTINGS,
  fail,
  financialYearOf,
  firstDayOfMonth,
  makeIssuedBill,
  monthOf,
  nextMonth,
  ok,
  previousMonth,
  todayInKolkata,
  type BusinessSettings,
  type Customer,
  type DomainError,
  type IssuedBill,
  type IsoDate,
  type LedgerEntry,
  type Result,
  type Role,
  type Trip,
  type TripEvent,
} from '../domain'
import { canonical } from '../domain/util'
import { changesBetween, type Change } from '../data/diff'
import {
  paths,
  withoutUndefined,
  type BillCounterDoc,
  type DocWrite,
  type LedgerClosureDoc,
  type PurchaseDoc,
  type SettingsDoc,
  type TripDoc,
  type TripTotalsDoc,
  type UserDoc,
} from '../data/docs'
import { commitWrites } from '../firebase/client'
import { newId } from './ids'
import type { AppState } from './state'
import { billToIssue, type IssueBillInput } from './commands'
import { attachBackend, storeChanged, type Backend, type Command } from './store'
import { getSync, onItemsChange, resetSync, setSync, type SyncItem } from './sync'

type Data = Record<string, unknown>

export interface CloudOptions {
  db: Firestore
  uid: string
  role: Role
  /** Today in Asia/Kolkata (tests pass a fixed date). */
  today?: IsoDate
  /** Where unconfirmed saves are kept across restarts; tests pass an in-memory map. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  /** Whether the phone has a connection (default: the browser's own flag). Tests switch it. */
  online?: () => boolean
}

/** How long to wait for a bill number before calling the connection too poor. */
const ISSUE_TIMEOUT_MS = 20_000

export interface CloudStore extends Backend {
  /** Resolves once the first reads have arrived. */
  ready: Promise<void>
  stop(): void
}

const ITEMS_KEY = 'icc.sync.v1'

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** First day of last month, or earlier for any customer whose months are not all closed (LedgerWindow). */
export function windowStart(today: IsoDate, customers: readonly Customer[], closures: readonly LedgerClosureDoc[]): IsoDate {
  let from = firstDayOfMonth(previousMonth(monthOf(today)))
  const closedThrough = new Map(closures.map((c) => [c.customerId, c.closedThrough]))
  for (const c of customers) {
    const closed = closedThrough.get(c.id)
    const start = closed ? firstDayOfMonth(nextMonth(closed)) : firstDayOfMonth(monthOf(c.createdAt))
    if (start < from) from = start
  }
  return from
}

function sameFields(written: Data, stored: Data | undefined): boolean {
  if (!stored) return false
  return Object.entries(written).every(([k, v]) => canonical(stored[k]) === canonical(v))
}

function tripOf(d: TripDoc, totals: TripTotalsDoc | undefined): Trip {
  const trip: Trip = {
    id: d.id,
    date: d.date,
    status: d.status,
    createdBy: d.createdBy,
    vehicleNumber: d.vehicleNumber,
    defaultSaleRatePaisePerKg: d.defaultSaleRatePaisePerKg,
  }
  if (d.driverId !== undefined) trip.driverId = d.driverId
  if (d.driverName !== undefined) trip.driverName = d.driverName
  if (d.closedBy !== undefined) trip.closedBy = d.closedBy
  if (d.closedOn !== undefined) trip.closedOn = d.closedOn
  if (d.closeKg) {
    // Drivers cannot read the money totals; they see zeros, and the screens hide money from them anyway.
    trip.closeSummary = {
      ...d.closeKg,
      purchasePaise: totals?.purchasePaise ?? 0,
      salesPaise: totals?.salesPaise ?? 0,
      operatingPaise: totals?.operatingPaise ?? 0,
    }
  }
  return trip
}

function eventOf(d: Data, purchase: PurchaseDoc | undefined): TripEvent {
  if (d.type !== 'LOADING') return d as unknown as TripEvent
  // A driver cannot read purchase rates: the loading keeps its kg, and its money reads as zero.
  return {
    ...(d as unknown as TripEvent),
    ratePaisePerKg: purchase?.ratePaisePerKg ?? 0,
    exactMilliPaise: purchase?.exactMilliPaise ?? 0,
    amount: purchase?.amount ?? 0,
  } as TripEvent
}

export function startCloud(options: CloudOptions): CloudStore {
  const { db, uid, role } = options
  const today = options.today ?? todayInKolkata()
  const storage = options.storage ?? safeStorage()
  const viewAll = can(role, 'trip.viewAll')
  const isOnline = options.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false)

  /** Documents per listener, by path. A document can come from more than one listener. */
  const sources = new Map<string, Map<string, Data>>()
  const pendingBySource = new Map<string, Set<string>>()
  const stops = new Map<string, () => void>()
  /** Writes saved on this phone but not yet seen in any listener. */
  const overlay = new Map<string, DocWrite>()
  const waiting = new Set<string>()
  let from: IsoDate | undefined
  let state: AppState = emptyState()
  let scheduled = false
  let stopped = false
  let markReady: () => void = () => undefined
  const ready = new Promise<void>((resolve) => {
    markReady = resolve
  })

  function emptyState(): AppState {
    return { version: 1, settings: DEFAULT_SETTINGS, users: [], actorId: uid, vehicles: [], customers: [], trips: [], tripEvents: [], ledger: [], bills: [] }
  }

  // ---------------------------------------------------------------------------
  // Listening
  // ---------------------------------------------------------------------------

  function listen(key: string, target: Query<DocumentData>): void {
    if (stops.has(key) || stopped) return
    waiting.add(key)
    const stop = onSnapshot(
      target,
      { includeMetadataChanges: true },
      (snap: QuerySnapshot<DocumentData>) => {
        const docs = new Map<string, Data>()
        const pending = new Set<string>()
        for (const d of snap.docs) {
          docs.set(d.ref.path, d.data())
          if (d.metadata.hasPendingWrites) pending.add(d.ref.path)
        }
        sources.set(key, docs)
        pendingBySource.set(key, pending)
        waiting.delete(key)
        schedule()
      },
      () => {
        // Refused or failed: treat as empty so the app still opens (rules decide what a role may read).
        sources.set(key, new Map())
        waiting.delete(key)
        schedule()
      },
    )
    stops.set(key, stop)
  }

  function listenDoc(key: string, path: string): void {
    if (stops.has(key) || stopped) return
    waiting.add(key)
    const stop = onSnapshot(
      doc(db, path),
      { includeMetadataChanges: true },
      (snap: DocumentSnapshot<DocumentData>) => {
        const docs = new Map<string, Data>()
        if (snap.exists()) docs.set(path, snap.data())
        sources.set(key, docs)
        pendingBySource.set(key, new Set(snap.metadata.hasPendingWrites ? [path] : []))
        waiting.delete(key)
        schedule()
      },
      () => {
        sources.set(key, new Map())
        waiting.delete(key)
        schedule()
      },
    )
    stops.set(key, stop)
  }

  listenDoc('settings', 'settings/business')
  listen('users', query(collection(db, 'users')))
  listen('vehicles', query(collection(db, 'vehicles')))
  listen('customers', query(collection(db, 'customers')))
  listen('closures', query(collection(db, 'ledgerClosures')))

  /** Once customers and closures are known, the window is fixed and the window listeners start. */
  function startWindow(customers: Customer[], closures: LedgerClosureDoc[]): void {
    from = windowStart(today, customers, closures)
    const start = `trip_${from}`
    listen('ledger', query(collection(db, 'ledgerEntries'), where('date', '>=', from)))
    listen('bills', query(collection(db, 'bills'), where('issuedOn', '>=', from)))
    const earliestClosed = closures.map((c) => c.closedThrough).sort()[0]
    if (earliestClosed) listen('snapshots', query(collection(db, 'ledgerEntries'), where('month', '>=', earliestClosed)))
    if (viewAll) {
      listen('trips', query(collection(db, 'trips'), where('date', '>=', from)))
      listen('openTrips', query(collection(db, 'trips'), where('status', '==', 'OPEN')))
      listen('events', query(collectionGroup(db, 'events'), where('tripId', '>=', start)))
      if (can(role, 'purchase.view')) listen('purchases', query(collectionGroup(db, 'purchases'), where('tripId', '>=', start)))
      if (can(role, 'profit.view')) listen('totals', query(collectionGroup(db, 'totals'), where('tripId', '>=', start)))
    } else {
      listen('trips', query(collection(db, 'trips'), where('driverId', '==', uid), where('date', '>=', from)))
      listen('openTrips', query(collection(db, 'trips'), where('driverId', '==', uid), where('status', '==', 'OPEN')))
    }
  }

  /** Per-trip listeners: a driver's own trips, and (for everyone) open trips older than the window. */
  function listenToTrips(trips: Iterable<TripDoc>): void {
    for (const t of trips) {
      const older = from !== undefined && t.date < from
      if (viewAll && !older) continue
      listen(`events:${t.id}`, query(collection(db, `trips/${t.id}/events`)))
      if (can(role, 'purchase.view')) listen(`purchases:${t.id}`, query(collection(db, `trips/${t.id}/purchases`)))
    }
  }

  // ---------------------------------------------------------------------------
  // Building AppState
  // ---------------------------------------------------------------------------

  function schedule(): void {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (!stopped) rebuild()
    })
  }

  function merged(): Map<string, Data> {
    const all = new Map<string, Data>()
    for (const docs of sources.values()) for (const [path, data] of docs) all.set(path, data)
    for (const [path, write] of overlay) {
      if (sameFields(write.op === 'delete' ? {} : write.data, all.get(path)) && write.op !== 'delete') {
        overlay.delete(path) // the listeners have it now
        continue
      }
      if (write.op === 'set') all.set(path, write.data)
      else if (write.op === 'update') all.set(path, { ...(all.get(path) ?? {}), ...write.data })
      else all.delete(path)
    }
    return all
  }

  function rebuild(): void {
    const all = merged()
    let settings: BusinessSettings = DEFAULT_SETTINGS
    const users: AppState['users'] = []
    const vehicles: string[] = []
    const customers: Customer[] = []
    const closures: LedgerClosureDoc[] = []
    const trips = new Map<string, TripDoc>()
    const events: { path: string; data: Data }[] = []
    const purchases = new Map<string, PurchaseDoc>()
    const totals = new Map<string, TripTotalsDoc>()
    const ledger: LedgerEntry[] = []
    const bills: IssuedBill[] = []

    for (const [path, data] of all) {
      const p = path.split('/')
      if (p[0] === 'settings') {
        const { updatedBy: _by, ...rest } = data as unknown as SettingsDoc
        void _by
        settings = rest
      } else if (p[0] === 'users' && p[1]) {
        const u = data as unknown as UserDoc
        users.push({ id: p[1], name: u.name, role: u.role })
      } else if (p[0] === 'vehicles' && p[1]) vehicles.push(p[1])
      else if (p[0] === 'customers') customers.push(data as unknown as Customer)
      else if (p[0] === 'ledgerClosures') closures.push(data as unknown as LedgerClosureDoc)
      else if (p[0] === 'ledgerEntries') ledger.push(data as unknown as LedgerEntry)
      else if (p[0] === 'bills') bills.push(data as unknown as IssuedBill)
      else if (p[0] === 'trips' && p[1]) {
        if (p.length === 2) trips.set(p[1], data as unknown as TripDoc)
        else if (p[2] === 'events') events.push({ path, data })
        else if (p[2] === 'purchases') purchases.set(`${p[1]}/${p[3]}`, data as unknown as PurchaseDoc)
        else if (p[2] === 'totals') totals.set(p[1], data as unknown as TripTotalsDoc)
      }
    }

    if (from === undefined && sources.has('customers') && sources.has('closures')) startWindow(customers, closures)
    listenToTrips(trips.values())

    const pending = new Set<string>(overlay.keys())
    for (const set of pendingBySource.values()) for (const path of set) pending.add(path)

    state = {
      version: 1,
      settings,
      users: users.sort((a, b) => a.name.localeCompare(b.name)),
      actorId: uid,
      vehicles: vehicles.sort(),
      customers: customers.sort((a, b) => a.shopName.localeCompare(b.shopName, undefined, { numeric: true })),
      trips: [...trips.values()].map((t) => tripOf(t, totals.get(t.id))),
      tripEvents: events.map(({ data }) => eventOf(data, purchases.get(`${String(data.tripId)}/${String(data.id)}`))),
      ledger,
      ...(from ? { ledgerWindow: { from } } : {}),
      bills,
    }
    const isReady = from !== undefined && waiting.size === 0
    setSync({ cloud: true, pendingPaths: pending, ready: getSync().ready || isReady })
    if (isReady) markReady()
    storeChanged()
  }

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------

  function updateItem(id: string, patch: Partial<SyncItem>): void {
    setSync({ items: getSync().items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })
  }

  /**
   * Why the cloud refused a save: the same command, run again on what the phone now knows. The news that made it
   * fail (say, another phone closed the trip) may arrive a moment after the refusal, so ask a few times.
   */
  function explain<T>(id: string, command: Command<T>, err: unknown, attempt = 0): void {
    if (stopped) return
    const again = command(state)
    if (!again.ok) return updateItem(id, { status: 'attention', error: again.error })
    if (attempt < 5) {
      setTimeout(() => explain(id, command, err, attempt + 1), 500)
      return
    }
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : 'unknown'
    updateItem(id, { status: 'attention', error: { code: 'not_saved', message: code } })
  }

  function save<T>(change: Change, command: Command<T>): void {
    const writes = change.batches.flat()
    const item: SyncItem = {
      id: newId('sync'),
      kind: change.kind,
      detail: change.detail,
      at: Date.now(),
      status: 'pending',
      paths: writes.filter((w) => w.op !== 'delete').map((w) => w.path),
    }
    for (const w of writes) overlay.set(w.path, w)
    setSync({ items: [...getSync().items.filter((i) => i.status !== 'saved'), item] })
    // Batches are sent in order; Firestore keeps that order, offline too.
    const sent = change.batches.map((batch) => commitWrites(db, batch))
    Promise.all(sent).then(
      () => {
        for (const w of writes) overlay.delete(w.path)
        updateItem(item.id, { status: 'saved' })
        schedule()
      },
      (err: unknown) => {
        for (const w of writes) overlay.delete(w.path)
        updateItem(item.id, { status: 'attention', error: { code: 'not_saved', message: 'refused' } })
        rebuild()
        setTimeout(() => explain(item.id, command, err), 0)
      },
    )
    rebuild()
  }

  function dispatch<T>(command: Command<T>): Result<T> {
    const prev = state
    const result = command(prev)
    if (!result.ok) return result
    const change = changesBetween(prev, result.value.state)
    if (!change.ok) return change
    if (change.value) save(change.value, command)
    return ok(result.value.value)
  }

  // ---------------------------------------------------------------------------
  // Bills: numbered online, in a transaction (plan §6)
  // ---------------------------------------------------------------------------

  /**
   * Takes the next number for the financial year and stores the bill, both or neither. A transaction cannot run
   * offline, which is the point: offline, the bill is shared as a statement without a number.
   * A retry with the same id returns the bill already issued.
   */
  async function issueBill(input: IssueBillInput): Promise<Result<IssuedBill>> {
    const existing = state.bills.find((b) => b.id === input.id)
    if (existing) return ok(existing)
    const bill = billToIssue(state, input)
    if (!bill.ok) return bill
    // A transaction does not wait for the network like a write does, so check before asking for a number.
    if (!isOnline()) return fail('not_online', 'Connect to the internet to give the bill a number')
    let refused: DomainError | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'deadline-exceeded' })), ISSUE_TIMEOUT_MS)
    })
    try {
      const transaction = runTransaction(db, async (tx) => {
        const billRef = doc(db, paths.bill(input.id))
        const already = await tx.get(billRef)
        if (already.exists()) return already.data() as IssuedBill
        const year = financialYearOf(input.date)
        const counterRef = doc(db, paths.billCounter(year))
        const counter = await tx.get(counterRef)
        const sequence = counter.exists() ? (counter.data() as BillCounterDoc).next : 1
        const made = makeIssuedBill({ id: input.id, bill: bill.value, sequence, issuedOn: input.date, issuedBy: uid })
        if (!made.ok) {
          refused = made.error
          throw new Error(made.error.message)
        }
        const next: BillCounterDoc = { financialYear: year, next: sequence + 1, lastBillId: input.id }
        tx.set(counterRef, next)
        tx.set(billRef, withoutUndefined(made.value))
        return made.value
      })
      const issued = await Promise.race([transaction, timeout])
      overlay.set(paths.bill(issued.id), { op: 'set', path: paths.bill(issued.id), data: issued as unknown as Data })
      rebuild()
      return ok(issued)
    } catch (err) {
      if (refused) return { ok: false, error: refused }
      const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : ''
      if (code === 'unavailable' || code === 'failed-precondition' || code === 'deadline-exceeded') {
        return fail('not_online', 'Connect to the internet to give the bill a number')
      }
      // The rules check the date against the cloud's clock; a phone set to the wrong day is refused.
      return fail('not_saved', code || 'refused')
    } finally {
      clearTimeout(timer)
    }
  }

  // ---------------------------------------------------------------------------
  // Saves left over from the last time the app was open
  // ---------------------------------------------------------------------------

  function restore(): void {
    let saved: SyncItem[] = []
    try {
      saved = JSON.parse(storage?.getItem(ITEMS_KEY) ?? '[]') as SyncItem[]
    } catch {
      saved = []
    }
    const kept = saved.filter((i) => i.status !== 'saved')
    setSync({ cloud: true, ready: false, items: kept, pendingPaths: new Set() })
    const unconfirmed = kept.filter((i) => i.status === 'pending')
    if (unconfirmed.length === 0) return
    // Firestore resends writes it kept from last time by itself. Once they are answered and the first reads are in,
    // ask the server which ones are there. Offline, try again later.
    const check = async (): Promise<void> => {
      if (stopped) return
      await waitForPendingWrites(db)
      await ready
      try {
        for (const item of unconfirmed) {
          const present = await Promise.all(item.paths.map((path) => getDocFromServer(doc(db, path)).then((d) => d.exists())))
          if (present.every(Boolean)) updateItem(item.id, { status: 'saved' })
          else updateItem(item.id, { status: 'attention', error: { code: 'not_saved', message: 'refused after restart' } })
        }
      } catch {
        setTimeout(() => void check(), 5_000)
      }
    }
    void check()
  }

  onItemsChange((items) => {
    try {
      storage?.setItem(ITEMS_KEY, JSON.stringify(items.filter((i) => i.status !== 'saved')))
    } catch {
      // Storage unavailable: unconfirmed saves are still tracked for this visit.
    }
  })
  restore()

  const store: CloudStore = {
    ready,
    getState: () => state,
    dispatch,
    issueBill,
    stop() {
      stopped = true
      stops.forEach((stop) => stop())
      stops.clear()
      onItemsChange(undefined)
      attachBackend(undefined)
      resetSync()
    },
  }
  attachBackend(store)
  return store
}
