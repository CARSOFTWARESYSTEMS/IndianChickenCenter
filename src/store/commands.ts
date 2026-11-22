/**
 * Commands: each takes the current state and returns the next one, using only engine functions,
 * so every rule (roles, stock, rounding, append-only) applies exactly as in the tests.
 */
import {
  closeMonth,
  closeTrip,
  isFinancial,
  makeCustomer,
  makeFuelByAmount,
  makeFuelByLitres,
  makeOpeningBalance,
  makePayment,
  makeReversal,
  makeTripReversal,
  monthOf,
  lastDayOfMonth,
  normalizeVehicleNumber,
  ok,
  fail,
  openTrip,
  postEntry,
  postTripEvent,
  recordShopSale,
  recordTripSale,
  requireCapability,
  snapshotIdFor,
  updateCustomer,
  validateSettings,
  type Actor,
  type BusinessSettings,
  type Customer,
  type IsoDate,
  type LedgerEntry,
  type MonthKey,
  type Paise,
  type PaisePerKg,
  type PaisePerLitre,
  type PaymentMethod,
  type PostContext,
  type Result,
  type SaleCommand,
  type ShopSaleCommand,
  type TripAccess,
  type TripEvent,
  type Millilitres,
} from '../domain'
import type { AppState } from './state'
import type { Next } from './store'

export function actorOf(s: AppState): Actor {
  const user = s.users.find((u) => u.id === s.actorId) ?? s.users[0]
  if (!user) throw new Error('No users in state')
  return { actorId: user.id, actorRole: user.role }
}

function tripInfo(s: AppState): (tripId: string) => TripAccess | undefined {
  return (tripId) => {
    const trip = s.trips.find((t) => t.id === tripId)
    if (!trip) return undefined
    return trip.driverId === undefined ? { status: trip.status } : { status: trip.status, driverId: trip.driverId }
  }
}

function postCtx(s: AppState): PostContext {
  return { ...actorOf(s), tripInfo: tripInfo(s) }
}

const done = <T>(state: AppState, value: T): Result<Next<T>> => ok({ state, value })

export function setActor(userId: string) {
  return (s: AppState): Result<Next<void>> => done({ ...s, actorId: userId }, undefined)
}


// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export function addCustomer(input: {
  id: string
  shopName: string
  name?: string
  phone?: string
  openingBalance?: Paise
  date: IsoDate
}) {
  return (s: AppState): Result<Next<{ customer: Customer; duplicateOf?: Customer }>> => {
    const actor = actorOf(s)
    const allowed = requireCapability(actor, 'customer.manage')
    if (!allowed.ok) return allowed
    const made = makeCustomer(s.customers, {
      id: input.id,
      shopName: input.shopName,
      createdAt: input.date,
      createdBy: actor.actorId,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    })
    if (!made.ok) return made
    let ledger = s.ledger
    if (input.openingBalance !== undefined && input.openingBalance > 0) {
      const opening = makeOpeningBalance({ customerId: input.id, date: input.date, createdBy: actor.actorId, amount: input.openingBalance })
      if (!opening.ok) return opening
      const posted = postEntry(ledger, opening.value, postCtx(s))
      if (!posted.ok) return posted
      ledger = posted.value.entries
    }
    const value = made.value.duplicatePhoneOf
      ? { customer: made.value.customer, duplicateOf: made.value.duplicatePhoneOf }
      : { customer: made.value.customer }
    return done({ ...s, customers: [...s.customers, made.value.customer], ledger }, value)
  }
}

