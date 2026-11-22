/**
 * Customer ledger (plan Part 2 §1). One immutable entry per financial event.
 * Balance = Σ debits − Σ credits over financial entries; snapshots are never summed.
 */
import type { Actor, Direction, TripStatus } from './common'
import { isIsoDate, isMonthKey, monthOf, type IsoDate, type MonthKey } from './dates'
import { requireCapability, type Capability } from './permissions'
import { fail, ok, type Result } from './result'
import { isRoundingPolicy, postAmount, type RoundingPolicyId } from './rounding'
import {
  isSafePositiveInt,
  multiplyExact,
  type Grams,
  type MilliPaise,
  type Paise,
  type PaisePerKg,
} from './units'
import { canonical, isNonEmptyString } from './util'

/** Cash, UPI and bank transfer (E-01 approved at Gate A). Cash stays preselected (D-10). */
export const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly unknown[]).includes(value)
}

/** Passbook wording per method; "CashPayment" is the source's own (C-TXT L68). */
const PAYMENT_COMMENT: Record<PaymentMethod, string> = {
  CASH: 'CashPayment',
  UPI: 'UpiPayment',
  BANK_TRANSFER: 'BankTransfer',
}

interface EntryBase {
  id: string
  customerId: string
  date: IsoDate
  createdBy: string
  comment?: string
}

export interface OpeningBalanceEntry extends EntryBase {
  type: 'OPENING_BALANCE'
  direction: Direction
  amount: Paise
}

export interface SaleEntry extends EntryBase {
  type: 'SALE'
  tripId?: string
  grams: Grams
  ratePaisePerKg: PaisePerKg
  /** grams × rate, exact, in milli-paise. */
  exactMilliPaise: MilliPaise
  /** Posted amount in paise under policyId. Only this enters balances, bills and totals. */
  amount: Paise
  policyId: RoundingPolicyId
  /** exact − posted, in milli-paise (positive when paise were dropped). */
  differenceMilliPaise: MilliPaise
  /** Set when the owner confirmed selling more than the trip's remaining stock (D-04). */
  oversellConfirmed?: true
}

export interface PaymentEntry extends EntryBase {
  type: 'PAYMENT'
  amount: Paise
  method: PaymentMethod
  reference?: string
  tripId?: string
}

export interface ReversalEntry extends EntryBase {
  type: 'REVERSAL'
  reversesId: string
  direction: Direction
  amount: Paise
  reason?: string
}

export interface AdjustmentEntry extends EntryBase {
  type: 'ADJUSTMENT'
  direction: Direction
  amount: Paise
  reason: string
}

export interface MonthEndSnapshot extends EntryBase {
  type: 'MONTH_END_SNAPSHOT'
  month: MonthKey
  /** Signed balance at the end of `month` (positive = customer owes). */
  closingBalance: Paise
  entryCount: number
}

export type FinancialEntry = OpeningBalanceEntry | SaleEntry | PaymentEntry | ReversalEntry | AdjustmentEntry
export type LedgerEntry = FinancialEntry | MonthEndSnapshot

// Fixed ids make "only one" rules enforceable by create-only security rules (no queries needed).
export const openingBalanceIdFor = (customerId: string): string => `open_${customerId}`
export const reversalIdFor = (originalId: string): string => `rev_${originalId}`
export const snapshotIdFor = (customerId: string, month: MonthKey): string => `snap_${customerId}_${month}`

export function isFinancial(entry: LedgerEntry): entry is FinancialEntry {
  return entry.type !== 'MONTH_END_SNAPSHOT'
}

export function directionOf(entry: FinancialEntry): Direction {
  switch (entry.type) {
    case 'SALE':
      return 'DEBIT'
    case 'PAYMENT':
      return 'CREDIT'
    default:
      return entry.direction
  }
}

export function signedAmount(entry: FinancialEntry): Paise {
  return directionOf(entry) === 'DEBIT' ? entry.amount : -entry.amount
}

const opposite = (d: Direction): Direction => (d === 'DEBIT' ? 'CREDIT' : 'DEBIT')

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

interface CommonInput {
  id: string
  customerId: string
  date: IsoDate
  createdBy: string
  comment?: string
}

function base(input: CommonInput): EntryBase {
  const b: EntryBase = { id: input.id, customerId: input.customerId, date: input.date, createdBy: input.createdBy }
  if (input.comment !== undefined) b.comment = input.comment
  return b
}

