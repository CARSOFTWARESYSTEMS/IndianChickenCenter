/**
 * One trip in the owner's order (C-TXT L11–42): Starting Point (fuel) → Loading → Orders → Distribution → Expenses → Close.
 * Trip events are append-only; corrections are REVERSAL events. Sales live in the ledger (one SALE entry per sale).
 */
import type { Actor, TripStatus } from './common'
import { isIsoDate, type IsoDate } from './dates'
import {
  isFinancial,
  makeSale,
  postEntry,
  reversalIdFor,
  type LedgerEntry,
  type PostStatus,
  type SaleEntry,
} from './ledger'
import { fail, ok, type Result } from './result'
import { toExactPaise, type RoundingPolicyId } from './rounding'
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
  vehicle?: string
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
  /** Labour line (Driver, Labour 1–5). Per-person vs one total is owner decision U-13. */
  slot?: LabourSlot
  amount: Paise
}

/** Reconciles kg at close. Other outcomes for unsold kg (carry forward, shop sale) wait on U-05. */
export interface WastageEvent extends TripEventBase {
  type: 'WASTAGE'
  grams: Grams
}

export interface TripReversalEvent extends TripEventBase {
  type: 'REVERSAL'
  reversesId: string
  reason?: string
}

export type TripEvent = FuelEvent | LoadingEvent | OrderEvent | ExpenseEvent | WastageEvent | TripReversalEvent

// ---------------------------------------------------------------------------
// Builders
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

export function openTrip(input: { id: string; date: IsoDate; createdBy: string; vehicle?: string }): Trip {
  const trip: Trip = { id: input.id, date: input.date, status: 'OPEN', createdBy: input.createdBy }
  if (input.vehicle !== undefined) trip.vehicle = input.vehicle
  return trip
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
  input: EventInput & { category: ExpenseCategory; amount: Paise; slot?: LabourSlot },
): Result<ExpenseEvent> {
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) {
    return fail('invalid_input', `"${String(input.category)}" is not an expense category; fuel is entered at Starting Point`)
  }
  if (input.slot !== undefined && (input.category !== 'LABOUR' || !(LABOUR_SLOTS as readonly string[]).includes(input.slot))) {
    return fail('invalid_input', 'Only labour expenses take a Driver / Labour slot')
  }
  if (!isSafeNonNegativeInt(input.amount)) return fail('invalid_amount', 'Expense must be ₹0 or more')
  const event: ExpenseEvent = { ...eventBase(input), type: 'EXPENSE', category: input.category, amount: input.amount }
  if (input.slot !== undefined) event.slot = input.slot
  return ok(event)
}

export function makeWastage(input: EventInput & { grams: Grams }): Result<WastageEvent> {
  if (!isSafePositiveInt(input.grams)) return fail('invalid_quantity', 'Wastage must be more than 0 kg')
  return ok({ ...eventBase(input), type: 'WASTAGE', grams: input.grams })
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
      const exact = multiplyExact(event.grams, event.ratePaisePerKg)
      if (!isSafePositiveInt(event.grams) || !isSafePositiveInt(event.ratePaisePerKg)) {
        return fail('invalid_quantity', 'Loading needs kg and a rate')
      }
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
    case 'REVERSAL':
      return event.id === reversalIdFor(event.reversesId)
        ? ok(undefined)
        : fail('invalid_input', 'Reversal id must be rev_<originalId>')
  }
}

export function postTripEvent(
  trip: Trip,
  events: readonly TripEvent[],
  event: TripEvent,
  ctx: Pick<Actor, 'actorId'>,
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
  const valid = validateEvent(event)
  if (!valid.ok) return valid
  if (event.type === 'REVERSAL') {
    const original = events.find((e) => e.id === event.reversesId && e.tripId === trip.id)
    if (!original) return fail('reversal_target_missing', 'The event to reverse was not found')
    if (original.type === 'REVERSAL') return fail('cannot_reverse', 'A reversal cannot itself be reversed')
  }
  return ok({ events: [...events, event], event, status: 'saved' })
}

// ---------------------------------------------------------------------------
// Summary, stock, close
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
  /** Profit stays provisional until the trip is closed (F-PRF-05). */
  provisional: boolean
  loadedGrams: Grams
  purchasePaise: Paise
  loadings: LoadingEvent[]
  soldGrams: Grams
  salesPaise: Paise
  sales: SaleEntry[]
  wastageGrams: Grams
  /** loaded − sold − wastage. Negative means oversold. Orders never move stock. */
  remainingGrams: Grams
  fuelPaise: Paise
  fuel: FuelEvent[]
  expenses: ExpenseEvent[]
  expensesByCategory: Record<ExpenseCategory, Paise>
  /** Fuel + labour + maintenance + food + other. Excludes wastage. */
  operatingPaise: Paise
  orders: OrderLine[]
}

export interface TripState {
  trip: Trip
  events: readonly TripEvent[]
  ledger: readonly LedgerEntry[]
}

