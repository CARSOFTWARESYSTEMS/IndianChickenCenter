/** Customer ledger rules: S-04–S-08 and S-10 from the plan, plus driver limits, month end and opening balances. */
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  kg,
  makeAdjustment,
  makeOpeningBalance,
  makePayment,
  makeReversal,
  makeSale,
  ratePerKg,
  rupees,
  type FinancialEntry,
  type Result,
} from '../../src/domain'
import { ledgerEntryWrites, newCustomerWrites } from '../../src/data/docs'
import { as, CLOSED_TRIP, commit, OPEN_TRIP, OTHER_DRIVER_TRIP, SEED_SALE, seed, set, startEnv, TODAY } from './helpers'

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

const entry = (data: Record<string, unknown>) => set(`ledgerEntries/${String(data.id)}`, data)

/** A literal SALE: 63.1 kg × ₹128 = ₹8,076.80 exact, for customer c2 on the open trip. */
const sale = (over: Record<string, unknown> = {}) => ({ ...SEED_SALE, id: 'sale-2', customerId: 'c2', ...over })

/** 10 kg at the trip rate ₹140 = ₹1,400. */
const driverSale = (over: Record<string, unknown> = {}) =>
  sale({
    id: 'sale-d', createdBy: 'driver', grams: 10_000, ratePaisePerKg: 14_000, exactMilliPaise: 140_000_000,
    amount: 140_000, differenceMilliPaise: 0, ...over,
  })

describe('posted entries are never edited (S-04)', () => {
  it('S-04 no update or delete of a ledger entry, even by the owner', async () => {
    const db = as(env, 'owner').firestore()
    await assertFails(db.doc('ledgerEntries/sale-1').update({ amount: 1 }))
    await assertFails(db.doc('ledgerEntries/sale-1').set(SEED_SALE))
    await assertFails(db.doc('ledgerEntries/sale-1').delete())
    await assertFails(db.doc('ledgerEntries/open_c1').delete())
  })
})

describe('sale amounts are re-checked in integer units (S-05, S-06)', () => {
  it('S-05 the posted amount must match kg × rate under the stored rounding policy', async () => {
    const owner = as(env, 'owner')
    // ROUND_HALF_UP_RUPEE: ₹8,076.80 → ₹8,077
    await assertFails(commit(owner, [entry(sale({ amount: 807_600, differenceMilliPaise: 80_000 }))]))
    // TRUNCATE_RUPEE: ₹8,076.80 → ₹8,076 (the source ledger)
    await assertFails(commit(owner, [entry(sale({ policyId: 'TRUNCATE_RUPEE' }))]))
    await assertSucceeds(commit(owner, [entry(sale({ id: 'sale-t', policyId: 'TRUNCATE_RUPEE', amount: 807_600, differenceMilliPaise: 80_000 }))]))
    // EXACT_PAISE: ₹8,076.80 stays
    await assertFails(commit(owner, [entry(sale({ policyId: 'EXACT_PAISE' }))]))
    await assertSucceeds(commit(owner, [entry(sale({ id: 'sale-e', policyId: 'EXACT_PAISE', amount: 807_680, differenceMilliPaise: 0 }))]))
    // The exact value and the difference must be the real ones too.
    await assertFails(commit(owner, [entry(sale({ exactMilliPaise: 807_700_000, differenceMilliPaise: 0 }))]))
    await assertFails(commit(owner, [entry(sale({ differenceMilliPaise: 0 }))]))
    await assertSucceeds(commit(owner, [entry(sale())]))
  })

  it('S-06 wrong author, missing fields, wrong types, negative kg or rate, extra fields are refused', async () => {
    const owner = as(env, 'owner')
    const { policyId: _dropped, ...noPolicy } = sale()
    void _dropped
    for (const bad of [
      sale({ createdBy: 'manager' }),
      noPolicy,
      sale({ grams: '63.1' }),
      sale({ grams: 63.1 }),
      sale({ grams: -63_100, exactMilliPaise: -807_680_000, amount: -807_700, differenceMilliPaise: 20_000 }),
      sale({ ratePaisePerKg: 0, exactMilliPaise: 0, amount: 0, differenceMilliPaise: 0 }),
      sale({ policyId: 'ROUND_DOWN' }),
      sale({ discount: 100 }),
      sale({ customerId: 'c-missing' }),
      sale({ date: '22-11-2026' }),
      sale({ id: 'other-id' }),
    ]) {
      await assertFails(commit(owner, [set('ledgerEntries/sale-2', bad)]))
    }
  })
})