export function makeSale(
  input: CommonInput & {
    grams: Grams
    ratePaisePerKg: PaisePerKg
    /** The live policy from settings; null while U-01 is unanswered, which disables real posting. */
    policy: RoundingPolicyId | null
    tripId?: string
    oversellConfirmed?: boolean
  },
): Result<SaleEntry> {
  if (input.policy === null) {
    return fail(
      'rounding_policy_unset',
      'Sales cannot be posted until the owner chooses how paise are handled on bills (decision U-01).',
    )
  }
  if (!isRoundingPolicy(input.policy)) return fail('unknown_policy', `Unknown rounding policy "${String(input.policy)}"`)
  if (!isSafePositiveInt(input.grams)) return fail('invalid_quantity', 'Weight must be more than 0 kg')
  if (!isSafePositiveInt(input.ratePaisePerKg)) return fail('invalid_rate', 'Rate must be more than ₹0/kg')
  const exact = multiplyExact(input.grams, input.ratePaisePerKg)
  if (exact === null) return fail('invalid_amount', 'Sale amount is too large')
  const amount = postAmount(exact, input.policy)
  const entry: SaleEntry = {
    ...base(input),
    type: 'SALE',
    grams: input.grams,
    ratePaisePerKg: input.ratePaisePerKg,
    exactMilliPaise: exact,
    amount,
    policyId: input.policy,
    differenceMilliPaise: exact - amount * 1_000,
  }
  if (input.tripId !== undefined) entry.tripId = input.tripId
  if (input.oversellConfirmed) entry.oversellConfirmed = true
  return ok(entry)
}

export function makePayment(
  input: CommonInput & { amount: Paise; method?: PaymentMethod; reference?: string; tripId?: string },
): Result<PaymentEntry> {
  if (!isSafePositiveInt(input.amount)) return fail('invalid_amount', 'Payment must be more than ₹0')
  const method = input.method ?? 'CASH'
  if (!isPaymentMethod(method)) return fail('invalid_input', `Unknown payment method "${String(method)}"`)
  const entry: PaymentEntry = { ...base(input), type: 'PAYMENT', amount: input.amount, method }
  if (input.reference !== undefined) entry.reference = input.reference
  if (input.tripId !== undefined) entry.tripId = input.tripId
  return ok(entry)
}

export function makeOpeningBalance(
  input: Omit<CommonInput, 'id'> & { amount: Paise; direction?: Direction },
): Result<OpeningBalanceEntry> {
  const direction = input.direction ?? 'DEBIT'
  if (direction === 'CREDIT') {
    return fail('decision_pending', 'An opening advance (customer in credit) waits on owner decision U-10.')
  }
  if (!isSafePositiveInt(input.amount)) return fail('invalid_amount', 'Opening balance must be more than ₹0')
  return ok({
    ...base({ ...input, id: openingBalanceIdFor(input.customerId) }),
    type: 'OPENING_BALANCE',
    direction,
    amount: input.amount,
  })
}

export function makeReversal(
  original: FinancialEntry,
  input: { date: IsoDate; createdBy: string; reason?: string },
): Result<ReversalEntry> {
  if (original.type === 'REVERSAL') return fail('cannot_reverse', 'A reversal cannot itself be reversed')
  const entry: ReversalEntry = {
    id: reversalIdFor(original.id),
    customerId: original.customerId,
    date: input.date,
    createdBy: input.createdBy,
    type: 'REVERSAL',
    reversesId: original.id,
    direction: opposite(directionOf(original)),
    amount: original.amount,
  }
  if (input.reason !== undefined) entry.reason = input.reason
  return ok(entry)
}

export function makeAdjustment(
  input: CommonInput & { direction: Direction; amount: Paise; reason: string },
): Result<AdjustmentEntry> {
  if (!isNonEmptyString(input.reason)) return fail('reason_required', 'An adjustment needs a reason')
  if (!isSafePositiveInt(input.amount)) return fail('invalid_amount', 'Adjustment must be more than ₹0')
  return ok({ ...base(input), type: 'ADJUSTMENT', direction: input.direction, amount: input.amount, reason: input.reason })
}

// ---------------------------------------------------------------------------
// Validation (mirrors what Firestore rules will check in P4)
// ---------------------------------------------------------------------------