export function summarizeTrip({ trip, events, ledger }: TripState): TripSummary {
  const own = events.filter((e) => e.tripId === trip.id)
  const reversedEvents = new Set(own.flatMap((e) => (e.type === 'REVERSAL' ? [e.reversesId] : [])))
  const active = own.filter((e) => e.type !== 'REVERSAL' && !reversedEvents.has(e.id))

  const reversedEntries = new Set(ledger.flatMap((e) => (e.type === 'REVERSAL' ? [e.reversesId] : [])))
  const sales = ledger.filter(
    (e): e is SaleEntry => isFinancial(e) && e.type === 'SALE' && e.tripId === trip.id && !reversedEntries.has(e.id),
  )

  const loadings = active.filter((e): e is LoadingEvent => e.type === 'LOADING')
  const fuel = active.filter((e): e is FuelEvent => e.type === 'FUEL')
  const expenses = active.filter((e): e is ExpenseEvent => e.type === 'EXPENSE')
  const wastage = active.filter((e): e is WastageEvent => e.type === 'WASTAGE')
  const orders = active.filter((e): e is OrderEvent => e.type === 'ORDER')

  const sum = <T>(items: readonly T[], f: (t: T) => number): number => items.reduce((acc, t) => acc + f(t), 0)

  const expensesByCategory: Record<ExpenseCategory, Paise> = { LABOUR: 0, MAINTENANCE: 0, FOOD: 0, OTHER: 0 }
  for (const e of expenses) expensesByCategory[e.category] += e.amount

  const loadedGrams = sum(loadings, (l) => l.grams)
  const soldGrams = sum(sales, (s) => s.grams)
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

  return {
    tripId: trip.id,
    status: trip.status,
    provisional: trip.status !== 'CLOSED',
    loadedGrams,
    purchasePaise: sum(loadings, (l) => l.amount),
    loadings,
    soldGrams,
    salesPaise: sum(sales, (s) => s.amount),
    sales,
    wastageGrams,
    remainingGrams: loadedGrams - soldGrams - wastageGrams,
    fuelPaise,
    fuel,
    expenses,
    expensesByCategory,
    operatingPaise:
      fuelPaise +
      expensesByCategory.LABOUR +
      expensesByCategory.MAINTENANCE +
      expensesByCategory.FOOD +
      expensesByCategory.OTHER,
    orders: orderLines,
  }
}

export interface SaleCommand {
  /** Generated when the sale form opens and reused on retry (plan §5). */
  id: string
  customerId: string
  date: IsoDate
  createdBy: string
  grams: Grams
  ratePaisePerKg: PaisePerKg
  comment?: string
  /** The owner tapped "Sell more than stock" (D-04). */
  oversellConfirmed?: boolean
}

/** Records a sale on a trip: stock check (no silent overselling), then one SALE ledger entry. */
export function recordTripSale(
  state: TripState,
  cmd: SaleCommand,
  ctx: Actor & { policy: RoundingPolicyId | null },
): Result<{ ledger: LedgerEntry[]; entry: SaleEntry; status: PostStatus; oversold: boolean }> {
  const existing = state.ledger.find((e) => e.id === cmd.id)
  if (existing) {
    const same =
      existing.type === 'SALE' &&
      existing.tripId === state.trip.id &&
      existing.customerId === cmd.customerId &&
      existing.grams === cmd.grams &&
      existing.ratePaisePerKg === cmd.ratePaisePerKg &&
      existing.date === cmd.date
    if (!same) return fail('id_conflict', `A different entry already uses id ${cmd.id}`)
    return ok({ ledger: [...state.ledger], entry: existing, status: 'already-saved', oversold: !!existing.oversellConfirmed })
  }
  if (state.trip.status === 'CLOSED') return fail('trip_closed', 'This trip is closed; its records are read-only')

  const summary = summarizeTrip(state)
  const oversold = cmd.grams > summary.remainingGrams
  if (oversold && !cmd.oversellConfirmed) {
    return fail('exceeds_stock', 'This sale is more than the stock left on the vehicle', {
      remainingGrams: summary.remainingGrams,
      requestedGrams: cmd.grams,
    })
  }

  const saleInput: Parameters<typeof makeSale>[0] = {
    id: cmd.id,
    customerId: cmd.customerId,
    date: cmd.date,
    createdBy: cmd.createdBy,
    grams: cmd.grams,
    ratePaisePerKg: cmd.ratePaisePerKg,
    policy: ctx.policy,
    tripId: state.trip.id,
    oversellConfirmed: oversold,
  }
  if (cmd.comment !== undefined) saleInput.comment = cmd.comment
  const sale = makeSale(saleInput)
  if (!sale.ok) return sale

  const posted = postEntry(state.ledger, sale.value, {
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    tripStatus: (id) => (id === state.trip.id ? state.trip.status : undefined),
  })
  if (!posted.ok) return posted
  return ok({ ledger: posted.value.entries, entry: posted.value.entry, status: posted.value.status, oversold })
}

/**
 * Closes a trip (F-INV-02, D-11). Needs the network and no unsynced writes on this device,
 * and every loaded kg accounted for (remaining = 0) through sales and explicit wastage lines.
 */
export function closeTrip(
  state: TripState,
  ctx: { actorId: string; closedOn: IsoDate; online: boolean; hasPendingWrites: boolean },
): Result<Trip> {
  if (state.trip.status === 'CLOSED') return fail('trip_closed', 'This trip is already closed')
  if (!ctx.online) return fail('not_online', 'Connect to the internet to close the trip')
  if (ctx.hasPendingWrites) return fail('pending_writes', 'Some entries are still saving; wait until they reach the cloud')
  const s = summarizeTrip(state)
  if (s.remainingGrams > 0) {
    return fail('stock_not_reconciled', 'Some loaded kg are not accounted for yet', { remainingGrams: s.remainingGrams })
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
      wastageGrams: s.wastageGrams,
      purchasePaise: s.purchasePaise,
      salesPaise: s.salesPaise,
      operatingPaise: s.operatingPaise,
    },
  })
}
