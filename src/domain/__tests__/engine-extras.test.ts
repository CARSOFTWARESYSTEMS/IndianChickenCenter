/**
 * Engine rules beyond the plan's 49 financial tests. Several mirror the security-rule tests (S-*)
 * that P4 will run in the Firebase Emulator, so the app and the rules agree.
 */
import { describe, expect, it } from 'vitest'
import {
  financialYearOf,
  formatBillNumber,
  formatKg,
  formatLitres,
  kg,
  makeAdjustment,
  makeDefaultRate,
  makeFuelByAmount,
  makeOpeningBalance,
  makeReversal,
  makeSale,
  makeTripReversal,
  parseKg,
  parseRupees,
  postEntry,
  postTripEvent,
  pricePerLitre,
  ratePerKg,
  rupees,
  todayInKolkata,
  type LedgerEntry,
  type ReversalEntry,
  type SaleEntry,
} from '../index'
import {
  DRIVER,
  errorCode,
  LEDGER_CUSTOMER,
  LedgerBuilder,
  manager,
  MANAGER,
  must,
  owner,
  OWNER,
  sourceLedger,
  sourceTrip,
  TRIP_DATE,
  TripBuilder,
} from './fixtures'

describe('Engine extras', () => {
  it('ENG-01 inputs are parsed from text into integer units, never through floats', () => {
    expect(kg('63.1')).toBe(63_100)
    expect(kg(63.1)).toBe(63_100)
    expect(kg('0.005')).toBe(5)
    expect(rupees('6,81,800')).toBe(6_81_800_00)
    expect(rupees('8076.80')).toBe(8_076_80)
    expect(errorCode(parseKg('1.2345'))).toBe('invalid_input')
    expect(errorCode(parseKg('-5'))).toBe('invalid_input')
    expect(errorCode(parseKg('abc'))).toBe('invalid_input')
    expect(errorCode(parseRupees('0.005'))).toBe('invalid_input')
  })

  it('ENG-02 sales cannot be posted until the owner picks a rounding policy (U-01)', () => {
    const input = { id: 's', customerId: 'c', date: TRIP_DATE, createdBy: OWNER, grams: kg('10'), ratePaisePerKg: ratePerKg('140') }
    expect(errorCode(makeSale({ ...input, policy: null }))).toBe('rounding_policy_unset')

    const t = new TripBuilder()
    t.load('100', '120')
    expect(errorCode(t.sell('customer1', '10', '140', { policy: null }))).toBe('rounding_policy_unset')
    expect(t.ledger).toHaveLength(0)
  })

  it('ENG-03 opening balance: fixed id, first entry only, one per customer, no advance until U-10', () => {
    const opening = must(makeOpeningBalance({ customerId: 'customer1', date: '2026-10-01', createdBy: OWNER, amount: rupees('10625') }))
    expect(opening.id).toBe('open_customer1')

    const l = new LedgerBuilder()
    l.sale('sale-1', '10', '130', '2026-10-02')
    expect(errorCode(l.post(opening))).toBe('opening_balance_not_first')

    const fresh = new LedgerBuilder()
    must(fresh.post(opening))
    const second = must(makeOpeningBalance({ customerId: 'customer1', date: '2026-10-01', createdBy: OWNER, amount: rupees('500') }))
    expect(errorCode(fresh.post(second))).toBe('duplicate_opening_balance')
    expect(errorCode(fresh.post(opening))).toBeUndefined() // identical retry is "already saved"

    const advance = makeOpeningBalance({ customerId: 'c2', date: '2026-10-01', createdBy: OWNER, amount: rupees('500'), direction: 'CREDIT' })
    expect(errorCode(advance)).toBe('decision_pending')
  })

  it('ENG-04 reversals: fixed id rev_<id>, must exist, must mirror the amount, cannot reverse a reversal', () => {
    const l = sourceLedger()
    const ghost = { id: 'rev_nothing', customerId: LEDGER_CUSTOMER, date: '2026-10-25', createdBy: OWNER, type: 'REVERSAL', reversesId: 'nothing', direction: 'CREDIT', amount: 100 } satisfies ReversalEntry
    expect(errorCode(l.post(ghost))).toBe('reversal_target_missing')

    const sale = l.entries.find((e) => e.id === 'sale-1') as SaleEntry
    const good = must(makeReversal(sale, { date: '2026-10-25', createdBy: OWNER }))
    expect(errorCode(l.post({ ...good, amount: good.amount - 100 }))).toBe('reversal_amount_mismatch')
    expect(errorCode(l.post({ ...good, id: 'some-other-id' }))).toBe('invalid_input')

    must(l.post(good))
    expect(errorCode(makeReversal(good, { date: '2026-10-26', createdBy: OWNER }))).toBe('cannot_reverse')
  })

  it('ENG-05 a closed month takes no new entries; date them in the open month instead', () => {
    const l = sourceLedger()
    expect(errorCode(l.closeMonth('2026-11', '2026-11-22'))).toBe('invalid_input') // November has not ended
    expect(errorCode(l.closeMonth('2026-10', '2026-11-01', manager))).toBe('not_permitted')
    must(l.closeMonth('2026-10', '2026-11-01'))

    const late = must(makeSale({ id: 'late', customerId: LEDGER_CUSTOMER, date: '2026-10-30', createdBy: OWNER, grams: kg('10'), ratePaisePerKg: ratePerKg('130'), policy: 'TRUNCATE_RUPEE' }))
    expect(errorCode(l.post(late))).toBe('month_closed')
    expect(must(l.post({ ...late, date: '2026-11-02' })).status).toBe('saved')
  })

  it('ENG-06 a sale whose amount does not match kg × rate is rejected (mirrors S-05)', () => {
    const l = sourceLedger()
    const sale = must(makeSale({ id: 'x', customerId: LEDGER_CUSTOMER, date: '2026-10-25', createdBy: OWNER, grams: kg('63.1'), ratePaisePerKg: ratePerKg('128'), policy: 'TRUNCATE_RUPEE' }))
    expect(errorCode(l.post({ ...sale, amount: 8_077_00 }))).toBe('amount_mismatch')
    expect(errorCode(l.post({ ...sale, policyId: 'EXACT_PAISE' }))).toBe('amount_mismatch')
  })

  it('ENG-07 entries must be created by the signed-in user (mirrors S-06)', () => {
    const l = sourceLedger()
    const sale = must(makeSale({ id: 'x', customerId: LEDGER_CUSTOMER, date: '2026-10-25', createdBy: DRIVER, grams: kg('1'), ratePaisePerKg: ratePerKg('130'), policy: 'TRUNCATE_RUPEE' }))
    expect(errorCode(l.post(sale, owner))).toBe('actor_mismatch')
  })

  it('ENG-08 only the owner posts adjustments, not even a manager (mirrors S-08)', () => {
    const l = sourceLedger()
    const adj = must(makeAdjustment({ id: 'adj', customerId: LEDGER_CUSTOMER, date: '2026-10-25', createdBy: MANAGER, direction: 'DEBIT', amount: rupees('500'), reason: 'Crates' }))
    expect(errorCode(l.post(adj, manager))).toBe('not_permitted')
  })

  it('ENG-09 a closed trip is read-only: no sales, events or sale reversals (mirrors S-09)', () => {
    const t = sourceTrip()
    expect(t.trip.status).toBe('CLOSED')
    expect(errorCode(t.sell('customer1', '1', '140'))).toBe('trip_closed')

    const expense = { id: 'late-exp', tripId: t.trip.id, date: TRIP_DATE, createdBy: OWNER, type: 'EXPENSE', category: 'FOOD', amount: 300_00 } as const
    expect(errorCode(postTripEvent(t.trip, t.events, expense, owner))).toBe('trip_closed')

    const sale = t.ledger.find((e) => e.type === 'SALE') as SaleEntry
    const reversal = must(makeReversal(sale, { date: TRIP_DATE, createdBy: OWNER }))
    const ctx = { ...owner, tripInfo: () => ({ status: t.trip.status }) }
    expect(errorCode(postEntry(t.ledger, reversal, ctx))).toBe('trip_closed')
  })

  it('ENG-10 closing a trip needs the network, no unsynced writes and no oversold kg (D-11)', () => {
    const t = sourceTrip({ close: false })
    expect(errorCode(t.close({ online: false }))).toBe('not_online')
    expect(errorCode(t.close({ hasPendingWrites: true }))).toBe('pending_writes')

    const over = new TripBuilder()
    over.load('100', '120')
    must(over.sell('customer1', '110', '140', { confirm: true }))
    const result = over.close()
    expect(errorCode(result)).toBe('oversold')
    expect(result.ok ? undefined : result.error.details?.remainingGrams).toBe(-10_000)
  })

  it('ENG-11 fuel by pump amount: ₹8,000 at ₹91/L keeps ₹8,000 and derives 87.912 L', () => {
    const fuel = must(makeFuelByAmount({ id: 'f', tripId: 'trip-1', date: TRIP_DATE, createdBy: OWNER, amount: rupees('8000'), pricePaisePerLitre: pricePerLitre('91') }))
    expect(fuel.amount).toBe(8_000_00)
    expect(fuel.millilitres).toBe(87_912)
    expect(formatLitres(fuel.millilitres)).toBe('87.912 L')
  })

  it('ENG-12 retrying the same trip sale (double tap, reconnect) is one entry and never trips the stock check', () => {
    const t = new TripBuilder()
    t.load('100', '120')
    const first = must(t.sell('customer1', '100', '140', { id: 'sale-x' }))
    const retry = must(t.sell('customer1', '100', '140', { id: 'sale-x' }))
    expect(first.status).toBe('saved')
    expect(retry.status).toBe('already-saved')
    expect(t.ledger).toHaveLength(1)
    expect(errorCode(t.sell('customer2', '100', '140', { id: 'sale-x' }))).toBe('id_conflict')
  })

  it('ENG-13 visible bill number uses the Indian financial year (D-07)', () => {
    expect(formatBillNumber('2026-11-22', 1)).toBe('ICC/2026-27/0001')
    expect(financialYearOf('2027-03-31')).toBe('2026-27')
    expect(financialYearOf('2026-03-31')).toBe('2025-26')
    expect(financialYearOf('2026-04-01')).toBe('2026-27')
  })

  it("ENG-14 today's date is taken in Asia/Kolkata, whatever the device time zone", () => {
    expect(todayInKolkata(new Date('2026-11-21T19:00:00Z'))).toBe('2026-11-22')
    expect(todayInKolkata(new Date('2026-11-21T18:00:00Z'))).toBe('2026-11-21')
  })

  it('ENG-15 reversing a trip event removes it from totals; it can be reversed only once', () => {
    const t = new TripBuilder()
    const wrong = t.load('500', '120')
    t.load('5000', '120')
    const reversal = must(makeTripReversal(wrong, { date: TRIP_DATE, createdBy: OWNER, reason: 'Typed twice' }))
    t.add({ ok: true, value: reversal })
    expect(t.summary().loadedGrams).toBe(5_000_000)
    expect(t.summary().purchasePaise).toBe(6_00_000_00)

    const again = must(makeTripReversal(wrong, { date: TRIP_DATE, createdBy: OWNER }))
    expect(errorCode(postTripEvent(t.trip, t.events, again, owner))).toBe('already_reversed')
  })

  it('ENG-16 weights display with Indian grouping and trimmed decimals', () => {
    expect(formatKg(216_300)).toBe('216.3 kg')
    expect(formatKg(5_000_000)).toBe('5,000 kg')
    expect(formatKg(-50_000)).toBe('-50 kg')
  })

  it('ENG-17 entries cannot be back-dated before the opening balance', () => {
    const l = new LedgerBuilder()
    l.opening('10625', '2026-10-01')
    const early = must(makeSale({ id: 'early', customerId: LEDGER_CUSTOMER, date: '2026-09-30', createdBy: OWNER, grams: kg('1'), ratePaisePerKg: ratePerKg('130'), policy: 'TRUNCATE_RUPEE' }))
    const entries: LedgerEntry[] = l.entries
    expect(errorCode(postEntry(entries, early, owner))).toBe('invalid_input')
  })

  it('ENG-18 a trip rate change is replaced by a new rate, never reversed (the stored trip holds the current rate)', () => {
    const t = new TripBuilder()
    const rate = t.add(makeDefaultRate({ id: 'rate-1', tripId: t.trip.id, date: TRIP_DATE, createdBy: OWNER, ratePaisePerKg: ratePerKg('145') }))
    expect(errorCode(makeTripReversal(rate, { date: TRIP_DATE, createdBy: OWNER }))).toBe('cannot_reverse')
    const forged = { id: 'rev_rate-1', tripId: t.trip.id, date: TRIP_DATE, createdBy: OWNER, type: 'REVERSAL' as const, reversesId: 'rate-1' }
    expect(errorCode(postTripEvent(t.trip, t.events, forged, owner))).toBe('cannot_reverse')
    expect(t.summary().defaultSaleRatePaisePerKg).toBe(14_500)
  })
})
