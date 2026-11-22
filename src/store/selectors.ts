/** Read-only views of the state for screens. Recomputed on render; the demo data is small. */
import {
  can,
  computeProfit,
  customerBalance,
  isFinancial,
  passbook,
  summarizeTrip,
  type Capability,
  type Customer,
  type IsoDate,
  type Paise,
  type PassbookRow,
  type ProfitReport,
  type Role,
  type Trip,
  type TripSummary,
} from '../domain'
import { actorOf } from './commands'
import type { AppState, AppUser } from './state'

export function currentUser(s: AppState): AppUser {
  return s.users.find((u) => u.id === s.actorId) ?? (s.users[0] as AppUser)
}

export function roleOf(s: AppState): Role {
  return currentUser(s).role
}

export function allowed(s: AppState, capability: Capability): boolean {
  return can(roleOf(s), capability)
}

/** Trips this person may see: everyone's for owner and manager, only their own for a driver. */
export function visibleTrips(s: AppState): Trip[] {
  const actor = actorOf(s)
  const trips = can(actor.actorRole, 'trip.viewAll') ? s.trips : s.trips.filter((t) => t.driverId === actor.actorId)
  return [...trips].sort((a, b) => (a.date === b.date ? a.vehicleNumber.localeCompare(b.vehicleNumber) : a.date < b.date ? 1 : -1))
}

export function tripById(s: AppState, id: string | undefined): Trip | undefined {
  return id ? visibleTrips(s).find((t) => t.id === id) : undefined
}

export function tripSummaryOf(s: AppState, trip: Trip): TripSummary {
  return summarizeTrip({ trip, events: s.tripEvents, ledger: s.ledger })
}

export function tripProfitOf(s: AppState, trip: Trip): ProfitReport {
  return computeProfit(tripSummaryOf(s, trip))
}

export function openTripsToday(s: AppState, today: IsoDate): Trip[] {
  return visibleTrips(s).filter((t) => t.status === 'OPEN' && t.date === today)
}

export function customerById(s: AppState, id: string | undefined): Customer | undefined {
  return id ? s.customers.find((c) => c.id === id) : undefined
}

export function balanceOf(s: AppState, customerId: string): Paise {
  return customerBalance(s.ledger, customerId).balance
}

export function passbookOf(s: AppState, customerId: string): PassbookRow[] {
  return passbook(s.ledger, customerId)
}

/** Entries that have been reversed (their ids), to mark them in lists. */
export function reversedIds(s: AppState): Set<string> {
  return new Set(s.ledger.flatMap((e) => (e.type === 'REVERSAL' ? [e.reversesId] : [])))
}

export function reversedTripEventIds(s: AppState): Set<string> {
  return new Set(s.tripEvents.flatMap((e) => (e.type === 'REVERSAL' ? [e.reversesId] : [])))
}

/** Customers with their balance, most recently sold-to first (then by name). */
export function customersWithBalance(s: AppState): { customer: Customer; balance: Paise; lastSale?: IsoDate }[] {
  const lastSale = new Map<string, IsoDate>()
  for (const e of s.ledger) {
    if (e.type === 'SALE' && (lastSale.get(e.customerId) ?? '') < e.date) lastSale.set(e.customerId, e.date)
  }
  return s.customers
    .map((customer) => {
      const last = lastSale.get(customer.id)
      return last ? { customer, balance: balanceOf(s, customer.id), lastSale: last } : { customer, balance: balanceOf(s, customer.id) }
    })
    .sort((a, b) =>
      (a.lastSale ?? '') === (b.lastSale ?? '')
        ? a.customer.shopName.localeCompare(b.customer.shopName, undefined, { numeric: true })
        : (a.lastSale ?? '') < (b.lastSale ?? '')
          ? 1
          : -1,
    )
}

export function totalToCollect(s: AppState): Paise {
  return s.customers.reduce((sum, c) => sum + Math.max(0, balanceOf(s, c.id)), 0)
}

/** Payments dated today that have not been reversed. */
export function receivedOn(s: AppState, date: IsoDate): Paise {
  const reversed = reversedIds(s)
  return s.ledger.reduce((sum, e) => (isFinancial(e) && e.type === 'PAYMENT' && e.date === date && !reversed.has(e.id) ? sum + e.amount : sum), 0)
}

export function userName(s: AppState, id: string | undefined): string | undefined {
  return id ? s.users.find((u) => u.id === id)?.name : undefined
}