function validateShape(entry: LedgerEntry): Result<void> {
  if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.customerId) || !isNonEmptyString(entry.createdBy)) {
    return fail('invalid_input', 'Entry needs an id, a customer and an author')
  }
  if (!isIsoDate(entry.date)) return fail('invalid_input', `Invalid date "${entry.date}"`)

  switch (entry.type) {
    case 'SALE': {
      if (!isSafePositiveInt(entry.grams)) return fail('invalid_quantity', 'Weight must be more than 0 kg')
      if (!isSafePositiveInt(entry.ratePaisePerKg)) return fail('invalid_rate', 'Rate must be more than ₹0/kg')
      if (!isRoundingPolicy(entry.policyId)) return fail('unknown_policy', 'Unknown rounding policy')
      const exact = multiplyExact(entry.grams, entry.ratePaisePerKg)
      if (
        exact === null ||
        entry.exactMilliPaise !== exact ||
        entry.amount !== postAmount(exact, entry.policyId) ||
        entry.differenceMilliPaise !== exact - entry.amount * 1_000
      ) {
        return fail('amount_mismatch', 'Sale amount does not match kg × rate under its rounding policy')
      }
      return ok(undefined)
    }
    case 'PAYMENT':
      if (!isSafePositiveInt(entry.amount)) return fail('invalid_amount', 'Payment must be more than ₹0')
      if (!isPaymentMethod(entry.method)) return fail('invalid_input', 'Payment method must be Cash, UPI or Bank transfer')
      return ok(undefined)
    case 'OPENING_BALANCE':
      if (entry.id !== openingBalanceIdFor(entry.customerId)) return fail('invalid_input', 'Opening balance id must be open_<customerId>')
      if (entry.direction !== 'DEBIT') return fail('decision_pending', 'Opening advance waits on owner decision U-10')
      if (!isSafePositiveInt(entry.amount)) return fail('invalid_amount', 'Opening balance must be more than ₹0')
      return ok(undefined)
    case 'REVERSAL':
      if (entry.id !== reversalIdFor(entry.reversesId)) return fail('invalid_input', 'Reversal id must be rev_<originalId>')
      if (!isSafePositiveInt(entry.amount)) return fail('invalid_amount', 'Reversal must be more than ₹0')
      return ok(undefined)
    case 'ADJUSTMENT':
      if (!isNonEmptyString(entry.reason)) return fail('reason_required', 'An adjustment needs a reason')
      if (!isSafePositiveInt(entry.amount)) return fail('invalid_amount', 'Adjustment must be more than ₹0')
      return ok(undefined)
    case 'MONTH_END_SNAPSHOT':
      if (!isMonthKey(entry.month)) return fail('invalid_input', `Invalid month "${entry.month}"`)
      if (entry.id !== snapshotIdFor(entry.customerId, entry.month)) {
        return fail('invalid_input', 'Snapshot id must be snap_<customerId>_<YYYY-MM>')
      }
      if (!Number.isSafeInteger(entry.closingBalance) || !Number.isSafeInteger(entry.entryCount)) {
        return fail('invalid_input', 'Snapshot values must be integers')
      }
      return ok(undefined)
  }
}

/** What the ledger needs to know about a trip an entry belongs to. */
export interface TripAccess {
  status: TripStatus
  /** User the trip is assigned to; a driver may only post on their own trip. */
  driverId?: string
}

export interface PostContext extends Actor {
  /** Looks up a trip by id; needed when an entry carries a tripId. */
  tripInfo?: (tripId: string) => TripAccess | undefined
}

const CAPABILITY_FOR: Record<LedgerEntry['type'], Capability> = {
  OPENING_BALANCE: 'customer.manage',
  SALE: 'sale.record',
  PAYMENT: 'payment.record',
  REVERSAL: 'entry.reverse',
  ADJUSTMENT: 'ledger.adjust',
  MONTH_END_SNAPSHOT: 'month.close',
}

export type PostStatus = 'saved' | 'already-saved'

export interface Posted<E extends LedgerEntry = LedgerEntry> {
  entries: LedgerEntry[]
  entry: E
  status: PostStatus
}

function forCustomer(book: readonly LedgerEntry[], customerId: string): LedgerEntry[] {
  return book.filter((e) => e.customerId === customerId)
}

function latestSnapshotOf(entries: readonly LedgerEntry[]): MonthEndSnapshot | undefined {
  let latest: MonthEndSnapshot | undefined
  for (const e of entries) {
    if (e.type === 'MONTH_END_SNAPSHOT' && (!latest || e.month > latest.month)) latest = e
  }
  return latest
}

function checkTrip(tripId: string | undefined, ctx: PostContext): Result<void> {
  if (tripId === undefined) {
    return ctx.actorRole === 'driver'
      ? fail('not_permitted', 'A driver records sales and payments only on their assigned trip')
      : ok(undefined)
  }
  const trip = ctx.tripInfo?.(tripId)
  if (trip === undefined) return fail('trip_not_found', `Trip ${tripId} not found`)
  if (trip.status === 'CLOSED') return fail('trip_closed', 'This trip is closed; its records are read-only')
  if (ctx.actorRole === 'driver' && trip.driverId !== ctx.actorId) {
    return fail('not_permitted', 'This trip is assigned to another driver')
  }
  return ok(undefined)
}

