/** Trip rules: S-04 and S-09 from the plan, plus opening, loading, rate changes, fuel, shop sales and close (R-*). */
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { kg, makeDefaultRate, makeLoading, openTrip, ratePerKg, type Result, type Trip } from '../../src/domain'
import { closeTripWrites, openTripWrites, tripEventWrites, tripIdFor } from '../../src/data/docs'
import { as, CLOSED_TRIP, commit, OPEN_TRIP, OTHER_DRIVER_TRIP, seed, set, startEnv, TODAY, update } from './helpers'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await startEnv()
})
beforeEach(() => seed(env))
afterAll(() => env.cleanup())

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

const event = (tripId: string, data: Record<string, unknown>) => set(`trips/${tripId}/events/${String(data.id)}`, data)
const base = (id: string, createdBy = 'owner', tripId = OPEN_TRIP) => ({ id, tripId, date: TODAY, createdBy })

describe('trip records are append-only (S-04, S-09)', () => {
  it('S-04 no update or delete of a trip event or purchase, even by the owner', async () => {
    const db = as(env, 'owner').firestore()
    await assertFails(db.doc(`trips/${OPEN_TRIP}/events/exp-1`).update({ amount: 1 }))
    await assertFails(db.doc(`trips/${OPEN_TRIP}/events/exp-1`).delete())
    await assertFails(db.doc(`trips/${OPEN_TRIP}/purchases/load-1`).update({ ratePaisePerKg: 1 }))
    await assertFails(db.doc(`trips/${OPEN_TRIP}/purchases/load-1`).delete())
    await assertFails(db.doc(`trips/${OPEN_TRIP}`).delete())
  })

  it('S-09 nothing new on a closed trip', async () => {
    const owner = as(env, 'owner')
    const expense = { ...base('exp-new', 'owner', CLOSED_TRIP), type: 'EXPENSE', category: 'FOOD', amount: 10_000 }
    await assertFails(commit(owner, [event(CLOSED_TRIP, expense)]))
    await assertFails(
      commit(owner, [event(CLOSED_TRIP, { ...base('rev_exp-closed', 'owner', CLOSED_TRIP), type: 'REVERSAL', reversesId: 'exp-closed' })]),
    )
    await assertFails(
      commit(owner, [
        set('ledgerEntries/pay-c', { id: 'pay-c', customerId: 'c2', date: TODAY, createdBy: 'owner', type: 'PAYMENT', amount: 100, method: 'CASH', tripId: CLOSED_TRIP }),
      ]),
    )
    await assertFails(commit(owner, [update(`trips/${CLOSED_TRIP}`, { status: 'OPEN' })]))
    await assertFails(
      commit(owner, [
        event(CLOSED_TRIP, { ...base('rate-c', 'owner', CLOSED_TRIP), type: 'DEFAULT_RATE', ratePaisePerKg: 15_000 }),
        update(`trips/${CLOSED_TRIP}`, { ratePaisePerKg: 15_000, rateEventId: 'rate-c' }),
      ]),
    )
    // The same expense is fine on the open trip.
    await assertSucceeds(commit(owner, [event(OPEN_TRIP, { ...expense, tripId: OPEN_TRIP })]))
  })
})

