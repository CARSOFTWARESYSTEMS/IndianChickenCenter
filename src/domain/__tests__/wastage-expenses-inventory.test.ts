import { describe, expect, it } from 'vitest'
import { makeExpense, rupees, type ExpenseCategory } from '../index'
import { errorCode, must, OWNER, sourceTrip, TRIP_DATE, TripBuilder } from './fixtures'

describe('Wastage, expenses and inventory', () => {
  it('F-WST-01 5,000 loaded − 4,870 sold = 130 kg, valued at ₹140 = ₹18,200', () => {
    const t = sourceTrip()
    expect(t.summary().wastageGrams).toBe(130_000)
    const option1 = t.profit().option1
    expect(option1?.valuationRatePaisePerKg).toBe(140_00)
    expect(option1?.wastageValue).toBe(18_200_00)
  })

  it('F-EXP-01 operating = fuel ₹8,000 + labour ₹6,000 = ₹14,000', () => {
    const s = sourceTrip().summary()
    expect(s.fuelPaise).toBe(8_000_00)
    expect(s.expensesByCategory.LABOUR).toBe(6_000_00)
    expect(s.operatingPaise).toBe(14_000_00)
  })

  it('F-EXP-02 total expenses including wastage = ₹32,200', () => {
    expect(sourceTrip().profit().option1?.totalExpenses).toBe(32_200_00)
  })

  it('F-EXP-03 fuel from Starting Point is listed once, never duplicated', () => {
    const t = new TripBuilder()
    t.fuelByAmount('8000', '91')
    const s = t.summary()
    expect(s.fuel).toHaveLength(1)
    expect(s.fuelPaise).toBe(8_000_00)
    expect(s.operatingPaise).toBe(8_000_00) // not ₹16,000

    const asExpense = makeExpense({
      id: 'x',
      tripId: 'trip-1',
      date: TRIP_DATE,
      createdBy: OWNER,
      category: 'FUEL' as unknown as ExpenseCategory,
      amount: rupees('8000'),
    })
    expect(errorCode(asExpense)).toBe('invalid_input')
  })

  it('F-EXP-04 labour per person: Driver + Labour 1 + Labour 2 at ₹2,000 = ₹6,000', () => {
    const t = new TripBuilder()
    t.expense('LABOUR', '2000', 'DRIVER')
    t.expense('LABOUR', '2000', 'LABOUR_1')
    t.expense('LABOUR', '2000', 'LABOUR_2')
    expect(t.summary().expensesByCategory.LABOUR).toBe(6_000_00)
  })

  it('F-EXP-05 maintenance ₹0, food ₹300, other ₹150 on top of ₹14,000 = ₹14,450', () => {
    const t = new TripBuilder()
    t.fuelByAmount('8000', '91')
    t.expense('LABOUR', '6000')
    t.expense('MAINTENANCE', '0')
    t.expense('FOOD', '300')
    t.expense('OTHER', '150')
    expect(t.summary().operatingPaise).toBe(14_450_00)
  })

  it('F-INV-01 a sale beyond stock is blocked; with explicit confirmation it is saved and flagged', () => {
    const t = new TripBuilder()
    t.load('5000', '120')
    must(t.sell('customer1', '4950', '140'))

    const blocked = t.sell('customer2', '100', '140')
    expect(errorCode(blocked)).toBe('exceeds_stock')
    expect(blocked.ok ? undefined : blocked.error.details?.remainingGrams).toBe(50_000)
    expect(t.summary().soldGrams).toBe(4_950_000)

    const confirmed = must(t.sell('customer2', '100', '140', { confirm: true }))
    expect(confirmed.oversold).toBe(true)
    expect(confirmed.entry.oversellConfirmed).toBe(true)
    expect(t.summary().remainingGrams).toBe(-50_000)
  })

  it('F-INV-02 closing with 130 kg unaccounted is blocked until a wastage line covers it', () => {
    const t = sourceTrip({ withWastage: false, close: false })
    const blocked = t.close()
    expect(errorCode(blocked)).toBe('stock_not_reconciled')
    expect(blocked.ok ? undefined : blocked.error.details?.remainingGrams).toBe(130_000)

    t.wastage('130')
    expect(t.summary().remainingGrams).toBe(0)
    expect(must(t.close()).status).toBe('CLOSED')
  })

  it('F-INV-03 an order never moves stock; delivery tracks against it', () => {
    const t = new TripBuilder()
    t.load('5000', '120')
    t.order('customer2', '500', '140')
    expect(t.summary().remainingGrams).toBe(5_000_000)

    must(t.sell('customer2', '300', '140'))
    const s = t.summary()
    expect(s.remainingGrams).toBe(4_700_000)
    expect(s.orders).toEqual([
      { customerId: 'customer2', orderedGrams: 500_000, deliveredGrams: 300_000, remainingGrams: 200_000, status: 'PART' },
    ])
  })
})
