import { describe, expect, it } from 'vitest'
import {
  kg,
  litres,
  makeFuelByLitres,
  makeLoading,
  makeSale,
  postTripEvent,
  pricePerLitre,
  ratePerKg,
  ROUNDING_POLICIES,
} from '../index'
import { errorCode, must, owner, OWNER, sourceTrip, TRIP_DATE, TripBuilder } from './fixtures'

const ids = { tripId: 'trip-1', date: TRIP_DATE, createdBy: OWNER }

describe('Purchases, fuel and sales', () => {
  it('F-FUEL-01 87.5 L × ₹91/L = ₹7,962.50', () => {
    const fuel = must(
      makeFuelByLitres({ ...ids, id: 'f1', millilitres: litres('87.5'), pricePaisePerLitre: pricePerLitre('91') }),
    )
    expect(fuel.millilitres).toBe(87_500)
    expect(fuel.amount).toBe(7_962_50)
  })

  it('F-FUEL-02 a later diesel price never rewrites a posted fuel entry', () => {
    const t = new TripBuilder()
    const first = t.fuelByLitres('87.5', '91')
    const before = structuredClone(first)

    t.fuelByLitres('10', '93') // the next fill, at today's new price

    const rewrite = must(
      makeFuelByLitres({ ...ids, id: first.id, millilitres: first.millilitres, pricePaisePerLitre: pricePerLitre('93') }),
    )
    expect(errorCode(postTripEvent(t.trip, t.events, rewrite, owner))).toBe('id_conflict')

    const stored = t.events.find((e) => e.id === first.id)
    expect(stored).toEqual(before)
    expect(stored).toMatchObject({ pricePaisePerLitre: 91_00, amount: 7_962_50 })
    expect(t.summary().fuelPaise).toBe(8_892_50) // ₹7,962.50 + ₹930
  })

  it('F-LOAD-01 5,000 kg × ₹100 = ₹5,00,000', () => {
    const load = must(makeLoading({ ...ids, id: 'l1', grams: kg('5000'), ratePaisePerKg: ratePerKg('100') }))
    expect(load.grams).toBe(5_000_000)
    expect(load.amount).toBe(5_00_000_00)
  })

  it('F-LOAD-02 5,000 kg × ₹120 = ₹6,00,000', () => {
    const load = must(makeLoading({ ...ids, id: 'l1', grams: kg('5000'), ratePaisePerKg: ratePerKg('120') }))
    expect(load.amount).toBe(6_00_000_00)
  })

  it('F-LOAD-03 two loading points at different rates: 5,000 kg, ₹5,80,000', () => {
    const t = new TripBuilder()
    t.load('3000', '120', 'Point A')
    t.load('2000', '110', 'Point B')
    const s = t.summary()
    expect(s.loadedGrams).toBe(5_000_000)
    expect(s.purchasePaise).toBe(5_80_000_00)
    expect(s.loadings).toHaveLength(2)
  })

  it.each([
    ['F-SALE-01', '2000', 2_80_000_00],
    ['F-SALE-02', '500', 70_000_00],
    ['F-SALE-03', '200', 28_000_00],
    ['F-SALE-04', '1000', 1_40_000_00],
    ['F-SALE-05', '300', 42_000_00],
    ['F-SALE-06', '870', 1_21_800_00],
  ])('%s %s kg × ₹140', (_id, weight, expected) => {
    for (const policy of ROUNDING_POLICIES) {
      const sale = must(
        makeSale({
          id: 's',
          customerId: 'c',
          date: TRIP_DATE,
          createdBy: OWNER,
          grams: kg(weight),
          ratePaisePerKg: ratePerKg('140'),
          policy,
        }),
      )
      expect(sale.amount).toBe(expected)
    }
  })

  it('F-SALE-07 trip total of the six sales: 4,870 kg, ₹6,81,800', () => {
    const s = sourceTrip({ withWastage: false, close: false }).summary()
    expect(s.sales).toHaveLength(6)
    expect(s.soldGrams).toBe(4_870_000)
    expect(s.salesPaise).toBe(6_81_800_00)
  })

  it('F-SALE-08 different customer rates: 2,000 kg × ₹140 + 2,870 kg × ₹135 = ₹6,67,450', () => {
    const t = new TripBuilder()
    t.load('5000', '120')
    must(t.sell('customer1', '2000', '140'))
    must(t.sell('customer2', '2870', '135'))
    expect(t.summary().salesPaise).toBe(6_67_450_00)
  })
})