/**
 * Appends an entry if every rule passes. Never edits or removes an existing entry.
 * Re-sending an identical entry (double tap, retry after reconnect) returns "already-saved".
 */
export function postEntry<E extends LedgerEntry>(
  book: readonly LedgerEntry[],
  entry: E,
  ctx: PostContext,
): Result<Posted<E>> {
  const existing = book.find((e) => e.id === entry.id)
  if (existing) {
    if (canonical(existing) === canonical(entry)) {
      return ok({ entries: [...book], entry: existing as E, status: 'already-saved' })
    }
    switch (entry.type) {
      case 'REVERSAL':
        return fail('already_reversed', 'This entry has already been reversed')
      case 'OPENING_BALANCE':
        return fail('duplicate_opening_balance', 'This customer already has an opening balance')
      case 'MONTH_END_SNAPSHOT':
        return fail('month_closed', `${entry.month} is already closed for this customer`)
      default:
        return fail('id_conflict', `A different entry already uses id ${entry.id}`)
    }
  }

  if (entry.createdBy !== ctx.actorId) return fail('actor_mismatch', 'Entries must be created by the signed-in user')
  const allowed = requireCapability(ctx, CAPABILITY_FOR[entry.type])
  if (!allowed.ok) return allowed
  const shape = validateShape(entry)
  if (!shape.ok) return shape

  const own = forCustomer(book, entry.customerId)
  const append = (): Result<Posted<E>> => ok({ entries: [...book, entry], entry, status: 'saved' })

  if (entry.type === 'MONTH_END_SNAPSHOT') {
    if (entry.month >= monthOf(entry.date)) return fail('invalid_input', `${entry.month} has not ended yet`)
    return append()
  }

  const closedThrough = latestSnapshotOf(own)?.month
  if (closedThrough !== undefined && monthOf(entry.date) <= closedThrough) {
    return fail('month_closed', `${monthOf(entry.date)} is closed; date the entry in the open month`, {
      closedThrough,
    })
  }

  const opening = own.find((e) => e.type === 'OPENING_BALANCE')
  if (opening && entry.date < opening.date) {
    return fail('invalid_input', 'Entries cannot be dated before the opening balance')
  }

  switch (entry.type) {
    case 'OPENING_BALANCE':
      if (own.some(isFinancial)) return fail('opening_balance_not_first', 'The opening balance must be the first entry')
      return append()
    case 'SALE':
    case 'PAYMENT': {
      const trip = checkTrip(entry.tripId, ctx)
      return trip.ok ? append() : trip
    }
    case 'REVERSAL': {
      const original = own.find((e) => e.id === entry.reversesId)
      if (!original) return fail('reversal_target_missing', 'The entry to reverse was not found')
      if (!isFinancial(original) || original.type === 'REVERSAL') {
        return fail('cannot_reverse', 'Snapshots and reversals cannot be reversed')
      }
      if (entry.amount !== original.amount || entry.direction === directionOf(original)) {
        return fail('reversal_amount_mismatch', 'A reversal must mirror the original amount')
      }
      if ((original.type === 'SALE' || original.type === 'PAYMENT') && original.tripId !== undefined) {
        const trip = checkTrip(original.tripId, ctx)
        if (!trip.ok) return trip
      }
      return append()
    }
    case 'ADJUSTMENT':
      return append()
  }
}

// ---------------------------------------------------------------------------
// Balances, month end, passbook
// ---------------------------------------------------------------------------

function sumSigned(entries: readonly LedgerEntry[]): Paise {
  let total = 0
  for (const e of entries) if (isFinancial(e)) total += signedAmount(e)
  return total
}

/** Full recompute from entries. This always wins (D-09). */
export function recomputeBalance(book: readonly LedgerEntry[], customerId: string): Paise {
  return sumSigned(forCustomer(book, customerId))
}

export function latestSnapshot(book: readonly LedgerEntry[], customerId: string): MonthEndSnapshot | undefined {
  return latestSnapshotOf(forCustomer(book, customerId))
}

/** Cheap path: latest snapshot + entries dated after its month. Lets screens read only the open month. */
export function balanceViaSnapshot(book: readonly LedgerEntry[], customerId: string): Paise {
  const own = forCustomer(book, customerId)
  const snap = latestSnapshotOf(own)
  if (!snap) return sumSigned(own)
  return snap.closingBalance + sumSigned(own.filter((e) => monthOf(e.date) > snap.month))
}

