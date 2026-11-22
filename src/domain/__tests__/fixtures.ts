/**
 * Test fixtures built from IndianChickenCenter.txt. Dates are synthetic (the source leaves [Date] blank).
 * Paise literals are written rupees_paise with Indian grouping: 6_81_800_00 = ₹6,81,800.00, 8_076_80 = ₹8,076.80.
 * Gram literals: 63_100 = 63.1 kg.
 */
import {
  closeMonth,
  closeTrip,
  computeProfit,
  kg,
  litres,
  makeExpense,
  makeFuelByAmount,
  makeFuelByLitres,
  makeLoading,
  makeOpeningBalance,
  makeOrder,
  makePayment,
  makeSale,
  makeWastage,
  openTrip,
  postEntry,
  postTripEvent,
  pricePerLitre,
  ratePerKg,
  recomputeBalance,
  recordTripSale,
  rupees,
  summarizeTrip,
  type ExpenseCategory,
  type LabourSlot,
  type LedgerEntry,
  type PostContext,
  type Posted,
  type ProfitOptions,
  type Result,
  type RoundingPolicyId,
  type Trip,
  type TripEvent,
  type TripState,
} from '../index'

export const OWNER = 'uid-owner'
export const STAFF = 'uid-staff'
export const owner = { actorId: OWNER, actorRole: 'owner' } as const
export const staff = { actorId: STAFF, actorRole: 'staff' } as const

export function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

export function errorCode<T>(result: Result<T>): string | undefined {
  return result.ok ? undefined : result.error.code
}

export const TRIP_DATE = '2026-11-02'

/** C-TXT L26–31: six customers at ₹140/kg. */
export const SOURCE_SALES: ReadonlyArray<readonly [customerId: string, kg: string]> = [
  ['customer1', '2000'],
  ['customer2', '500'],
  ['customer3', '200'],
  ['customer4', '1000'],
  ['customer5', '300'],
  ['customer6', '870'],
]

export class TripBuilder {
  trip: Trip
  events: TripEvent[] = []
  ledger: LedgerEntry[] = []
  private seq = 0

  constructor(id = 'trip-1', date = TRIP_DATE) {
    this.trip = openTrip({ id, date, createdBy: OWNER })
  }

  get state(): TripState {
    return { trip: this.trip, events: this.events, ledger: this.ledger }
  }

  private base(prefix: string) {
    return { id: `${prefix}-${++this.seq}`, tripId: this.trip.id, date: this.trip.date, createdBy: OWNER }
  }

  add<E extends TripEvent>(event: Result<E>): E {
    const e = must(event)
    this.events = must(postTripEvent(this.trip, this.events, e, owner)).events
    return e
  }

  fuelByAmount(amount: string, price: string) {
    return this.add(makeFuelByAmount({ ...this.base('fuel'), amount: rupees(amount), pricePaisePerLitre: pricePerLitre(price) }))
  }

  fuelByLitres(l: string, price: string) {
    return this.add(
      makeFuelByLitres({ ...this.base('fuel'), millilitres: litres(l), pricePaisePerLitre: pricePerLitre(price) }),
    )
  }

  load(weight: string, rate: string, loadingPoint?: string) {
    const input = { ...this.base('load'), grams: kg(weight), ratePaisePerKg: ratePerKg(rate) }
    return this.add(makeLoading(loadingPoint === undefined ? input : { ...input, loadingPoint }))
  }

  order(customerId: string, weight: string, rate: string) {
    return this.add(makeOrder({ ...this.base('order'), customerId, grams: kg(weight), ratePaisePerKg: ratePerKg(rate) }))
  }

  expense(category: ExpenseCategory, amount: string, slot?: LabourSlot) {
    const input = { ...this.base('exp'), category, amount: rupees(amount) }
    return this.add(makeExpense(slot === undefined ? input : { ...input, slot }))
  }

  wastage(weight: string) {
    return this.add(makeWastage({ ...this.base('wst'), grams: kg(weight) }))
  }