describe('opening and closing a trip (U-06, U-05)', () => {
  const newTrip = (over: Partial<Trip> = {}): Trip => ({
    ...must(
      openTrip(
        [],
        {
          id: tripIdFor('2026-11-23', 'KA21AB1234'),
          date: '2026-11-23',
          createdBy: 'manager',
          vehicleNumber: 'KA21AB1234',
          driverId: 'driver',
          driverName: 'Ramesh',
          defaultSaleRatePaisePerKg: 14_000,
        },
        { actorId: 'manager', actorRole: 'manager' },
      ),
    ),
    ...over,
  })

  it('R-04 one trip per vehicle per day, opened by owner or manager with a rate', async () => {
    const manager = as(env, 'manager')
    const [write] = must(openTripWrites(newTrip()))
    if (write?.op !== 'set') throw new Error('expected a set')
    await assertFails(commit(as(env, 'driver'), must(openTripWrites(newTrip({ createdBy: 'driver' })))))
    await assertFails(commit(manager, [set('trips/trip-x7', { ...write.data, id: 'trip-x7' })]))
    await assertFails(commit(manager, must(openTripWrites(newTrip({ driverId: 'nobody' })))))
    await assertFails(commit(manager, [set(write.path, { ...write.data, vehicleNumber: 'ka21ab1234' })]))
    await assertFails(commit(manager, [set(write.path, { ...write.data, ratePaisePerKg: 12_000 })]))
    await assertFails(commit(manager, [set(write.path, { ...write.data, status: 'CLOSED' })]))
    await assertSucceeds(commit(manager, must(openTripWrites(newTrip()))))
    // A second trip for the same vehicle and day lands on the same id, which is an overwrite.
    await assertFails(commit(manager, must(openTripWrites(newTrip({ driverId: 'driver2', driverName: 'Suresh' })))))
  })

  it('R-05 closing needs every kg accounted for and the money totals saved with it', async () => {
    const closed: Trip = {
      ...newTrip({ id: OPEN_TRIP, date: TODAY }),
      status: 'CLOSED',
      closedBy: 'manager',
      closedOn: TODAY,
      closeSummary: {
        loadedGrams: 1_000_000,
        soldGrams: 900_000,
        shopSoldGrams: 100_000,
        wastageGrams: 100_000,
        purchasePaise: 12_000_000,
        salesPaise: 12_740_000,
        operatingPaise: 50_000,
      },
    }
    const writes = must(closeTripWrites(closed))
    await assertFails(commit(as(env, 'driver'), must(closeTripWrites({ ...closed, closedBy: 'driver' }))))
    await assertFails(commit(as(env, 'manager'), [writes[0]!]))
    await assertFails(commit(as(env, 'manager'), [writes[1]!]))
    await assertFails(
      commit(as(env, 'manager'), must(closeTripWrites({ ...closed, closeSummary: { ...closed.closeSummary!, wastageGrams: 90_000 } }))),
    )
    await assertSucceeds(commit(as(env, 'manager'), writes))
    await assertFails(commit(as(env, 'owner'), [update(`trips/${OPEN_TRIP}`, { closedOn: '2026-11-23' })]))
    await assertFails(as(env, 'driver').firestore().doc(`trips/${OPEN_TRIP}/totals/close`).get())
    await assertSucceeds(as(env, 'owner').firestore().doc(`trips/${OPEN_TRIP}/totals/close`).get())
  })
})

describe('loading and purchase rates (D-21)', () => {
  const loading = (createdBy = 'manager') =>
    must(makeLoading({ ...base('load-2', createdBy), grams: kg('500'), ratePaisePerKg: ratePerKg('118') }))

  it('R-03 a loading is saved as kg on the trip plus its purchase rate in purchases/, together', async () => {
    const manager = as(env, 'manager')
    const [kgPart, purchase] = tripEventWrites(loading())
    await assertFails(commit(manager, [kgPart!]))
    await assertFails(commit(manager, [purchase!]))
    if (purchase?.op !== 'set') throw new Error('expected a set')
    await assertFails(commit(manager, [kgPart!, set(purchase.path, { ...purchase.data, grams: 400_000 })]))
    await assertFails(commit(manager, [kgPart!, set(purchase.path, { ...purchase.data, amount: 5_900_001 })]))
    await assertFails(commit(as(env, 'driver'), tripEventWrites(loading('driver'))))
    await assertSucceeds(commit(manager, tripEventWrites(loading())))
  })
})

describe('trip rate (D-03, D-18)', () => {
  it('R-06 a rate change moves the trip rate with its event; drivers then sell at the new rate', async () => {
    const rate = (createdBy = 'manager') =>
      must(makeDefaultRate({ ...base('rate-1', createdBy), ratePaisePerKg: ratePerKg('145') }))
    const [rateEvent, tripUpdate] = tripEventWrites(rate())
    await assertFails(commit(as(env, 'manager'), [rateEvent!]))
    await assertFails(commit(as(env, 'manager'), [tripUpdate!]))
    await assertFails(commit(as(env, 'driver'), tripEventWrites(rate('driver'))))
    await assertSucceeds(commit(as(env, 'manager'), tripEventWrites(rate())))

    const sale = (id: string, over: Record<string, unknown>) => ({
      id, customerId: 'c2', date: TODAY, createdBy: 'driver', type: 'SALE', tripId: OPEN_TRIP, grams: 10_000,
      policyId: 'ROUND_HALF_UP_RUPEE', differenceMilliPaise: 0, ...over,
    })
    // 10 kg × ₹140 = ₹1,400 at the old rate; 10 kg × ₹145 = ₹1,450 at the new one
    await assertFails(
      commit(as(env, 'driver'), [
        set('ledgerEntries/sale-old', sale('sale-old', { ratePaisePerKg: 14_000, exactMilliPaise: 140_000_000, amount: 140_000 })),
      ]),
    )
    await assertSucceeds(
      commit(as(env, 'driver'), [
        set('ledgerEntries/sale-new', sale('sale-new', { ratePaisePerKg: 14_500, exactMilliPaise: 145_000_000, amount: 145_000 })),
      ]),
    )

    // A rate change is replaced by a new one, never reversed (ENG-18).
    await assertFails(
      commit(as(env, 'manager'), [event(OPEN_TRIP, { ...base('rev_rate-1', 'manager'), type: 'REVERSAL', reversesId: 'rate-1' })]),
    )
  })
})