export function editCustomer(id: string, patch: { shopName: string; name: string; phone: string }) {
  return (s: AppState): Result<Next<{ duplicateOf?: Customer }>> => {
    const allowed = requireCapability(actorOf(s), 'customer.manage')
    if (!allowed.ok) return allowed
    const updated = updateCustomer(s.customers, id, patch)
    if (!updated.ok) return updated
    const customers = s.customers.map((c) => (c.id === id ? updated.value.customer : c))
    return done({ ...s, customers }, updated.value.duplicatePhoneOf ? { duplicateOf: updated.value.duplicatePhoneOf } : {})
  }
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

export type FuelInput =
  | { id: string; mode: 'LITRES'; millilitres: Millilitres; pricePaisePerLitre: PaisePerLitre }
  | { id: string; mode: 'AMOUNT'; amount: Paise; pricePaisePerLitre: PaisePerLitre }

function makeFuel(tripId: string, date: IsoDate, createdBy: string, fuel: FuelInput): Result<TripEvent> {
  const base = { id: fuel.id, tripId, date, createdBy }
  return fuel.mode === 'LITRES'
    ? makeFuelByLitres({ ...base, millilitres: fuel.millilitres, pricePaisePerLitre: fuel.pricePaisePerLitre })
    : makeFuelByAmount({ ...base, amount: fuel.amount, pricePaisePerLitre: fuel.pricePaisePerLitre })
}

/** Starting Point: opens the trip and, when given, records the diesel fill in the same step. */
export function startTrip(input: {
  id: string
  date: IsoDate
  vehicleNumber: string
  driverId?: string
  driverName?: string
  defaultSaleRatePaisePerKg: PaisePerKg
  fuel?: FuelInput
}) {
  return (s: AppState): Result<Next<string>> => {
    const actor = actorOf(s)
    const trip = openTrip(
      s.trips,
      {
        id: input.id,
        date: input.date,
        createdBy: actor.actorId,
        vehicleNumber: input.vehicleNumber,
        defaultSaleRatePaisePerKg: input.defaultSaleRatePaisePerKg,
        ...(input.driverId ? { driverId: input.driverId } : {}),
        ...(input.driverName ? { driverName: input.driverName } : {}),
      },
      actor,
    )
    if (!trip.ok) return trip
    let events = s.tripEvents
    if (input.fuel) {
      const fuel = makeFuel(trip.value.id, input.date, actor.actorId, input.fuel)
      if (!fuel.ok) return fuel
      const posted = postTripEvent(trip.value, events, fuel.value, actor)
      if (!posted.ok) return posted
      events = posted.value.events
    }
    const vehicles = s.vehicles.includes(trip.value.vehicleNumber) ? s.vehicles : [...s.vehicles, trip.value.vehicleNumber]
    return done({ ...s, trips: [...s.trips, trip.value], tripEvents: events, vehicles }, trip.value.id)
  }
}

export function addFuel(tripId: string, date: IsoDate, fuel: FuelInput) {
  return (s: AppState): Result<Next<void>> => {
    const event = makeFuel(tripId, date, actorOf(s).actorId, fuel)
    return event.ok ? addTripEvent(event.value)(s) : event
  }
}

/** Any built trip event: loading, order, expense, wastage, default-rate change. */
export function addTripEvent(event: TripEvent) {
  return (s: AppState): Result<Next<void>> => {
    const trip = s.trips.find((t) => t.id === event.tripId)
    if (!trip) return fail('trip_not_found', 'Trip not found')
    const posted = postTripEvent(trip, s.tripEvents, event, actorOf(s))
    if (!posted.ok) return posted
    return done({ ...s, tripEvents: posted.value.events }, undefined)
  }
}

export interface PaidNow {
  id: string
  amount: Paise
  method: PaymentMethod
  reference?: string
}

/** One sale (and, if paid on the spot, its payment) on a trip. Both are saved or neither. */
export function recordSale(tripId: string, cmd: SaleCommand, paid?: PaidNow) {
  return (s: AppState): Result<Next<{ oversold: boolean }>> => {
    const trip = s.trips.find((t) => t.id === tripId)
    if (!trip) return fail('trip_not_found', 'Trip not found')
    const actor = actorOf(s)
    const sale = recordTripSale({ trip, events: s.tripEvents, ledger: s.ledger }, cmd, { ...actor, policy: s.settings.roundingPolicy })
    if (!sale.ok) return sale
    let ledger = sale.value.ledger
    if (paid && paid.amount > 0) {
      const payment = makePayment({
        id: paid.id,
        customerId: cmd.customerId,
        date: cmd.date,
        createdBy: actor.actorId,
        amount: paid.amount,
        method: paid.method,
        tripId,
        ...(paid.reference ? { reference: paid.reference } : {}),
      })
      if (!payment.ok) return payment
      const posted = postEntry(ledger, payment.value, postCtx(s))
      if (!posted.ok) return posted
      ledger = posted.value.entries
    }
    return done({ ...s, ledger }, { oversold: sale.value.oversold })
  }
}

export function shopSale(tripId: string, cmd: ShopSaleCommand) {
  return (s: AppState): Result<Next<void>> => {
    const trip = s.trips.find((t) => t.id === tripId)
    if (!trip) return fail('trip_not_found', 'Trip not found')
    const sold = recordShopSale({ trip, events: s.tripEvents, ledger: s.ledger }, cmd, { ...actorOf(s), policy: s.settings.roundingPolicy })
    if (!sold.ok) return sold
    return done({ ...s, tripEvents: sold.value.events }, undefined)
  }
}

export function reverseTripEvent(eventId: string, reason: string, date: IsoDate) {
  return (s: AppState): Result<Next<void>> => {
    const original = s.tripEvents.find((e) => e.id === eventId)
    if (!original) return fail('reversal_target_missing', 'Entry not found')
    const reversal = makeTripReversal(original, { date, createdBy: actorOf(s).actorId, ...(reason.trim() ? { reason: reason.trim() } : {}) })
    return reversal.ok ? addTripEvent(reversal.value)(s) : reversal
  }
}

/** Closing needs the network and nothing from this phone still waiting to reach the cloud (D-11). */
export function finishTrip(tripId: string, date: IsoDate, online: boolean, hasPendingWrites = false) {
  return (s: AppState): Result<Next<void>> => {
    const trip = s.trips.find((t) => t.id === tripId)
    if (!trip) return fail('trip_not_found', 'Trip not found')
    const closed = closeTrip(
      { trip, events: s.tripEvents, ledger: s.ledger },
      { ...actorOf(s), closedOn: date, online, hasPendingWrites },
    )
    if (!closed.ok) return closed
    return done({ ...s, trips: s.trips.map((t) => (t.id === tripId ? closed.value : t)) }, undefined)
  }
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export function recordPayment(input: {
  id: string
  customerId: string
  date: IsoDate
  amount: Paise
  method: PaymentMethod
  reference?: string
  tripId?: string
}) {
  return (s: AppState): Result<Next<void>> => {
    const payment = makePayment({
      id: input.id,
      customerId: input.customerId,
      date: input.date,
      createdBy: actorOf(s).actorId,
      amount: input.amount,
      method: input.method,
      ...(input.reference ? { reference: input.reference } : {}),
      ...(input.tripId ? { tripId: input.tripId } : {}),
    })
    if (!payment.ok) return payment
    const posted = postEntry(s.ledger, payment.value, postCtx(s))
    if (!posted.ok) return posted
    return done({ ...s, ledger: posted.value.entries }, undefined)
  }
}

export function reverseLedgerEntry(entryId: string, reason: string, date: IsoDate) {
  return (s: AppState): Result<Next<void>> => {
    const original = s.ledger.find((e) => e.id === entryId)
    if (!original || !isFinancial(original)) return fail('reversal_target_missing', 'Entry not found')
    const reversal = makeReversal(original, { date, createdBy: actorOf(s).actorId, ...(reason.trim() ? { reason: reason.trim() } : {}) })
    if (!reversal.ok) return reversal
    const posted = postEntry(s.ledger, reversal.value, postCtx(s))
    if (!posted.ok) return posted
    return done({ ...s, ledger: posted.value.entries }, undefined)
  }
}

/** Month-end close for every customer with entries up to that month (owner only). Returns how many were closed. */
export function closeMonthForAll(month: MonthKey, date: IsoDate) {
  return (s: AppState): Result<Next<number>> => {
    const ctx = postCtx(s)
    const allowed = requireCapability(ctx, 'month.close')
    if (!allowed.ok) return allowed
    const end = lastDayOfMonth(month)
    let ledger: LedgerEntry[] = s.ledger
    let count = 0
    for (const customer of s.customers) {
      // A cloud window may not hold a quiet customer's old entries, but it holds their last snapshot.
      const hasEntries = ledger.some(
        (e) => e.customerId === customer.id && e.date <= end && (isFinancial(e) || s.ledgerWindow !== undefined),
      )
      const alreadyClosed = ledger.some((e) => e.id === snapshotIdFor(customer.id, month))
      if (!hasEntries || alreadyClosed) continue
      const closed = closeMonth(ledger, { customerId: customer.id, month, date, createdBy: ctx.actorId }, ctx, s.ledgerWindow)
      if (!closed.ok) return closed
      ledger = closed.value.entries
      count++
    }
    return done({ ...s, ledger }, count)
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function saveSettings(settings: BusinessSettings) {
  return (s: AppState): Result<Next<void>> => {
    const allowed = requireCapability(actorOf(s), 'settings.edit')
    if (!allowed.ok) return allowed
    const valid = validateSettings(settings)
    if (!valid.ok) return valid
    return done({ ...s, settings: valid.value }, undefined)
  }
}

export function addVehicle(vehicle: string) {
  return (s: AppState): Result<Next<string>> => {
    const v = normalizeVehicleNumber(vehicle)
    if (!v.ok) return v
    return done(s.vehicles.includes(v.value) ? s : { ...s, vehicles: [...s.vehicles, v.value] }, v.value)
  }
}

export { monthOf }
