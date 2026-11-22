/**
 * One trip in the owner's order (C-TXT L11–42): Starting Point (fuel) → Loading → Orders → Distribution → Expenses → Close.
 * Trip events are append-only; corrections are REVERSAL events. Customer sales live in the ledger (one SALE entry each).
 *
 * Gate A answers built in here (22 Nov 2026):
 *  U-06 one trip a day per vehicle, several vehicles, vehicle number on every trip ·
 *  U-05 kg left at the end are sold at the shop (SHOP_SALE) or shown as wastage ·
 *  U-13 labour per person (Driver, Labour 1–5, names change per trip) or one total ·
 *  D-03 (changed) each trip has a default selling rate; the owner can change the rate per customer.
 */
import type { Actor, TripStatus } from './common'
import { isIsoDate, type IsoDate } from './dates'
import {
  isFinancial,
  isPaymentMethod,
  makeSale,
  postEntry,
  reversalIdFor,
  type LedgerEntry,
  type PaymentMethod,
  type PostStatus,
  type SaleEntry,
} from './ledger'
import { can, requireCapability, type Capability } from './permissions'
import { fail, ok, type Result } from './result'
import { isRoundingPolicy, postAmount, toExactPaise, type RoundingPolicyId } from './rounding'
import {
  divFloor,
  isSafeNonNegativeInt,
  isSafePositiveInt,
  multiplyExact,
  type Grams,
  type MilliPaise,
  type Millilitres,
  type Paise,
  type PaisePerKg,
  type PaisePerLitre,
} from './units'
import { canonical, isNonEmptyString } from './util'

export const EXPENSE_CATEGORIES = ['LABOUR', 'MAINTENANCE', 'FOOD', 'OTHER'] as const
/** Fuel is not an expense category: the Starting Point fuel entry is the fuel expense (no duplicate, F-EXP-03). */
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export const LABOUR_SLOTS = ['DRIVER', 'LABOUR_1', 'LABOUR_2', 'LABOUR_3', 'LABOUR_4', 'LABOUR_5'] as const
export type LabourSlot = (typeof LABOUR_SLOTS)[number]

export interface TripCloseSummary {
  loadedGrams: Grams
  soldGrams: Grams
  shopSoldGrams: Grams
  wastageGrams: Grams
  purchasePaise: Paise
  salesPaise: Paise
  operatingPaise: Paise
}

export interface Trip {
  id: string
  date: IsoDate
  status: TripStatus
  createdBy: string
  /** Normalised registration, e.g. "KA21AB1234". One trip per vehicle per day. */
  vehicleNumber: string
  /** App user the trip is assigned to (driver role). */
  driverId?: string
  /** Driver's name for this trip; people change from trip to trip. */
  driverName?: string
  /** Selling rate set when the trip opens; later changes are DEFAULT_RATE events. */
  defaultSaleRatePaisePerKg?: PaisePerKg
  closedBy?: string
  closedOn?: IsoDate
  closeSummary?: TripCloseSummary
}

interface TripEventBase {
  id: string
  tripId: string
  date: IsoDate
  createdBy: string
  note?: string
}

export interface FuelEvent extends TripEventBase {
  type: 'FUEL'
  fuelType: 'DIESEL'
  /** LITRES: litres × price gives the amount. AMOUNT: the pump amount is entered and litres are derived. */
  entryMode: 'LITRES' | 'AMOUNT'
  millilitres: Millilitres
  pricePaisePerLitre: PaisePerLitre
  amount: Paise
}

export interface LoadingEvent extends TripEventBase {
  type: 'LOADING'
  loadingPoint?: string
  grams: Grams
  ratePaisePerKg: PaisePerKg
  exactMilliPaise: MilliPaise
  amount: Paise
}

export interface OrderEvent extends TripEventBase {
  type: 'ORDER'
  customerId: string
  grams: Grams
  ratePaisePerKg: PaisePerKg
  amount: Paise
}

export interface ExpenseEvent extends TripEventBase {
  type: 'EXPENSE'
  category: ExpenseCategory
  /** Per-person labour line. Leave out for one labour total. A trip uses one style, not both. */
  slot?: LabourSlot
  /** Who worked this trip (names change per trip). */
  workerName?: string
  amount: Paise
}

/** Weight lost in transit, shown at close. */
export interface WastageEvent extends TripEventBase {
  type: 'WASTAGE'
  grams: Grams
}

/** Changes the trip's default selling rate (owner or manager). The latest one wins. */
export interface DefaultRateEvent extends TripEventBase {
  type: 'DEFAULT_RATE'
  ratePaisePerKg: PaisePerKg
}