describe('fuel, expenses, shop sales and reversals', () => {
  it('R-11 fuel by pump amount or by litres must add up (F-FUEL-01/02)', async () => {
    // ₹8,000 at ₹91/L → 87.912 L
    const byAmount = (ml: number) => ({
      ...base('fuel-a'), type: 'FUEL', fuelType: 'DIESEL', entryMode: 'AMOUNT', millilitres: ml,
      pricePaisePerLitre: 9_100, amount: 800_000,
    })
    await assertFails(commit(as(env, 'owner'), [event(OPEN_TRIP, byAmount(87_913))]))
    await assertSucceeds(commit(as(env, 'owner'), [event(OPEN_TRIP, byAmount(87_912))]))
    // 50 L × ₹91 = ₹4,550
    const byLitres = (amount: number) => ({
      ...base('fuel-l', 'driver'), type: 'FUEL', fuelType: 'DIESEL', entryMode: 'LITRES', millilitres: 50_000,
      pricePaisePerLitre: 9_100, amount,
    })
    await assertFails(commit(as(env, 'driver'), [event(OPEN_TRIP, byLitres(455_001))]))
    await assertSucceeds(commit(as(env, 'driver'), [event(OPEN_TRIP, byLitres(455_000))]))
    await assertFails(
      commit(as(env, 'driver'), [event(OTHER_DRIVER_TRIP, { ...byLitres(455_000), id: 'fuel-x', tripId: OTHER_DRIVER_TRIP })]),
    )
  })

  it('R-12 expenses, shop sales at the trip rate, and one reversal per event', async () => {
    const driver = as(env, 'driver')
    const labour = { ...base('lab-1', 'driver'), type: 'EXPENSE', category: 'LABOUR', slot: 'LABOUR_1', workerName: 'Anil', amount: 50_000 }
    await assertSucceeds(commit(driver, [event(OPEN_TRIP, labour)]))
    await assertFails(commit(driver, [event(OPEN_TRIP, { ...labour, id: 'food-1', category: 'FOOD' })]))
    await assertFails(commit(driver, [event(OPEN_TRIP, { ...labour, id: 'fuel-exp', category: 'FUEL' })]))

    // 9 kg × ₹140 = ₹1,260 at the trip rate
    const shop = (over: Record<string, unknown> = {}) => ({
      ...base('shop-1', 'driver'), type: 'SHOP_SALE', grams: 9_000, ratePaisePerKg: 14_000, exactMilliPaise: 126_000_000,
      amount: 126_000, policyId: 'ROUND_HALF_UP_RUPEE', method: 'CASH', ...over,
    })
    await assertFails(commit(driver, [event(OPEN_TRIP, shop({ ratePaisePerKg: 13_000, exactMilliPaise: 117_000_000, amount: 117_000 }))]))
    await assertSucceeds(commit(driver, [event(OPEN_TRIP, shop())]))
    // 900 kg × ₹130 = ₹1,17,000 at the shop rate the manager chose
    await assertSucceeds(
      commit(as(env, 'manager'), [
        event(OPEN_TRIP, shop({ id: 'shop-2', createdBy: 'manager', grams: 900_000, ratePaisePerKg: 13_000, exactMilliPaise: 11_700_000_000, amount: 11_700_000 })),
      ]),
    )

    const reversal = (reversesId: string, createdBy = 'manager') => ({
      ...base(`rev_${reversesId}`, createdBy), type: 'REVERSAL', reversesId, reason: 'Typed twice',
    })
    await assertFails(commit(driver, [event(OPEN_TRIP, reversal('exp-1', 'driver'))]))
    await assertFails(commit(as(env, 'manager'), [event(OPEN_TRIP, reversal('exp-404'))]))
    await assertFails(commit(as(env, 'manager'), [event(OPEN_TRIP, { ...reversal('exp-1'), id: 'undo-exp-1' })]))
    await assertSucceeds(commit(as(env, 'manager'), [event(OPEN_TRIP, reversal('exp-1'))]))
    await assertFails(commit(as(env, 'owner'), [event(OPEN_TRIP, { ...reversal('exp-1', 'owner'), reason: 'Again' })]))
    await assertFails(commit(as(env, 'manager'), [event(OPEN_TRIP, reversal('rev_exp-1'))]))
  })

  it('R-15 an order names a real customer and keeps exact paise', async () => {
    // 12.5 kg × ₹140 = ₹1,750
    const order = (over: Record<string, unknown> = {}) => ({
      ...base('ord-1', 'driver'), type: 'ORDER', customerId: 'c2', grams: 12_500, ratePaisePerKg: 14_000, amount: 175_000, ...over,
    })
    await assertFails(commit(as(env, 'driver'), [event(OPEN_TRIP, order({ customerId: 'c-missing' }))]))
    await assertFails(commit(as(env, 'driver'), [event(OPEN_TRIP, order({ amount: 175_100 }))]))
    await assertSucceeds(commit(as(env, 'driver'), [event(OPEN_TRIP, order())]))
  })
})