export interface BalanceView {
  /** The balance to show: always the full recompute. */
  balance: Paise
  viaSnapshot: Paise
  snapshot?: MonthEndSnapshot
  /** True when the stored snapshot disagrees with a recompute of its month. */
  snapshotMismatch: boolean
}

export function customerBalance(book: readonly LedgerEntry[], customerId: string): BalanceView {
  const own = forCustomer(book, customerId)
  const snap = latestSnapshotOf(own)
  const balance = sumSigned(own)
  if (!snap) return { balance, viaSnapshot: balance, snapshotMismatch: false }
  const recomputedAtSnapshot = sumSigned(own.filter((e) => monthOf(e.date) <= snap.month))
  return {
    balance,
    viaSnapshot: balanceViaSnapshot(book, customerId),
    snapshot: snap,
    snapshotMismatch: recomputedAtSnapshot !== snap.closingBalance,
  }
}

/** Owner-only month-end close for one customer (C-TXT L69, D-08, D-12). */
export function closeMonth(
  book: readonly LedgerEntry[],
  input: { customerId: string; month: MonthKey; date: IsoDate; createdBy: string },
  ctx: PostContext,
): Result<Posted<MonthEndSnapshot>> {
  const included = forCustomer(book, input.customerId).filter((e) => isFinancial(e) && monthOf(e.date) <= input.month)
  const snapshot: MonthEndSnapshot = {
    id: snapshotIdFor(input.customerId, input.month),
    customerId: input.customerId,
    date: input.date,
    createdBy: input.createdBy,
    type: 'MONTH_END_SNAPSHOT',
    month: input.month,
    closingBalance: sumSigned(included),
    entryCount: included.length,
  }
  return postEntry(book, snapshot, ctx)
}

/** The seven ledger columns exactly as the source names them (C-TXT L63). */
export const PASSBOOK_COLUMNS = [
  'Date',
  'TotalItemsInKG',
  'ItemPerKG',
  'TotalAmount',
  'PaidAmount',
  'BalanceAmount',
  'Comments',
] as const

/** One passbook row, one field per source column. */
export interface PassbookRow {
  entryId: string
  type: LedgerEntry['type']
  date: IsoDate
  totalItemsGrams?: Grams
  itemRatePaisePerKg?: PaisePerKg
  totalAmount?: Paise
  paidAmount?: Paise
  balance: Paise
  comments: string
}

const sortKey = (e: LedgerEntry): string => (e.type === 'MONTH_END_SNAPSHOT' ? `${e.month}-99` : e.date)

export function passbook(book: readonly LedgerEntry[], customerId: string): PassbookRow[] {
  const own = forCustomer(book, customerId)
  const byId = new Map(own.map((e) => [e.id, e]))
  const ordered = [...own].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0))
  let running = 0
  return ordered.map((e): PassbookRow => {
    const row: PassbookRow = { entryId: e.id, type: e.type, date: e.date, balance: 0, comments: e.comment ?? '' }
    switch (e.type) {
      case 'OPENING_BALANCE':
        running += signedAmount(e)
        row.comments = e.comment ?? 'Initial Balance'
        break
      case 'SALE':
        running += signedAmount(e)
        row.totalItemsGrams = e.grams
        row.itemRatePaisePerKg = e.ratePaisePerKg
        row.totalAmount = e.amount
        break
      case 'PAYMENT':
        running += signedAmount(e)
        row.paidAmount = e.amount
        row.comments = e.comment ?? (e.reference ? `${PAYMENT_COMMENT[e.method]} ${e.reference}` : PAYMENT_COMMENT[e.method])
        break
      case 'REVERSAL': {
        running += signedAmount(e)
        const original = byId.get(e.reversesId)
        if (original?.type === 'PAYMENT') row.paidAmount = -e.amount
        else row.totalAmount = signedAmount(e)
        row.comments = `Reversal of ${original?.type ?? e.reversesId}${e.reason ? `: ${e.reason}` : ''}`
        break
      }
      case 'ADJUSTMENT':
        running += signedAmount(e)
        row.totalAmount = signedAmount(e)
        row.comments = `Adjustment: ${e.reason}`
        break
      case 'MONTH_END_SNAPSHOT':
        row.comments =
          e.closingBalance === running ? 'MonthEndBalance' : `MonthEndBalance (stored ${e.closingBalance} paise differs)`
        break
    }
    row.balance = running
    return row
  })
}