/** Kg left at the end of the trip, sold at the shop (U-05). Counts as sales; no customer ledger. */
export interface ShopSaleEvent extends TripEventBase {
  type: 'SHOP_SALE'
  grams: Grams
  ratePaisePerKg: PaisePerKg
  exactMilliPaise: MilliPaise
  amount: Paise
  policyId: RoundingPolicyId
  method: PaymentMethod
  oversellConfirmed?: true
}

export interface TripReversalEvent extends TripEventBase {
  type: 'REVERSAL'
  reversesId: string
  reason?: string
}

export type TripEvent =
  | FuelEvent
  | LoadingEvent
  | OrderEvent
  | ExpenseEvent
  | WastageEvent
  | DefaultRateEvent
  | ShopSaleEvent
  | TripReversalEvent

const EVENT_CAPABILITY: Record<TripEvent['type'], Capability> = {
  FUEL: 'trip.record',
  LOADING: 'purchase.record',
  ORDER: 'trip.record',
  EXPENSE: 'trip.record',
  WASTAGE: 'trip.record',
  DEFAULT_RATE: 'trip.setDefaultRate',
  SHOP_SALE: 'sale.record',
  REVERSAL: 'entry.reverse',
}

// ---------------------------------------------------------------------------
// Opening a trip
// ---------------------------------------------------------------------------

const VEHICLE = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/
const BH_VEHICLE = /^\d{2}BH\d{4}[A-Z]{1,2}$/

/** "ka-21 ab 1234" → "KA21AB1234". Accepts state series and BH series numbers. */
export function normalizeVehicleNumber(input: string): Result<string> {
  const v = input.toUpperCase().replace(/[\s-]/g, '')
  if (!VEHICLE.test(v) && !BH_VEHICLE.test(v)) return fail('invalid_input', `"${input}" is not a vehicle registration number`)
  return ok(v)
}

export interface OpenTripInput {
  id: string
  date: IsoDate
  createdBy: string
  vehicleNumber: string
  driverId?: string
  driverName?: string
  defaultSaleRatePaisePerKg?: PaisePerKg
}

export function openTrip(existing: readonly Trip[], input: OpenTripInput, actor: Actor): Result<Trip> {
  const allowed = requireCapability(actor, 'trip.open')
  if (!allowed.ok) return allowed
  if (input.createdBy !== actor.actorId) return fail('actor_mismatch', 'Trips must be opened by the signed-in user')
  if (!isNonEmptyString(input.id)) return fail('invalid_input', 'Trip needs an id')
  if (!isIsoDate(input.date)) return fail('invalid_input', `Invalid date "${input.date}"`)
  const vehicle = normalizeVehicleNumber(input.vehicleNumber)
  if (!vehicle.ok) return vehicle
  if (existing.some((t) => t.id === input.id)) return fail('id_conflict', `Trip id ${input.id} already exists`)
  if (existing.some((t) => t.vehicleNumber === vehicle.value && t.date === input.date)) {
    return fail('duplicate_trip', `${vehicle.value} already has a trip on ${input.date}`)
  }
  if (input.defaultSaleRatePaisePerKg !== undefined && !isSafePositiveInt(input.defaultSaleRatePaisePerKg)) {
    return fail('invalid_rate', 'Default rate must be more than ₹0/kg')
  }
  const trip: Trip = {
    id: input.id,
    date: input.date,
    status: 'OPEN',
    createdBy: input.createdBy,
    vehicleNumber: vehicle.value,
  }
  if (input.driverId !== undefined) trip.driverId = input.driverId
  if (input.driverName !== undefined) trip.driverName = input.driverName
  if (input.defaultSaleRatePaisePerKg !== undefined) trip.defaultSaleRatePaisePerKg = input.defaultSaleRatePaisePerKg
  return ok(trip)
}

// ---------------------------------------------------------------------------
// Event builders
// ---------------------------------------------------------------------------

interface EventInput {
  id: string
  tripId: string
  date: IsoDate
  createdBy: string
  note?: string
}

function eventBase(input: EventInput): TripEventBase {
  const b: TripEventBase = { id: input.id, tripId: input.tripId, date: input.date, createdBy: input.createdBy }
  if (input.note !== undefined) b.note = input.note
  return b
}

