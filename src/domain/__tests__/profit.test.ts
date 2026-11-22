import { describe, expect, it } from 'vitest'
import { ratePerKg } from '../index'
import { must, sourceTrip, TripBuilder } from './fixtures'

/** F-SALE-08 rates on the source trip: 2,000 kg × ₹140 + 2,870 kg × ₹135, 130 kg wastage. */
function mixedRateTrip() {
  const t = new TripBuilder()
  t.fuelByAmount('8000', '91')
  t.load('5000', '120')
  must(t.sell('customer1', '2000', '140'))
  must(t.sell('customer2', '2870', '135'))
  t.expense('LABOUR', '6000')
  t.wastage('130')
  must(t.close())
  return t
}

describe('Profit', () => {
  it('F-PRF-01 Option 1: ₹7,00,000 − ₹32,200 = ₹6,67,800; profit +₹67,800 (never −₹67,800)', () => {
    const o1 = sourceTrip().profit().option1
    expect(o1).toEqual({
      valuation: 'AVERAGE_SELLING_RATE',
      valuationRatePaisePerKg: 140_00,
      fullLoadValue: 7_00_000_00,
      wastageValue: 18_200_00,
      operating: 14_000_00,
      totalExpenses: 32_200_00,
      afterExpenses: 6_67_800_00,
      purchases: 6_00_000_00,
      profit: 67_800_00,
    })
  })

  it('F-PRF-02 Option 2: ₹6,81,800 − ₹14,000 = ₹6,67,800; profit ₹67,800', () => {
    const report = sourceTrip().profit()
    expect(report.option2).toEqual({
      sales: 6_81_800_00,
      operating: 14_000_00,
      afterExpenses: 6_67_800_00,
      purchases: 6_00_000_00,
      profit: 67_800_00,
    })
    expect(report.methodsMatch).toBe(true)
    expect(report.provisional).toBe(false)
  })

  it('F-PRF-03 different customer rates: default valuation makes both options ₹53,450', () => {
    const report = mixedRateTrip().profit()
    expect(report.option2.profit).toBe(53_450_00)
    expect(report.option1?.fullLoadValue).toBe(6_85_266_94)
    expect(report.option1?.wastageValue).toBe(17_816_94)
    expect(report.option1?.profit).toBe(53_450_00)
    expect(report.differencePaise).toBe(0)
    expect(report.methodsMatch).toBe(true)
  })

  it('F-PRF-04 valuation overridden to ₹140: Option 1 ₹67,800, Option 2 ₹53,450, difference ₹14,350 shown', () => {
    const report = mixedRateTrip().profit({ valuationOverridePaisePerKg: ratePerKg('140') })
    expect(report.option1?.valuation).toBe('OVERRIDE')
    expect(report.option1?.profit).toBe(67_800_00)
    expect(report.option2.profit).toBe(53_450_00)
    expect(report.differencePaise).toBe(14_350_00)
    expect(report.methodsMatch).toBe(false)
  })

  it('F-PRF-05 an open trip with 200 kg unaccounted is provisional', () => {
    const t = new TripBuilder()
    t.load('5000', '120')
    must(t.sell('customer1', '2000', '140'))
    must(t.sell('customer2', '2800', '140'))
    const report = t.profit()
    expect(report.provisional).toBe(true)
    expect(report.unaccountedGrams).toBe(200_000)
  })

  it('F-PRF-06 source sales with purchase at ₹100/kg: both options ₹1,67,800', () => {
    const report = sourceTrip({ purchaseRate: '100' }).profit()
    expect(report.option1?.profit).toBe(1_67_800_00)
    expect(report.option2.profit).toBe(1_67_800_00)
  })
})