describe('corrections (S-07, S-08)', () => {
  const reversal = (over: Record<string, unknown> = {}) => ({
    id: 'rev_sale-1', customerId: 'c1', date: TODAY, createdBy: 'owner', type: 'REVERSAL',
    reversesId: 'sale-1', direction: 'CREDIT', amount: 807_700, reason: 'Wrong customer', ...over,
  })

  it('S-07 a reversal must point at a real entry, mirror its amount, and happen once', async () => {
    const owner = as(env, 'owner')
    await assertFails(commit(owner, [entry(reversal({ id: 'rev_sale-404', reversesId: 'sale-404' }))]))
    await assertFails(commit(owner, [entry(reversal({ amount: 800_000 }))]))
    await assertFails(commit(owner, [entry(reversal({ direction: 'DEBIT' }))]))
    await assertFails(commit(owner, [set('ledgerEntries/rev-x', reversal({ id: 'rev-x' }))]))
    await assertFails(commit(owner, [entry(reversal({ customerId: 'c2' }))]))
    await assertSucceeds(commit(owner, [entry(reversal())]))
    await assertFails(commit(owner, [entry(reversal({ reason: 'Again' }))]))
    await assertFails(
      commit(owner, [entry(reversal({ id: 'rev_rev_sale-1', reversesId: 'rev_sale-1', direction: 'DEBIT' }))]),
    )
    // A sale on a closed trip is read-only, so it cannot be reversed either (ENG-09).
    await assertFails(
      commit(owner, [entry(reversal({ id: 'rev_sale-closed', reversesId: 'sale-closed', customerId: 'c2' }))]),
    )
  })

  it('S-08 an adjustment needs a reason and the owner', async () => {
    const adjustment = (over: Record<string, unknown> = {}) => ({
      id: 'adj-1', customerId: 'c1', date: TODAY, createdBy: 'owner', type: 'ADJUSTMENT',
      direction: 'CREDIT', amount: 10_000, reason: 'Discount agreed', ...over,
    })
    const { reason: _r, ...noReason } = adjustment()
    void _r
    await assertFails(commit(as(env, 'owner'), [entry(noReason)]))
    await assertFails(commit(as(env, 'owner'), [entry(adjustment({ reason: '   ' }))]))
    await assertFails(commit(as(env, 'manager'), [entry(adjustment({ createdBy: 'manager' }))]))
    await assertSucceeds(commit(as(env, 'owner'), [entry(adjustment())]))
  })

  it('S-10 valid owner sale, payment, reversal and adjustment, built by the engine, are accepted', async () => {
    const owner = as(env, 'owner')
    const base = { customerId: 'c2', date: TODAY, createdBy: 'owner' }
    const s = must(
      makeSale({ ...base, id: 'sale-10', grams: kg('63.1'), ratePaisePerKg: ratePerKg('128'), policy: 'ROUND_HALF_UP_RUPEE', tripId: OPEN_TRIP }),
    )
    const p = must(makePayment({ ...base, id: 'pay-10', amount: rupees('5000'), method: 'UPI', reference: 'UTR1234' }))
    await assertSucceeds(commit(owner, [...ledgerEntryWrites(s), ...ledgerEntryWrites(p)]))
    const r = must(makeReversal(p as FinancialEntry, { date: TODAY, createdBy: 'owner', reason: 'Entered twice' }))
    await assertSucceeds(commit(owner, ledgerEntryWrites(r)))
    const a = must(makeAdjustment({ ...base, id: 'adj-10', direction: 'CREDIT', amount: rupees('77'), reason: 'Rounding agreed' }))
    await assertSucceeds(commit(owner, ledgerEntryWrites(a)))
  })
})

describe('drivers (D-17, D-18)', () => {
  it('R-01 a driver sells and takes payments only on their own open trip, at the trip rate', async () => {
    const driver = as(env, 'driver')
    await assertSucceeds(commit(driver, [entry(driverSale())]))
    await assertFails(
      commit(driver, [entry(driverSale({ id: 'sale-d2', ratePaisePerKg: 13_000, exactMilliPaise: 130_000_000, amount: 130_000 }))]),
    )
    await assertFails(commit(driver, [entry(driverSale({ id: 'sale-d3', tripId: OTHER_DRIVER_TRIP }))]))
    await assertFails(commit(driver, [entry(driverSale({ id: 'sale-d4', tripId: CLOSED_TRIP }))]))
    const { tripId: _t, ...noTrip } = driverSale({ id: 'sale-d5' })
    void _t
    await assertFails(commit(driver, [entry(noTrip)]))

    const payment = { id: 'pay-d', customerId: 'c2', date: TODAY, createdBy: 'driver', type: 'PAYMENT', amount: 100_000, method: 'CASH' }
    await assertSucceeds(commit(driver, [entry({ ...payment, tripId: OPEN_TRIP })]))
    await assertFails(commit(driver, [entry({ ...payment, id: 'pay-d2' })]))
    await assertFails(commit(driver, [entry({ ...payment, id: 'pay-d3', tripId: OTHER_DRIVER_TRIP })]))

    // No reversals, adjustments or month-end for drivers.
    await assertFails(
      commit(driver, [entry({ id: 'rev_sale-d', customerId: 'c2', date: TODAY, createdBy: 'driver', type: 'REVERSAL', reversesId: 'sale-d', direction: 'CREDIT', amount: 140_000 })]),
    )
    await assertFails(
      commit(driver, [entry({ id: 'adj-d', customerId: 'c2', date: TODAY, createdBy: 'driver', type: 'ADJUSTMENT', direction: 'CREDIT', amount: 100, reason: 'x' })]),
    )
    // The manager may sell at another rate (D-18), and without a trip.
    await assertSucceeds(
      commit(as(env, 'manager'), [entry(driverSale({ id: 'sale-m', createdBy: 'manager', ratePaisePerKg: 13_000, exactMilliPaise: 130_000_000, amount: 130_000 }))]),
    )
  })
})