/** Fuel by litres: amount = litres × price, exact paise (F-FUEL-01). */
export function makeFuelByLitres(
  input: EventInput & { millilitres: Millilitres; pricePaisePerLitre: PaisePerLitre },
): Result<FuelEvent> {
  if (!isSafePositiveInt(input.millilitres)) return fail('invalid_quantity', 'Litres must be more than 0')
  if (!isSafePositiveInt(input.pricePaisePerLitre)) return fail('invalid_rate', 'Price per litre must be more than ₹0')
  const exact = multiplyExact(input.millilitres, input.pricePaisePerLitre)
  if (exact === null) return fail('invalid_amount', 'Fuel amount is too large')
  return ok({
    ...eventBase(input),
    type: 'FUEL',
    fuelType: 'DIESEL',
    entryMode: 'LITRES',
    millilitres: input.millilitres,
    pricePaisePerLitre: input.pricePaisePerLitre,
    amount: toExactPaise(exact),
  })
}

/** Fuel by pump amount (₹8,000 in the source): the amount entered wins; litres are derived, rounded to the nearest mL. */
export function makeFuelByAmount(
  input: EventInput & { amount: Paise; pricePaisePerLitre: PaisePerLitre },
): Result<FuelEvent> {
  if (!isSafePositiveInt(input.amount)) return fail('invalid_amount', 'Fuel amount must be more than ₹0')
  if (!isSafePositiveInt(input.pricePaisePerLitre)) return fail('invalid_rate', 'Price per litre must be more than ₹0')
  return ok({
    ...eventBase(input),
    type: 'FUEL',
    fuelType: 'DIESEL',
    entryMode: 'AMOUNT',
    millilitres: litresForAmount(input.amount, input.pricePaisePerLitre),
    pricePaisePerLitre: input.pricePaisePerLitre,
    amount: input.amount,
  })
}

function litresForAmount(amount: Paise, price: PaisePerLitre): Millilitres {
  return divFloor(amount * 1_000 * 2 + price, price * 2) // round half up: (2·a·1000 + p) / 2p
}

export function makeLoading(
  input: EventInput & { grams: Grams; ratePaisePerKg: PaisePerKg; loadingPoint?: string },
): Result<LoadingEvent> {
  if (!isSafePositiveInt(input.grams)) return fail('invalid_quantity', 'Loaded weight must be more than 0 kg')
  if (!isSafePositiveInt(input.ratePaisePerKg)) return fail('invalid_rate', 'Rate must be more than ₹0/kg')
  const exact = multiplyExact(input.grams, input.ratePaisePerKg)
  if (exact === null) return fail('invalid_amount', 'Loading amount is too large')
  const event: LoadingEvent = {
    ...eventBase(input),
    type: 'LOADING',
    grams: input.grams,
    ratePaisePerKg: input.ratePaisePerKg,
    exactMilliPaise: exact,
    amount: toExactPaise(exact),
  }
  if (input.loadingPoint !== undefined) event.loadingPoint = input.loadingPoint
  return ok(event)
}

export function makeOrder(
  input: EventInput & { customerId: string; grams: Grams; ratePaisePerKg: PaisePerKg },
): Result<OrderEvent> {
  if (!isNonEmptyString(input.customerId)) return fail('invalid_input', 'Order needs a customer')
  if (!isSafePositiveInt(input.grams)) return fail('invalid_quantity', 'Ordered weight must be more than 0 kg')
  if (!isSafePositiveInt(input.ratePaisePerKg)) return fail('invalid_rate', 'Rate must be more than ₹0/kg')
  const exact = multiplyExact(input.grams, input.ratePaisePerKg)
  if (exact === null) return fail('invalid_amount', 'Order amount is too large')
  return ok({
    ...eventBase(input),
    type: 'ORDER',
    customerId: input.customerId,
    grams: input.grams,
    ratePaisePerKg: input.ratePaisePerKg,
    amount: toExactPaise(exact),
  })
}

export function makeExpense(
  input: EventInput & { category: ExpenseCategory; amount: Paise; slot?: LabourSlot; workerName?: string },
): Result<ExpenseEvent> {
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) {
    return fail('invalid_input', `"${String(input.category)}" is not an expense category; fuel is entered at Starting Point`)
  }
  if ((input.slot !== undefined || input.workerName !== undefined) && input.category !== 'LABOUR') {
    return fail('invalid_input', 'Only labour expenses take a Driver / Labour slot or a worker name')
  }
  if (input.slot !== undefined && !(LABOUR_SLOTS as readonly string[]).includes(input.slot)) {
    return fail('invalid_input', `Unknown labour slot "${String(input.slot)}"`)
  }
  if (!isSafeNonNegativeInt(input.amount)) return fail('invalid_amount', 'Expense must be ₹0 or more')
  const event: ExpenseEvent = { ...eventBase(input), type: 'EXPENSE', category: input.category, amount: input.amount }
  if (input.slot !== undefined) event.slot = input.slot
  if (input.workerName !== undefined) event.workerName = input.workerName
  return ok(event)
}

