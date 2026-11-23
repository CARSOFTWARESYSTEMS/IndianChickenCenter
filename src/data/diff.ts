/**
 * What a command changed, as Firestore writes (P5). Commands stay pure functions of AppState (src/store/commands.ts);
 * the cloud store runs a command, compares the state before and after, and saves the difference.
 *
 * Posted records are only ever added (append-only), so "new" is "an id that was not there before".
 * The only records that change are customers (details), settings, and a trip when it closes.
 */
import { fail, formatKg, formatRupees, ok, type LedgerEntry, type OpeningBalanceEntry, type Result, type TripEvent } from '../domain'
import type { AppState } from '../store/state'
import {
  closeTripWrites,
  customerWrites,
  ledgerEntryWrites,
  newCustomerWrites,
  openTripWrites,
  settingsWrites,
  tripEventWrites,
  vehicleWrites,
  type DocWrite,
} from './docs'

/** What a save was about, for the "Saved on phone / Needs attention" list. */
export type ChangeKind =
  | 'sale'
  | 'payment'
  | 'reversal'
  | 'adjustment'
  | 'monthEnd'
  | 'customer'
  | 'tripOpen'
  | 'tripEvent'
  | 'tripClose'
  | 'settings'
  | 'vehicle'

export interface Change {
  kind: ChangeKind
  /** Names and numbers, in no particular language (the screen adds the words). */
  detail: string
  /**
   * Writes to save in order. Each inner list is one batched write: atomic, and small enough for the rules'
   * limit on document look-ups per request. A new trip goes first and alone, because the rules for its events
   * read the trip as it was before the batch.
   */
  batches: DocWrite[][]
}

/** At most this many records per batch (each record's rules look up about three documents; the limit is 20). */
export const RECORDS_PER_BATCH = 4

function newById<T extends { id: string }>(before: readonly T[], after: readonly T[]): T[] {
  const seen = new Set(before.map((x) => x.id))
  return after.filter((x) => !seen.has(x.id))
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function describe(prev: AppState, next: AppState, entries: LedgerEntry[], events: TripEvent[]): { kind: ChangeKind; detail: string } {
  const shop = (id: string) => next.customers.find((c) => c.id === id)?.shopName ?? id
  const vehicle = (tripId: string) => next.trips.find((t) => t.id === tripId)?.vehicleNumber ?? tripId
  const first = entries[0]
  if (first) {
    switch (first.type) {
      case 'SALE':
        return { kind: 'sale', detail: `${shop(first.customerId)} · ${formatKg(first.grams)}` }
      case 'PAYMENT':
        return { kind: 'payment', detail: `${shop(first.customerId)} · ${formatRupees(first.amount)}` }
      case 'REVERSAL':
        return { kind: 'reversal', detail: shop(first.customerId) }
      case 'ADJUSTMENT':
        return { kind: 'adjustment', detail: shop(first.customerId) }
      case 'MONTH_END_SNAPSHOT':
        return { kind: 'monthEnd', detail: `${first.month} · ${entries.length}` }
      case 'OPENING_BALANCE':
        return { kind: 'customer', detail: shop(first.customerId) }
    }
  }
  const closed = next.trips.find((t) => t.status === 'CLOSED' && prev.trips.find((p) => p.id === t.id)?.status === 'OPEN')
  if (closed) return { kind: 'tripClose', detail: closed.vehicleNumber }
  const opened = newById(prev.trips, next.trips)[0]
  if (opened) return { kind: 'tripOpen', detail: opened.vehicleNumber }
  const event = events[0]
  if (event) return { kind: 'tripEvent', detail: `${vehicle(event.tripId)} · ${event.type}` }
  const customer = next.customers.find((c) => prev.customers.find((p) => p.id === c.id) !== c)
  if (customer) return { kind: 'customer', detail: customer.shopName }
  if (prev.settings !== next.settings) return { kind: 'settings', detail: next.settings.businessName }
  return { kind: 'vehicle', detail: next.vehicles.filter((v) => !prev.vehicles.includes(v)).join(', ') }
}

/** The writes that turn `prev` into `next`, or nothing when only screen-side state (who is acting) changed. */
export function changesBetween(prev: AppState, next: AppState): Result<Change | undefined> {
  const actor = next.actorId
  if (prev.bills !== next.bills || prev.billCounters !== next.billCounters) {
    return fail('invalid_input', 'Bills are numbered online through issueBill, not saved with other changes')
  }
  const first: DocWrite[][] = []
  const records: DocWrite[][] = []

  for (const v of next.vehicles) if (!prev.vehicles.includes(v)) first.push(vehicleWrites(v, actor))

  for (const trip of newById(prev.trips, next.trips)) {
    const writes = openTripWrites(trip)
    if (!writes.ok) return writes
    first.push(writes.value)
  }
  for (const trip of next.trips) {
    const before = prev.trips.find((t) => t.id === trip.id)
    if (!before || before === trip) continue
    if (before.status === 'OPEN' && trip.status === 'CLOSED') {
      const writes = closeTripWrites(trip)
      if (!writes.ok) return writes
      records.push(writes.value)
    } else {
      return fail('invalid_input', `Trip ${trip.id} changed in a way the cloud does not store`)
    }
  }

  const entries = newById(prev.ledger, next.ledger)
  const openings = new Map(
    entries.filter((e): e is OpeningBalanceEntry => e.type === 'OPENING_BALANCE').map((e) => [e.customerId, e]),
  )
  for (const customer of next.customers) {
    const before = prev.customers.find((c) => c.id === customer.id)
    if (!before) records.push(newCustomerWrites(customer, openings.get(customer.id)))
    else if (before !== customer) records.push(customerWrites(customer))
  }
  if (prev.settings !== next.settings) records.push(settingsWrites(next.settings, actor))

  const events = newById(prev.tripEvents, next.tripEvents)
  for (const event of events) records.push(tripEventWrites(event))
  for (const entry of entries) {
    if (entry.type === 'OPENING_BALANCE' && !prev.customers.some((c) => c.id === entry.customerId)) {
      continue // saved with its new customer
    }
    records.push(ledgerEntryWrites(entry))
  }

  if (first.length === 0 && records.length === 0) return ok(undefined)
  const batches = [...(first.length ? [first.flat()] : []), ...chunk(records, RECORDS_PER_BATCH).map((group) => group.flat())]
  return ok({ ...describe(prev, next, entries, events), batches })
}
