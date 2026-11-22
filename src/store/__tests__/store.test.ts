/** The demo store, driven only through its commands, as the screens drive it. Paise literals: 10_778_00 = ₹10,778. */
import { describe, expect, it } from 'vitest'
import {
  customerBalance,
  kg,
  litres,
  makeLoading,
  makeWastage,
  pricePerLitre,
  ratePerKg,
  rupees,
  type Result,
} from '../../domain'
import {
  addCustomer,
  addTripEvent,
  closeMonthForAll,
  finishTrip,
  recordPayment,
  recordSale,
  reverseLedgerEntry,
  setActor,
  shopSale,
  startTrip,
} from '../commands'
import { balanceOf, openTripsToday, receivedOn, totalToCollect, tripProfitOf, visibleTrips } from '../selectors'
import { seedDemoState, type AppState } from '../state'
import type { Next } from '../store'

const TODAY = '2026-11-22'

function run<T>(s: AppState, command: (s: AppState) => Result<Next<T>>): { state: AppState; value: T } {
  const r = command(s)
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
  return r.value
}

function code<T>(s: AppState, command: (s: AppState) => Result<Next<T>>): string | undefined {
  const r = command(s)
  return r.ok ? undefined : r.error.code
}

describe('Demo store', () => {
  it('ST-01 the seed reproduces the source: Customer1 closes October at ₹10,778 and the source trip makes ₹67,800 both ways', () => {
    const s = seedDemoState()
    const c1 = customerBalance(s.ledger, 'c1')
    expect(c1.snapshot?.closingBalance).toBe(10_778_00)
    expect(c1.balance).toBe(2_90_778_00) // + the source trip's 2,000 kg × ₹140 on 2 Nov
    const trip = s.trips[0]
    if (!trip) throw new Error('no seed trip')
    expect(trip.status).toBe('CLOSED')
    const profit = tripProfitOf(s, trip)
    expect(profit.option1?.profit).toBe(67_800_00)
    expect(profit.option2.profit).toBe(67_800_00)
    expect(totalToCollect(s)).toBe(6_92_578_00) // trip sales ₹6,81,800 + Customer1's October ₹10,778
  })

  it('ST-02 a new trip end to end: start with fuel, load, sell with cash paid now, shop sale, wastage, close, profit', () => {
    let s = seedDemoState()
    const started = run(
      s,
      startTrip({
        id: 'trip-new',
        date: TODAY,
        vehicleNumber: 'ka 21 ab 1235',
        driverId: 'u-driver',
        driverName: 'Ramesh',
        defaultSaleRatePaisePerKg: ratePerKg('140'),
        fuel: { id: 'f1', mode: 'LITRES', millilitres: litres('50'), pricePaisePerLitre: pricePerLitre('91') },
      }),
    )
    s = started.state
    expect(openTripsToday(s, TODAY).map((t) => t.vehicleNumber)).toEqual(['KA21AB1235'])

    s = run(s, addTripEvent(must(makeLoading({ id: 'l1', tripId: 'trip-new', date: TODAY, createdBy: 'u-owner', grams: kg('1000'), ratePaisePerKg: ratePerKg('120') })))).state
    s = run(
      s,
      recordSale(
        'trip-new',
        { id: 's1', customerId: 'c2', date: TODAY, createdBy: 'u-owner', grams: kg('63.1'), ratePaisePerKg: ratePerKg('128') },
        { id: 'p1', amount: rupees('5000'), method: 'UPI', reference: 'UTR1' },
      ),
    ).state
    s = run(s, shopSale('trip-new', { id: 'sh1', date: TODAY, createdBy: 'u-owner', grams: kg('900'), ratePaisePerKg: ratePerKg('130') })).state
    expect(code(s, finishTrip('trip-new', TODAY, true))).toBe('stock_not_reconciled') // 36.9 kg left
    s = run(s, addTripEvent(must(makeWastage({ id: 'w1', tripId: 'trip-new', date: TODAY, createdBy: 'u-owner', grams: kg('36.9') })))).state
    expect(code(s, finishTrip('trip-new', TODAY, false))).toBe('not_online')
    s = run(s, finishTrip('trip-new', TODAY, true)).state

    const trip = s.trips.find((t) => t.id === 'trip-new')
    if (!trip) throw new Error('no trip')
    const p = tripProfitOf(s, trip)
    // Sales: 63.1 × 128 = 8,076.80 → ₹8,077 (round) + 900 × 130 = ₹1,17,000 → ₹1,25,077. Fuel 50 × 91 = ₹4,550. Purchase ₹1,20,000.
    expect(p.option2.sales).toBe(1_25_077_00)
    expect(p.option2.profit).toBe(527_00) // 1,25,077 − 4,550 − 1,20,000
    expect(receivedOn(s, TODAY)).toBe(5_000_00)
    expect(balanceOf(s, 'c2')).toBe(73_077_00) // seed ₹70,000 + ₹8,077 − ₹5,000
  })

  it('ST-03 a driver sees and works only their own trip, at the trip rate; payments must belong to that trip', () => {
    let s = seedDemoState()
    s = run(s, startTrip({ id: 't-d', date: TODAY, vehicleNumber: 'KA21AB1235', driverId: 'u-driver', defaultSaleRatePaisePerKg: ratePerKg('140') })).state
    s = run(s, startTrip({ id: 't-o', date: TODAY, vehicleNumber: 'KA19C7788', defaultSaleRatePaisePerKg: ratePerKg('140') })).state
    s = run(s, addTripEvent(must(makeLoading({ id: 'l1', tripId: 't-d', date: TODAY, createdBy: 'u-owner', grams: kg('100'), ratePaisePerKg: ratePerKg('120') })))).state
    s = run(s, setActor('u-driver')).state

    expect(visibleTrips(s).map((t) => t.id).sort()).toEqual(['t-d', 'trip-source'])
    expect(code(s, recordSale('t-d', { id: 'x', customerId: 'c1', date: TODAY, createdBy: 'u-driver', grams: kg('10'), ratePaisePerKg: ratePerKg('135') }))).toBe('not_permitted')
    s = run(s, recordSale('t-d', { id: 's', customerId: 'c1', date: TODAY, createdBy: 'u-driver', grams: kg('10') })).state
    expect(code(s, recordPayment({ id: 'p', customerId: 'c1', date: TODAY, amount: rupees('100'), method: 'CASH' }))).toBe('not_permitted')
    s = run(s, recordPayment({ id: 'p', customerId: 'c1', date: TODAY, amount: rupees('100'), method: 'CASH', tripId: 't-d' })).state
    expect(code(s, startTrip({ id: 't-x', date: TODAY, vehicleNumber: 'KA70M9090', defaultSaleRatePaisePerKg: ratePerKg('140') }))).toBe('not_permitted')
    expect(code(s, addCustomer({ id: 'c9', shopName: 'New', date: TODAY }))).toBe('not_permitted')
    expect(code(s, reverseLedgerEntry('s', 'typo', TODAY))).toBe('not_permitted')
  })

  it('ST-04 month-end close for everyone with entries; a second close of the same month closes nothing', () => {
    let s = seedDemoState()
    const first = run(s, closeMonthForAll('2026-11', '2026-12-01'))
    expect(first.value).toBe(6)
    s = first.state
    expect(run(s, closeMonthForAll('2026-11', '2026-12-01')).value).toBe(0)
    expect(code(run(s, setActor('u-manager')).state, closeMonthForAll('2026-12', '2027-01-01'))).toBe('not_permitted')
  })

  it('ST-05 a new customer with an opening balance; a shared phone number is reported', () => {
    let s = seedDemoState()
    const added = run(s, addCustomer({ id: 'c7', shopName: 'Hotel Udupi', phone: '9876543210', openingBalance: rupees('1500'), date: TODAY }))
    s = added.state
    expect(balanceOf(s, 'c7')).toBe(1_500_00)
    const again = run(s, addCustomer({ id: 'c8', shopName: 'Udupi 2', phone: '98765 43210', date: TODAY }))
    expect(again.value.duplicateOf?.id).toBe('c7')
  })
})

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
  return r.value
}