export function makeWastage(input: EventInput & { grams: Grams }): Result<WastageEvent> {
  if (!isSafePositiveInt(input.grams)) return fail('invalid_quantity', 'Wastage must be more than 0 kg')
  return ok({ ...eventBase(input), type: 'WASTAGE', grams: input.grams })
}

export function makeDefaultRate(input: EventInput & { ratePaisePerKg: PaisePerKg }): Result<DefaultRateEvent> {
  if (!isSafePositiveInt(input.ratePaisePerKg)) return fail('invalid_rate', 'Default rate must be more than ₹0/kg')
  return ok({ ...eventBase(input), type: 'DEFAULT_RATE', ratePaisePerKg: input.ratePaisePerKg })
}

export function makeShopSale(
  input: EventInput & {
    grams: Grams
    ratePaisePerKg: PaisePerKg
    policy: RoundingPolicyId | null
    method?: PaymentMethod
    oversellConfirmed?: boolean
  },
): Result<ShopSaleEvent> {
  if (input.policy === null) return fail('rounding_policy_unset', 'Choose how paise are handled before posting sales (U-01)')
  if (!isRoundingPolicy(input.policy)) return fail('unknown_policy', 'Unknown rounding policy')
  if (!isSafePositiveInt(input.grams)) return fail('invalid_quantity', 'Weight must be more than 0 kg')
  if (!isSafePositiveInt(input.ratePaisePerKg)) return fail('invalid_rate', 'Rate must be more than ₹0/kg')
  const method = input.method ?? 'CASH'
  if (!isPaymentMethod(method)) return fail('invalid_input', `Unknown payment method "${String(method)}"`)
  const exact = multiplyExact(input.grams, input.ratePaisePerKg)
  if (exact === null) return fail('invalid_amount', 'Sale amount is too large')
  const event: ShopSaleEvent = {
    ...eventBase(input),
    type: 'SHOP_SALE',
    grams: input.grams,
    ratePaisePerKg: input.ratePaisePerKg,
    exactMilliPaise: exact,
    amount: postAmount(exact, input.policy),
    policyId: input.policy,
    method,
  }
  if (input.oversellConfirmed) event.oversellConfirmed = true
  return ok(event)
}