describe('month end (C-TXT L69, D-08)', () => {
  const snapshot = (customerId: string, month: string, date = '2026-11-01') => ({
    id: `snap_${customerId}_${month}`, customerId, date, createdBy: 'owner', type: 'MONTH_END_SNAPSHOT',
    month, closingBalance: 1_062_500, entryCount: 1,
  })
  const closure = (customerId: string, month: string) =>
    set(`ledgerClosures/${customerId}`, { customerId, closedThrough: month, closedBy: 'owner' })

  it('R-07 the owner closes a month with its snapshot; entries dated in it are refused after', async () => {
    const owner = as(env, 'owner')
    await assertFails(commit(owner, [entry(snapshot('c1', '2026-10'))]))
    await assertFails(commit(owner, [closure('c1', '2026-10')]))
    await assertFails(
      commit(as(env, 'manager'), [
        entry({ ...snapshot('c1', '2026-10'), createdBy: 'manager' }),
        set('ledgerClosures/c1', { customerId: 'c1', closedThrough: '2026-10', closedBy: 'manager' }),
      ]),
    )
    await assertFails(commit(owner, [entry(snapshot('c1', '2026-11', TODAY)), closure('c1', '2026-11')]))
    await assertSucceeds(commit(owner, [entry(snapshot('c1', '2026-10')), closure('c1', '2026-10')]))

    const late = { id: 'pay-late', customerId: 'c1', date: '2026-10-31', createdBy: 'owner', type: 'PAYMENT', amount: 100_000, method: 'CASH' }
    await assertFails(commit(owner, [entry(late)]))
    await assertSucceeds(commit(owner, [entry({ ...late, date: TODAY })]))

    await assertFails(commit(owner, [entry({ ...snapshot('c1', '2026-10'), closingBalance: 0 }), closure('c1', '2026-10')]))
    await assertFails(commit(owner, [entry(snapshot('c1', '2026-09')), closure('c1', '2026-09')]))
    await assertFails(as(env, 'owner').firestore().doc('ledgerClosures/c1').delete())
  })
})

describe('opening balances (F-LED, U-10)', () => {
  it('R-08 an opening balance is saved only with its new customer, once, as money owed', async () => {
    const manager = as(env, 'manager')
    const customer = { id: 'c3', shopName: 'Customer3', createdAt: TODAY, createdBy: 'manager' }
    const opening = must(makeOpeningBalance({ customerId: 'c3', date: TODAY, createdBy: 'manager', amount: rupees('2500') }))
    await assertSucceeds(commit(manager, newCustomerWrites(customer, opening)))

    const late = must(makeOpeningBalance({ customerId: 'c2', date: TODAY, createdBy: 'manager', amount: rupees('2500') }))
    await assertFails(commit(manager, ledgerEntryWrites(late)))
    await assertFails(commit(as(env, 'owner'), [entry({ id: 'open_c1', customerId: 'c1', date: TODAY, createdBy: 'owner', type: 'OPENING_BALANCE', direction: 'DEBIT', amount: 1 })]))
    await assertFails(
      commit(manager, [
        set('customers/c4', { id: 'c4', shopName: 'Customer4', createdAt: TODAY, createdBy: 'manager' }),
        entry({ id: 'open_c4', customerId: 'c4', date: TODAY, createdBy: 'manager', type: 'OPENING_BALANCE', direction: 'CREDIT', amount: 100 }),
      ]),
    )
    // Nothing may be dated before the opening balance (ENG-17).
    await assertFails(commit(as(env, 'owner'), [entry({ ...sale({ id: 'sale-early', customerId: 'c1', date: '2026-09-30' }), tripId: OPEN_TRIP })]))
  })
})