  sell(
    customerId: string,
    weight: string,
    rate: string,
    opts: { confirm?: boolean; policy?: RoundingPolicyId | null; id?: string } = {},
  ) {
    const result = recordTripSale(
      this.state,
      {
        id: opts.id ?? `sale-${++this.seq}`,
        customerId,
        date: this.trip.date,
        createdBy: OWNER,
        grams: kg(weight),
        ratePaisePerKg: ratePerKg(rate),
        oversellConfirmed: opts.confirm ?? false,
      },
      { ...owner, policy: opts.policy === undefined ? 'TRUNCATE_RUPEE' : opts.policy },
    )
    if (result.ok) this.ledger = result.value.ledger
    return result
  }

  close(opts: { online?: boolean; hasPendingWrites?: boolean } = {}) {
    const result = closeTrip(this.state, {
      actorId: OWNER,
      closedOn: this.trip.date,
      online: opts.online ?? true,
      hasPendingWrites: opts.hasPendingWrites ?? false,
    })
    if (result.ok) this.trip = result.value
    return result
  }

  summary() {
    return summarizeTrip(this.state)
  }

  profit(options?: ProfitOptions) {
    return computeProfit(this.summary(), options)
  }
}

/** The source trip (C-TXT L11–57): diesel ₹8,000 at ₹91/L, 5,000 kg loaded, six sales at ₹140, labour ₹6,000, 130 kg wastage. */
export function sourceTrip(opts: { purchaseRate?: string; withWastage?: boolean; close?: boolean } = {}): TripBuilder {
  const t = new TripBuilder()
  t.fuelByAmount('8000', '91')
  t.load('5000', opts.purchaseRate ?? '120')
  for (const [customerId, weight] of SOURCE_SALES) must(t.sell(customerId, weight, '140'))
  t.expense('LABOUR', '6000')
  if (opts.withWastage ?? true) t.wastage('130')
  if (opts.close ?? true) must(t.close())
  return t
}

export const LEDGER_CUSTOMER = 'customer1'

export class LedgerBuilder {
  entries: LedgerEntry[] = []

  constructor(readonly customerId = LEDGER_CUSTOMER) {}

  post<E extends LedgerEntry>(entry: E, ctx: PostContext = owner): Result<Posted<E>> {
    const result = postEntry(this.entries, entry, ctx)
    if (result.ok) this.entries = result.value.entries
    return result
  }

  opening(amount: string, date: string) {
    return must(this.post(must(makeOpeningBalance({ customerId: this.customerId, date, createdBy: OWNER, amount: rupees(amount) })))).entry
  }

  sale(id: string, weight: string, rate: string, date: string, policy: RoundingPolicyId = 'TRUNCATE_RUPEE') {
    const sale = must(
      makeSale({ id, customerId: this.customerId, date, createdBy: OWNER, grams: kg(weight), ratePaisePerKg: ratePerKg(rate), policy }),
    )
    return must(this.post(sale)).entry
  }

  payment(id: string, amount: string, date: string) {
    return must(this.post(must(makePayment({ id, customerId: this.customerId, date, createdBy: OWNER, amount: rupees(amount) })))).entry
  }

  closeMonth(month: string, date: string, ctx: PostContext = owner) {
    const result = closeMonth(this.entries, { customerId: this.customerId, month, date, createdBy: ctx.actorId }, ctx)
    if (result.ok) this.entries = result.value.entries
    return result
  }

  get balance() {
    return recomputeBalance(this.entries, this.customerId)
  }
}

/** C-TXT L62–68: opening ₹10,625, two sales, cash payment ₹26,000. */
export function sourceLedger(): LedgerBuilder {
  const l = new LedgerBuilder()
  l.opening('10625', '2026-10-01')
  l.sale('sale-1', '63.1', '128', '2026-10-05')
  l.sale('sale-2', '153.2', '118', '2026-10-12')
  l.payment('pay-1', '26000', '2026-10-20')
  return l
}