export function makeTripReversal(
  original: TripEvent,
  input: { date: IsoDate; createdBy: string; reason?: string },
): Result<TripReversalEvent> {
  if (original.type === 'REVERSAL') return fail('cannot_reverse', 'A reversal cannot itself be reversed')
  const event: TripReversalEvent = {
    id: reversalIdFor(original.id),
    tripId: original.tripId,
    date: input.date,
    createdBy: input.createdBy,
    type: 'REVERSAL',
    reversesId: original.id,
  }
  if (input.reason !== undefined) event.reason = input.reason
  return ok(event)
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

function validateEvent(event: TripEvent): Result<void> {
  if (!isNonEmptyString(event.id) || !isNonEmptyString(event.tripId) || !isNonEmptyString(event.createdBy)) {
    return fail('invalid_input', 'Event needs an id, a trip and an author')
  }
  if (!isIsoDate(event.date)) return fail('invalid_input', `Invalid date "${event.date}"`)
  switch (event.type) {
    case 'FUEL': {
      if (!isSafePositiveInt(event.millilitres) || !isSafePositiveInt(event.pricePaisePerLitre)) {
        return fail('invalid_quantity', 'Fuel needs litres and a price')
      }
      const exact = multiplyExact(event.millilitres, event.pricePaisePerLitre)
      const consistent =
        event.entryMode === 'LITRES'
          ? exact !== null && event.amount === toExactPaise(exact)
          : isSafePositiveInt(event.amount) && event.millilitres === litresForAmount(event.amount, event.pricePaisePerLitre)
      return consistent ? ok(undefined) : fail('amount_mismatch', 'Fuel amount does not match litres × price')
    }
    case 'LOADING': {
      if (!isSafePositiveInt(event.grams) || !isSafePositiveInt(event.ratePaisePerKg)) {
        return fail('invalid_quantity', 'Loading needs kg and a rate')
      }
      const exact = multiplyExact(event.grams, event.ratePaisePerKg)
      return exact !== null && event.exactMilliPaise === exact && event.amount === toExactPaise(exact)
        ? ok(undefined)
        : fail('amount_mismatch', 'Loading amount does not match kg × rate')
    }
    case 'ORDER': {
      const exact = multiplyExact(event.grams, event.ratePaisePerKg)
      return exact !== null && event.amount === toExactPaise(exact)
        ? ok(undefined)
        : fail('amount_mismatch', 'Order amount does not match kg × rate')
    }
    case 'EXPENSE': {
      const rebuilt = makeExpense(event)
      return rebuilt.ok ? ok(undefined) : rebuilt
    }
    case 'WASTAGE':
      return isSafePositiveInt(event.grams) ? ok(undefined) : fail('invalid_quantity', 'Wastage must be more than 0 kg')
    case 'DEFAULT_RATE':
      return isSafePositiveInt(event.ratePaisePerKg) ? ok(undefined) : fail('invalid_rate', 'Default rate must be more than ₹0/kg')
    case 'SHOP_SALE': {
      if (!isSafePositiveInt(event.grams) || !isSafePositiveInt(event.ratePaisePerKg)) {
        return fail('invalid_quantity', 'Shop sale needs kg and a rate')
      }
      if (!isRoundingPolicy(event.policyId) || !isPaymentMethod(event.method)) return fail('invalid_input', 'Invalid shop sale')
      const exact = multiplyExact(event.grams, event.ratePaisePerKg)
      return exact !== null && event.exactMilliPaise === exact && event.amount === postAmount(exact, event.policyId)
        ? ok(undefined)
        : fail('amount_mismatch', 'Shop sale amount does not match kg × rate under its rounding policy')
    }
    case 'REVERSAL':
      return event.id === reversalIdFor(event.reversesId)
        ? ok(undefined)
        : fail('invalid_input', 'Reversal id must be rev_<originalId>')
  }
}

function activeEvents(events: readonly TripEvent[], tripId: string): TripEvent[] {
  const own = events.filter((e) => e.tripId === tripId)
  const reversed = new Set(own.flatMap((e) => (e.type === 'REVERSAL' ? [e.reversesId] : [])))
  return own.filter((e) => e.type !== 'REVERSAL' && !reversed.has(e.id))
}

function checkDriverAssignment(trip: Trip, actor: Actor): Result<void> {
  return actor.actorRole === 'driver' && trip.driverId !== actor.actorId
    ? fail('not_permitted', 'This trip is assigned to another driver')
    : ok(undefined)
}

export function postTripEvent(
  trip: Trip,
  events: readonly TripEvent[],
  event: TripEvent,
  ctx: Actor,
): Result<{ events: TripEvent[]; event: TripEvent; status: PostStatus }> {
  const existing = events.find((e) => e.id === event.id)
  if (existing) {
    if (canonical(existing) === canonical(event)) return ok({ events: [...events], event: existing, status: 'already-saved' })
    return event.type === 'REVERSAL'
      ? fail('already_reversed', 'This entry has already been reversed')
      : fail('id_conflict', `A different event already uses id ${event.id}; posted events are never edited`)
  }
  if (event.tripId !== trip.id) return fail('trip_not_found', 'Event belongs to a different trip')
  if (trip.status === 'CLOSED') return fail('trip_closed', 'This trip is closed; its records are read-only')
  if (event.createdBy !== ctx.actorId) return fail('actor_mismatch', 'Events must be created by the signed-in user')
  const allowed = requireCapability(ctx, EVENT_CAPABILITY[event.type])
  if (!allowed.ok) return allowed
  const assigned = checkDriverAssignment(trip, ctx)
  if (!assigned.ok) return assigned
  const valid = validateEvent(event)
  if (!valid.ok) return valid

  if (event.type === 'REVERSAL') {
    const original = events.find((e) => e.id === event.reversesId && e.tripId === trip.id)
    if (!original) return fail('reversal_target_missing', 'The event to reverse was not found')
    if (original.type === 'REVERSAL') return fail('cannot_reverse', 'A reversal cannot itself be reversed')
  }
  if (event.type === 'EXPENSE' && event.category === 'LABOUR') {
    const labour = activeEvents(events, trip.id).filter(
      (e): e is ExpenseEvent => e.type === 'EXPENSE' && e.category === 'LABOUR',
    )
    if (labour.some((l) => (l.slot !== undefined) !== (event.slot !== undefined))) {
      return fail('invalid_input', 'Use either per-person labour lines or one labour total on a trip, not both')
    }
  }
  return ok({ events: [...events, event], event, status: 'saved' })
}

// ---------------------------------------------------------------------------
// Summary, stock, sales, close
// ---------------------------------------------------------------------------

export type OrderStatus = 'OPEN' | 'PART' | 'DONE'

export interface OrderLine {
  customerId: string
  orderedGrams: Grams
  deliveredGrams: Grams
  remainingGrams: Grams
  status: OrderStatus
}

export interface TripSummary {
  tripId: string
  status: TripStatus
  vehicleNumber: string
  /** Profit stays provisional until the trip is closed (F-PRF-05). */
  provisional: boolean
  /** Latest DEFAULT_RATE event, else the rate set when the trip opened. */
  defaultSaleRatePaisePerKg?: PaisePerKg
  loadedGrams: Grams
  purchasePaise: Paise
  loadings: LoadingEvent[]
  /** Customer sales (ledger) + shop sales. */
  soldGrams: Grams
  salesPaise: Paise
  sales: SaleEntry[]
  customerSoldGrams: Grams
  customerSalesPaise: Paise
  shopSales: ShopSaleEvent[]
  shopSoldGrams: Grams
  shopSalesPaise: Paise
  wastageGrams: Grams
  /** loaded − sold − wastage. Negative means oversold. Orders never move stock. */
  remainingGrams: Grams
  fuelPaise: Paise
  fuel: FuelEvent[]
  expenses: ExpenseEvent[]
  expensesByCategory: Record<ExpenseCategory, Paise>
  labourMode: 'PER_PERSON' | 'TOTAL' | null
  /** Fuel + labour + maintenance + food + other. Excludes wastage. */
  operatingPaise: Paise
  orders: OrderLine[]
}

export interface TripState {
  trip: Trip
  events: readonly TripEvent[]
  ledger: readonly LedgerEntry[]
}

const sum = <T>(items: readonly T[], f: (t: T) => number): number => items.reduce((acc, t) => acc + f(t), 0)

export function summarizeTrip({ trip, events, ledger }: TripState): TripSummary {
  const active = activeEvents(events, trip.id)

  const reversedEntries = new Set(ledger.flatMap((e) => (e.type === 'REVERSAL' ? [e.reversesId] : [])))
  const sales = ledger.filter(
    (e): e is SaleEntry => isFinancial(e) && e.type === 'SALE' && e.tripId === trip.id && !reversedEntries.has(e.id),
  )

  const loadings = active.filter((e): e is LoadingEvent => e.type === 'LOADING')
  const fuel = active.filter((e): e is FuelEvent => e.type === 'FUEL')
  const expenses = active.filter((e): e is ExpenseEvent => e.type === 'EXPENSE')
  const wastage = active.filter((e): e is WastageEvent => e.type === 'WASTAGE')
  const orders = active.filter((e): e is OrderEvent => e.type === 'ORDER')
  const shopSales = active.filter((e): e is ShopSaleEvent => e.type === 'SHOP_SALE')
  const rates = active.filter((e): e is DefaultRateEvent => e.type === 'DEFAULT_RATE')

  const expensesByCategory: Record<ExpenseCategory, Paise> = { LABOUR: 0, MAINTENANCE: 0, FOOD: 0, OTHER: 0 }
  for (const e of expenses) expensesByCategory[e.category] += e.amount
  const labour = expenses.filter((e) => e.category === 'LABOUR')

  const loadedGrams = sum(loadings, (l) => l.grams)
  const customerSoldGrams = sum(sales, (s) => s.grams)
  const customerSalesPaise = sum(sales, (s) => s.amount)
  const shopSoldGrams = sum(shopSales, (s) => s.grams)
  const shopSalesPaise = sum(shopSales, (s) => s.amount)
  const soldGrams = customerSoldGrams + shopSoldGrams
  const wastageGrams = sum(wastage, (w) => w.grams)
  const fuelPaise = sum(fuel, (f) => f.amount)

  const orderCustomers = [...new Set(orders.map((o) => o.customerId))]
  const orderLines = orderCustomers.map((customerId): OrderLine => {
    const orderedGrams = sum(
      orders.filter((o) => o.customerId === customerId),
      (o) => o.grams,
    )
    const deliveredGrams = sum(
      sales.filter((s) => s.customerId === customerId),
      (s) => s.grams,
    )
    const status: OrderStatus = deliveredGrams === 0 ? 'OPEN' : deliveredGrams < orderedGrams ? 'PART' : 'DONE'
    return { customerId, orderedGrams, deliveredGrams, remainingGrams: Math.max(0, orderedGrams - deliveredGrams), status }
  })

  const summary: TripSummary = {
    tripId: trip.id,
    status: trip.status,
    vehicleNumber: trip.vehicleNumber,
    provisional: trip.status !== 'CLOSED',
    loadedGrams,
    purchasePaise: sum(loadings, (l) => l.amount),
    loadings,
    soldGrams,
    salesPaise: customerSalesPaise + shopSalesPaise,
    sales,
    customerSoldGrams,
    customerSalesPaise,
    shopSales,
    shopSoldGrams,
    shopSalesPaise,
    wastageGrams,
    remainingGrams: loadedGrams - soldGrams - wastageGrams,
    fuelPaise,
    fuel,
    expenses,
    expensesByCategory,
    labourMode: labour.length === 0 ? null : labour.some((l) => l.slot !== undefined) ? 'PER_PERSON' : 'TOTAL',
    operatingPaise:
      fuelPaise +
      expensesByCategory.LABOUR +
      expensesByCategory.MAINTENANCE +
      expensesByCategory.FOOD +
      expensesByCategory.OTHER,
    orders: orderLines,
  }
  const defaultRate = rates.at(-1)?.ratePaisePerKg ?? trip.defaultSaleRatePaisePerKg
  if (defaultRate !== undefined) summary.defaultSaleRatePaisePerKg = defaultRate
  return summary
}

/**
 * The rate a sale uses: the one entered, or the trip's default rate.
 * Only roles with "sale.changeRate" (owner, manager) may sell at a rate other than the default.
 */
function resolveSaleRate(summary: TripSummary, entered: PaisePerKg | undefined, actor: Actor): Result<PaisePerKg> {
  const defaultRate = summary.defaultSaleRatePaisePerKg
  const mayChange = can(actor.actorRole, 'sale.changeRate')
  if (entered === undefined) {
    return defaultRate === undefined
      ? fail('invalid_rate', "Set today's default rate for this trip, or enter a rate")
      : ok(defaultRate)
  }
  if (!mayChange && entered !== defaultRate) {
    return defaultRate === undefined
      ? fail('invalid_rate', "The owner or manager must set today's rate first")
      : fail('not_permitted', 'Only the owner or manager can change the rate for a customer', { defaultRate })
  }
  return ok(entered)
}

function checkStock(summary: TripSummary, grams: Grams, confirmed: boolean | undefined): Result<boolean> {
  const oversold = grams > summary.remainingGrams
  if (oversold && !confirmed) {
    return fail('exceeds_stock', 'This sale is more than the stock left on the vehicle', {
      remainingGrams: summary.remainingGrams,
      requestedGrams: grams,
    })
  }
  return ok(oversold)
}

export interface SaleCommand {
  /** Generated when the sale form opens and reused on retry (plan §5). */
  id: string
  customerId: string
  date: IsoDate
  createdBy: string
  grams: Grams
  /** Leave out to sell at the trip's default rate. */
  ratePaisePerKg?: PaisePerKg
  comment?: string
  /** The owner or manager tapped "Sell more than stock" (D-04). */
  oversellConfirmed?: boolean
}

/** Records a customer sale on a trip: rate check, stock check (no silent overselling), then one SALE ledger entry. */
export function recordTripSale(
  state: TripState,
  cmd: SaleCommand,
  ctx: Actor & { policy: RoundingPolicyId | null },
): Result<{ ledger: LedgerEntry[]; entry: SaleEntry; status: PostStatus; oversold: boolean }> {
  const summary = summarizeTrip(state)
  const existing = state.ledger.find((e) => e.id === cmd.id)
  if (existing) {
    const same =
      existing.type === 'SALE' &&
      existing.tripId === state.trip.id &&
      existing.customerId === cmd.customerId &&
      existing.grams === cmd.grams &&
      existing.ratePaisePerKg === (cmd.ratePaisePerKg ?? existing.ratePaisePerKg) &&
      existing.date === cmd.date
    if (!same) return fail('id_conflict', `A different entry already uses id ${cmd.id}`)
    return ok({ ledger: [...state.ledger], entry: existing, status: 'already-saved', oversold: !!existing.oversellConfirmed })
  }
  if (state.trip.status === 'CLOSED') return fail('trip_closed', 'This trip is closed; its records are read-only')
  const allowed = requireCapability(ctx, 'sale.record')
  if (!allowed.ok) return allowed
  const assigned = checkDriverAssignment(state.trip, ctx)
  if (!assigned.ok) return assigned

  const rate = resolveSaleRate(summary, cmd.ratePaisePerKg, ctx)
  if (!rate.ok) return rate
  const stock = checkStock(summary, cmd.grams, cmd.oversellConfirmed)
  if (!stock.ok) return stock

  const saleInput: Parameters<typeof makeSale>[0] = {
    id: cmd.id,
    customerId: cmd.customerId,
    date: cmd.date,
    createdBy: cmd.createdBy,
    grams: cmd.grams,
    ratePaisePerKg: rate.value,
    policy: ctx.policy,
    tripId: state.trip.id,
    oversellConfirmed: stock.value,
  }
  if (cmd.comment !== undefined) saleInput.comment = cmd.comment
  const sale = makeSale(saleInput)
  if (!sale.ok) return sale

  const posted = postEntry(state.ledger, sale.value, {
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    tripInfo: (id) =>
      id === state.trip.id
        ? state.trip.driverId === undefined
          ? { status: state.trip.status }
          : { status: state.trip.status, driverId: state.trip.driverId }
        : undefined,
  })
  if (!posted.ok) return posted
  return ok({ ledger: posted.value.entries, entry: posted.value.entry, status: posted.value.status, oversold: stock.value })
}

export interface ShopSaleCommand {
  id: string
  date: IsoDate
  createdBy: string
  grams: Grams
  ratePaisePerKg?: PaisePerKg
  method?: PaymentMethod
  note?: string
  oversellConfirmed?: boolean
}

/** Sells kg left on the vehicle at the shop (U-05), with the same rate and stock checks as a customer sale. */
export function recordShopSale(
  state: TripState,
  cmd: ShopSaleCommand,
  ctx: Actor & { policy: RoundingPolicyId | null },
): Result<{ events: TripEvent[]; event: ShopSaleEvent; status: PostStatus; oversold: boolean }> {
  const existing = state.events.find((e) => e.id === cmd.id)
  if (existing) {
    const same =
      existing.type === 'SHOP_SALE' &&
      existing.grams === cmd.grams &&
      existing.ratePaisePerKg === (cmd.ratePaisePerKg ?? existing.ratePaisePerKg) &&
      existing.date === cmd.date
    if (!same) return fail('id_conflict', `A different event already uses id ${cmd.id}`)
    return ok({ events: [...state.events], event: existing, status: 'already-saved', oversold: !!existing.oversellConfirmed })
  }
  if (state.trip.status === 'CLOSED') return fail('trip_closed', 'This trip is closed; its records are read-only')
  const summary = summarizeTrip(state)
  const rate = resolveSaleRate(summary, cmd.ratePaisePerKg, ctx)
  if (!rate.ok) return rate
  const stock = checkStock(summary, cmd.grams, cmd.oversellConfirmed)
  if (!stock.ok) return stock

  const input: Parameters<typeof makeShopSale>[0] = {
    id: cmd.id,
    tripId: state.trip.id,
    date: cmd.date,
    createdBy: cmd.createdBy,
    grams: cmd.grams,
    ratePaisePerKg: rate.value,
    policy: ctx.policy,
    oversellConfirmed: stock.value,
  }
  if (cmd.method !== undefined) input.method = cmd.method
  if (cmd.note !== undefined) input.note = cmd.note
  const event = makeShopSale(input)
  if (!event.ok) return event
  const posted = postTripEvent(state.trip, state.events, event.value, ctx)
  if (!posted.ok) return posted
  return ok({ events: posted.value.events, event: event.value, status: posted.value.status, oversold: stock.value })
}

/**
 * Closes a trip (F-INV-02, D-11). Needs the network and no unsynced writes on this device,
 * and every loaded kg accounted for (remaining = 0) through customer sales, shop sales and wastage.
 */
export function closeTrip(
  state: TripState,
  ctx: Actor & { closedOn: IsoDate; online: boolean; hasPendingWrites: boolean },
): Result<Trip> {
  if (state.trip.status === 'CLOSED') return fail('trip_closed', 'This trip is already closed')
  const allowed = requireCapability(ctx, 'trip.close')
  if (!allowed.ok) return allowed
  if (!ctx.online) return fail('not_online', 'Connect to the internet to close the trip')
  if (ctx.hasPendingWrites) return fail('pending_writes', 'Some entries are still saving; wait until they reach the cloud')
  const s = summarizeTrip(state)
  if (s.remainingGrams > 0) {
    return fail('stock_not_reconciled', 'Some loaded kg are not accounted for: sell them at the shop or record wastage', {
      remainingGrams: s.remainingGrams,
    })
  }
  if (s.remainingGrams < 0) {
    return fail('oversold', 'More kg were sold than loaded; correct the sales or loadings first', {
      remainingGrams: s.remainingGrams,
    })
  }
  return ok({
    ...state.trip,
    status: 'CLOSED',
    closedBy: ctx.actorId,
    closedOn: ctx.closedOn,
    closeSummary: {
      loadedGrams: s.loadedGrams,
      soldGrams: s.soldGrams,
      shopSoldGrams: s.shopSoldGrams,
      wastageGrams: s.wastageGrams,
      purchasePaise: s.purchasePaise,
      salesPaise: s.salesPaise,
      operatingPaise: s.operatingPaise,
    },
  })
}
