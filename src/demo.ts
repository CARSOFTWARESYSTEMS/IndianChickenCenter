/**
 * Demo data for the engine check page: the examples from IndianChickenCenter.txt, run through src/domain.
 * Not the real app. Nothing is saved; it is rebuilt from scratch on every change.
 */
import {
  buildBill,
  closeTrip,
  computeProfit,
  kg,
  makeExpense,
  makeFuelByAmount,
  makeLoading,
  makeOpeningBalance,
  makePayment,
  makeSale,
  makeWastage,
  openTrip,
  passbook,
  postEntry,
  postTripEvent,
  pricePerLitre,
  ratePerKg,
  recordTripSale,
  rupees,
  summarizeTrip,
  type Bill,
  type LedgerEntry,
  type PassbookRow,
  type ProfitReport,
  type Result,
  type RoundingPolicyId,
  type TripEvent,
  type TripSummary,
} from './domain'

const OWNER = 'demo-owner'
const actor = { actorId: OWNER, actorRole: 'owner' } as const
const TRIP_DATE = '2026-11-02'

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

export const SOURCE_CUSTOMERS: ReadonlyArray<readonly [string, string]> = [
  ['Customer1', '2000'],
  ['Customer2', '500'],
  ['Customer3', '200'],
  ['Customer4', '1000'],
  ['Customer5', '300'],
  ['Customer6', '870'],
]

export interface DemoTrip {
  vehicleNumber: string
  driverName: string
  summary: TripSummary
  profit: ProfitReport
  saleLines: { customer: string; grams: number; rate: number; amount: number }[]
}

/** C-TXT L11–57: diesel ₹8,000 at ₹91/L, 5,000 kg at ₹120, six customers at ₹140, labour ₹6,000, 130 kg wastage. */
export function demoTrip(policy: RoundingPolicyId): DemoTrip {
  let trip = must(
    openTrip(
      [],
      {
        id: 'trip-1',
        date: TRIP_DATE,
        createdBy: OWNER,
        vehicleNumber: 'KA21AB1234',
        driverName: 'Ramesh',
        defaultSaleRatePaisePerKg: ratePerKg('140'),
      },
      actor,
    ),
  )
  let events: TripEvent[] = []
  let ledger: LedgerEntry[] = []
  const base = (id: string) => ({ id, tripId: trip.id, date: TRIP_DATE, createdBy: OWNER })
  const add = (event: Result<TripEvent>) => {
    events = must(postTripEvent(trip, events, must(event), actor)).events
  }

  add(makeFuelByAmount({ ...base('fuel'), amount: rupees('8000'), pricePaisePerLitre: pricePerLitre('91') }))
  add(makeLoading({ ...base('load'), grams: kg('5000'), ratePaisePerKg: ratePerKg('120'), loadingPoint: 'Loading point' }))
  for (const [customer, weight] of SOURCE_CUSTOMERS) {
    const sale = must(
      recordTripSale(
        { trip, events, ledger },
        { id: `sale-${customer}`, customerId: customer, date: TRIP_DATE, createdBy: OWNER, grams: kg(weight) },
        { ...actor, policy },
      ),
    )
    ledger = sale.ledger
  }
  add(makeExpense({ ...base('labour'), category: 'LABOUR', amount: rupees('6000') }))
  add(makeWastage({ ...base('wastage'), grams: kg('130') }))
  trip = must(closeTrip({ trip, events, ledger }, { ...actor, closedOn: TRIP_DATE, online: true, hasPendingWrites: false }))

  const summary = summarizeTrip({ trip, events, ledger })
  return {
    vehicleNumber: trip.vehicleNumber,
    driverName: trip.driverName ?? '',
    summary,
    profit: computeProfit(summary),
    saleLines: summary.sales.map((s) => ({ customer: s.customerId, grams: s.grams, rate: s.ratePaisePerKg, amount: s.amount })),
  }
}

export interface DemoLedger {
  rows: PassbookRow[]
  bill: Bill
}

/** C-TXT L62–69: opening ₹10,625, 63.1 kg × ₹128, 153.2 kg × ₹118, cash ₹26,000. */
export function demoLedger(policy: RoundingPolicyId): DemoLedger {
  const customerId = 'Customer1'
  let book: LedgerEntry[] = []
  const post = (entry: Result<LedgerEntry>) => {
    book = must(postEntry(book, must(entry), actor)).entries
  }
  post(makeOpeningBalance({ customerId, date: '2026-10-01', createdBy: OWNER, amount: rupees('10625') }))
  post(makeSale({ id: 's1', customerId, date: '2026-10-05', createdBy: OWNER, grams: kg('63.1'), ratePaisePerKg: ratePerKg('128'), policy }))
  post(makeSale({ id: 's2', customerId, date: '2026-10-12', createdBy: OWNER, grams: kg('153.2'), ratePaisePerKg: ratePerKg('118'), policy }))
  post(makePayment({ id: 'p1', customerId, date: '2026-10-20', createdBy: OWNER, amount: rupees('26000'), method: 'CASH' }))
  return {
    rows: passbook(book, customerId),
    bill: must(buildBill(book, customerId, { from: '2026-10-01', to: '2026-10-31' })),
  }
}
