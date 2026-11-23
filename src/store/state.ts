/**
 * App state and the demo seed (plan P3: "in-memory store labelled DEMO DATA, seeded with the original examples").
 * The seed is built through the engine, so it obeys every rule real data will.
 */
import {
  closeMonth,
  closeTrip,
  DEFAULT_SETTINGS,
  kg,
  makeCustomer,
  makeExpense,
  makeFuelByAmount,
  makeLoading,
  makeOpeningBalance,
  makePayment,
  makeSale,
  makeWastage,
  openTrip,
  postEntry,
  postTripEvent,
  pricePerLitre,
  ratePerKg,
  recordTripSale,
  rupees,
  type BusinessSettings,
  type Customer,
  type IssuedBill,
  type LedgerEntry,
  type LedgerWindow,
  type Result,
  type Role,
  type Trip,
  type TripEvent,
} from '../domain'

export interface AppUser {
  id: string
  name: string
  role: Role
}

export interface AppState {
  version: 1
  settings: BusinessSettings
  users: AppUser[]
  /** Who is using the app right now (demo: switchable under More). */
  actorId: string
  vehicles: string[]
  customers: Customer[]
  trips: Trip[]
  tripEvents: TripEvent[]
  ledger: LedgerEntry[]
  /** Cloud only: the ledger holds entries from this date on plus month-end snapshots (P5). Demo data is complete. */
  ledgerWindow?: LedgerWindow
  /** Issued bills (P6). In the cloud, those issued inside the read window. */
  bills: IssuedBill[]
  /** Demo only: the last bill number given out per financial year. In the cloud a counter document does this. */
  billCounters?: Record<string, number>
}

export const DEMO_USERS: AppUser[] = [
  { id: 'u-owner', name: 'Umarabba', role: 'owner' },
  { id: 'u-manager', name: 'Manager', role: 'manager' },
  { id: 'u-driver', name: 'Ramesh', role: 'driver' },
]

/** The six vehicles (U-06: one trip a day per vehicle). Registration numbers are made up. */
export const DEMO_VEHICLES = ['KA21AB1234', 'KA21AB1235', 'KA19C7788', 'KA70M9090', 'KA21Z4321', 'KA21N5566']

/** Date for the source trip example (the source leaves dates blank). */
export const SOURCE_TRIP_DATE = '2026-11-02'

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Demo seed failed: ${result.error.code} ${result.error.message}`)
  return result.value
}

export function seedDemoState(): AppState {
  const owner = { actorId: 'u-owner', actorRole: 'owner' as const }
  const by = { createdBy: owner.actorId }

  let customers: Customer[] = []
  for (let i = 1; i <= 6; i++) {
    customers = [...customers, must(makeCustomer(customers, { ...by, id: `c${i}`, shopName: `Customer${i}`, createdAt: '2026-10-01' })).customer]
  }

  // C-TXT L64–69: Customer1's October ledger, written on paper with paise dropped, then closed at month end.
  let ledger: LedgerEntry[] = []
  const post = (entry: Result<LedgerEntry>) => {
    ledger = must(postEntry(ledger, must(entry), owner)).entries
  }
  post(makeOpeningBalance({ ...by, customerId: 'c1', date: '2026-10-01', amount: rupees('10625') }))
  post(makeSale({ ...by, id: 'seed-oct-1', customerId: 'c1', date: '2026-10-05', grams: kg('63.1'), ratePaisePerKg: ratePerKg('128'), policy: 'TRUNCATE_RUPEE' }))
  post(makeSale({ ...by, id: 'seed-oct-2', customerId: 'c1', date: '2026-10-12', grams: kg('153.2'), ratePaisePerKg: ratePerKg('118'), policy: 'TRUNCATE_RUPEE' }))
  post(makePayment({ ...by, id: 'seed-oct-pay', customerId: 'c1', date: '2026-10-20', amount: rupees('26000'), method: 'CASH' }))
  ledger = must(closeMonth(ledger, { customerId: 'c1', month: '2026-10', date: '2026-11-01', createdBy: owner.actorId }, owner)).entries

  // C-TXT L11–57: the source trip, closed with ₹67,800 profit both ways.
  let trip = must(
    openTrip(
      [],
      {
        ...by,
        id: 'trip-source',
        date: SOURCE_TRIP_DATE,
        vehicleNumber: DEMO_VEHICLES[0] ?? 'KA21AB1234',
        driverId: 'u-driver',
        driverName: 'Ramesh',
        defaultSaleRatePaisePerKg: ratePerKg('140'),
      },
      owner,
    ),
  )
  let events: TripEvent[] = []
  const ev = { ...by, tripId: trip.id, date: SOURCE_TRIP_DATE }
  const add = (event: Result<TripEvent>) => {
    events = must(postTripEvent(trip, events, must(event), owner)).events
  }
  add(makeFuelByAmount({ ...ev, id: 'seed-fuel', amount: rupees('8000'), pricePaisePerLitre: pricePerLitre('91') }))
  add(makeLoading({ ...ev, id: 'seed-load', grams: kg('5000'), ratePaisePerKg: ratePerKg('120') }))
  const weights = ['2000', '500', '200', '1000', '300', '870']
  weights.forEach((w, i) => {
    const sale = must(
      recordTripSale(
        { trip, events, ledger },
        { ...by, id: `seed-sale-c${i + 1}`, customerId: `c${i + 1}`, date: SOURCE_TRIP_DATE, grams: kg(w) },
        { ...owner, policy: 'ROUND_HALF_UP_RUPEE' },
      ),
    )
    ledger = sale.ledger
  })
  add(makeExpense({ ...ev, id: 'seed-labour', category: 'LABOUR', amount: rupees('6000') }))
  add(makeWastage({ ...ev, id: 'seed-wastage', grams: kg('130') }))
  trip = must(closeTrip({ trip, events, ledger }, { ...owner, closedOn: SOURCE_TRIP_DATE, online: true, hasPendingWrites: false }))

  return {
    version: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      defaultSaleRatePaisePerKg: ratePerKg('140'),
      dieselPricePaisePerLitre: pricePerLitre('91'),
    },
    users: DEMO_USERS,
    actorId: 'u-owner',
    vehicles: DEMO_VEHICLES,
    customers,
    trips: [trip],
    tripEvents: events,
    ledger,
    bills: [],
  }
}
