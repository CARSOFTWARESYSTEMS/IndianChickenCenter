/** DIFF-*: what each command saves to the cloud, and in which batches. Expected writes are written out by hand. */
import { describe, expect, it } from 'vitest'
import { kg, makeLoading, ratePerKg, rupees, type Result } from '../../domain'
import { addCustomer, addTripEvent, closeMonthForAll, editCustomer, recordSale, setActor, startTrip } from '../../store/commands'
import { seedDemoState, type AppState } from '../../store/state'
import type { Next } from '../../store/store'
import { changesBetween, type Change } from '../diff'
import { tripIdFor } from '../docs'

const TODAY = '2026-11-22'
const TRIP = tripIdFor(TODAY, 'KA21Z9999')

function run<T>(s: AppState, command: (s: AppState) => Result<Next<T>>): AppState {
  const r = command(s)
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
  return r.value.state
}

function change(prev: AppState, next: AppState): Change {
  const r = changesBetween(prev, next)
  if (!r.ok || !r.value) throw new Error('expected a change')
  return r.value
}

const paths = (c: Change) => c.batches.map((b) => b.map((w) => `${w.op} ${w.path}`))

function withTrip(): AppState {
  return run(
    seedDemoState(),
    startTrip({ id: TRIP, date: TODAY, vehicleNumber: 'KA21Z9999', driverId: 'u-driver', driverName: 'Ramesh', defaultSaleRatePaisePerKg: 14_000 }),
  )
}

describe('changes saved to the cloud', () => {
  it('DIFF-01 a new trip on a new vehicle goes first and alone; its diesel follows in the next batch', () => {
    const prev = seedDemoState()
    const next = run(
      prev,
      startTrip({
        id: TRIP, date: TODAY, vehicleNumber: 'ka-21 z 9999', defaultSaleRatePaisePerKg: 14_000,
        fuel: { id: 'fuel-1', mode: 'AMOUNT', amount: 800_000, pricePaisePerLitre: 9_100 },
      }),
    )
    const c = change(prev, next)
    expect(c.kind).toBe('tripOpen')
    expect(c.detail).toBe('KA21Z9999')
    expect(paths(c)).toEqual([
      ['set vehicles/KA21Z9999', `set trips/${TRIP}`],
      [`set trips/${TRIP}/events/fuel-1`],
    ])
  })

  it('DIFF-02 a sale paid on the spot is one batch: the sale and its payment together', () => {
    const prev = withTrip()
    const loaded = run(prev, addTripEvent(must(makeLoading({ id: 'load-1', tripId: TRIP, date: TODAY, createdBy: 'u-owner', grams: kg('100'), ratePaisePerKg: ratePerKg('120') }))))
    const next = run(
      loaded,
      recordSale(TRIP, { id: 'sale-1', customerId: 'c2', date: TODAY, createdBy: 'u-owner', grams: 10_000 }, { id: 'pay-1', amount: rupees('500'), method: 'CASH' }),
    )
    const c = change(loaded, next)
    expect(c.kind).toBe('sale')
    expect(c.detail).toBe('Customer2 · 10 kg')
    expect(paths(c)).toEqual([['set ledgerEntries/sale-1', 'set ledgerEntries/pay-1']])
  })

  it('DIFF-03 a loading saves kg on the trip and the purchase rate beside it', () => {
    const prev = withTrip()
    const next = run(prev, addTripEvent(must(makeLoading({ id: 'load-1', tripId: TRIP, date: TODAY, createdBy: 'u-owner', grams: kg('100'), ratePaisePerKg: ratePerKg('120') }))))
    expect(paths(change(prev, next))).toEqual([[`set trips/${TRIP}/events/load-1`, `set trips/${TRIP}/purchases/load-1`]])
  })

  it('DIFF-04 a month-end close for six customers is split four to a batch', () => {
    const prev = seedDemoState()
    const next = run(prev, closeMonthForAll('2026-11', '2026-12-01'))
    const c = change(prev, next)
    expect(c.kind).toBe('monthEnd')
    expect(c.detail).toBe('2026-11 · 6')
    expect(c.batches.map((b) => b.length)).toEqual([8, 4])
    expect(c.batches[0]?.slice(0, 2).map((w) => `${w.op} ${w.path}`)).toEqual(['set ledgerEntries/snap_c1_2026-11', 'set ledgerClosures/c1'])
  })

  it('DIFF-05 a new customer is saved with their opening balance; an edit saves the customer only', () => {
    const prev = seedDemoState()
    const added = run(prev, addCustomer({ id: 'c7', shopName: 'Customer7', openingBalance: rupees('2500'), date: TODAY }))
    expect(paths(change(prev, added))).toEqual([['set customers/c7', 'set ledgerEntries/open_c7']])
    const edited = run(added, editCustomer('c7', { shopName: 'Customer 7 Ujire', name: '', phone: '' }))
    expect(paths(change(added, edited))).toEqual([['set customers/c7']])
  })

  it('DIFF-06 nothing is saved when only the acting person changes', () => {
    const prev = seedDemoState()
    const r = changesBetween(prev, run(prev, setActor('u-driver')))
    expect(r.ok && r.value).toBe(undefined)
  })

  it('DIFF-07 a trip whose id is not trip_<date>_<vehicle> is refused before anything is sent', () => {
    const prev = seedDemoState()
    const next = run(prev, startTrip({ id: 'trip-x7', date: TODAY, vehicleNumber: 'KA21Z9999', defaultSaleRatePaisePerKg: 14_000 }))
    expect(changesBetween(prev, next).ok).toBe(false)
  })
})

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}
