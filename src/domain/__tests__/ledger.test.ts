import { describe, expect, it } from 'vitest'
import {
  customerBalance,
  kg,
  makeAdjustment,
  makeReversal,
  makeSale,
  passbook,
  PASSBOOK_COLUMNS,
  ratePerKg,
  rupees,
  snapshotIdFor,
  type AdjustmentEntry,
  type MonthEndSnapshot,
  type SaleEntry,
} from '../index'
import { errorCode, LEDGER_CUSTOMER, LedgerBuilder, must, OWNER, sourceLedger } from './fixtures'

/** Source ledger through the October month-end close (C-TXT L64–69). */
function closedOctober() {
  const l = sourceLedger()
  must(l.closeMonth('2026-10', '2026-11-01'))
  return l
}

describe('Ledger (source customer, TRUNCATE policy)', () => {
  it('F-LED-01 opening balance ₹10,625', () => {
    const l = new LedgerBuilder()
    l.opening('10625', '2026-10-01')
    expect(l.balance).toBe(10_625_00)
  })

  it('F-LED-02 sale 63.1 kg × ₹128 → ₹18,701', () => {
    const l = new LedgerBuilder()
    l.opening('10625', '2026-10-01')
    l.sale('sale-1', '63.1', '128', '2026-10-05')
    expect(l.balance).toBe(18_701_00)
  })

  it('F-LED-03 sale 153.2 kg × ₹118 → ₹36,778', () => {
    const l = new LedgerBuilder()
    l.opening('10625', '2026-10-01')
    l.sale('sale-1', '63.1', '128', '2026-10-05')
    l.sale('sale-2', '153.2', '118', '2026-10-12')
    expect(l.balance).toBe(36_778_00)
  })

  it('F-LED-04 passbook: the 7 source columns, running balance 10,625 → 18,701 → 36,778 → 10,778', () => {
    expect(PASSBOOK_COLUMNS).toEqual([
      'Date',
      'TotalItemsInKG',
      'ItemPerKG',
      'TotalAmount',
      'PaidAmount',
      'BalanceAmount',
      'Comments',
    ])
    const rows = passbook(sourceLedger().entries, LEDGER_CUSTOMER)
    expect(rows.map((r) => r.balance)).toEqual([10_625_00, 18_701_00, 36_778_00, 10_778_00])
    expect(rows[0]).toMatchObject({ date: '2026-10-01', comments: 'Initial Balance' })
    expect(rows[1]).toMatchObject({ totalItemsGrams: 63_100, itemRatePaisePerKg: 128_00, totalAmount: 8_076_00 })
    expect(rows[2]).toMatchObject({ totalItemsGrams: 153_200, itemRatePaisePerKg: 118_00, totalAmount: 18_077_00 })
    expect(rows[3]).toMatchObject({ paidAmount: 26_000_00, comments: 'CashPayment' })
  })

  it('F-LED-05 cash payment ₹26,000 → ₹10,778', () => {
    const l = sourceLedger()
    expect(l.entries.find((e) => e.id === 'pay-1')).toMatchObject({ type: 'PAYMENT', method: 'CASH' })
    expect(l.balance).toBe(10_778_00)
  })

  it('F-LED-06 month-end snapshot ₹10,778; balance stays ₹10,778 (not ₹21,556)', () => {
    const l = closedOctober()
    const snap = l.entries.find((e) => e.type === 'MONTH_END_SNAPSHOT') as MonthEndSnapshot
    expect(snap.closingBalance).toBe(10_778_00)
    expect(snap.id).toBe('snap_customer1_2026-10')
    expect(l.balance).toBe(10_778_00)
    const view = customerBalance(l.entries, LEDGER_CUSTOMER)
    expect(view).toMatchObject({ balance: 10_778_00, viaSnapshot: 10_778_00, snapshotMismatch: false })
    expect(passbook(l.entries, LEDGER_CUSTOMER).at(-1)).toMatchObject({ balance: 10_778_00, comments: 'MonthEndBalance' })
  })

  it('F-LED-07 next month: sale 10 kg × ₹130 → ₹12,078 by snapshot path and full recompute', () => {
    const l = closedOctober()
    l.sale('sale-3', '10', '130', '2026-11-03')
    const view = customerBalance(l.entries, LEDGER_CUSTOMER)
    expect(view.balance).toBe(12_078_00)
    expect(view.viaSnapshot).toBe(12_078_00)
  })

  it('F-LED-08 then a partial payment ₹5,000 → ₹7,078', () => {
    const l = closedOctober()
    l.sale('sale-3', '10', '130', '2026-11-03')
    l.payment('pay-2', '5000', '2026-11-04')
    expect(l.balance).toBe(7_078_00)
  })

  it('F-LED-09 reversing the 63.1 kg sale from ₹10,778: credit ₹8,076 → ₹2,702; a second reversal is rejected', () => {
    const l = closedOctober()
    const original = l.entries.find((e) => e.id === 'sale-1') as SaleEntry
    const originalBefore = structuredClone(original)

    const reversal = must(makeReversal(original, { date: '2026-11-05', createdBy: OWNER, reason: 'Wrong customer' }))
    expect(reversal).toMatchObject({ id: 'rev_sale-1', direction: 'CREDIT', amount: 8_076_00 })
    expect(must(l.post(reversal)).status).toBe('saved')
    expect(l.balance).toBe(2_702_00)
    expect(l.entries.find((e) => e.id === 'sale-1')).toEqual(originalBefore)

    const again = must(makeReversal(original, { date: '2026-11-06', createdBy: OWNER }))
    expect(errorCode(l.post(again))).toBe('already_reversed')
    expect(must(l.post(reversal)).status).toBe('already-saved') // the same tap retried
    expect(l.balance).toBe(2_702_00)
  })

  it('F-LED-10 adjustment ₹500 debit: rejected without a reason, then +₹500 with one', () => {
    const l = sourceLedger()
    const input = { id: 'adj-1', customerId: LEDGER_CUSTOMER, date: '2026-10-25', createdBy: OWNER, direction: 'DEBIT' as const, amount: rupees('500') }
    expect(errorCode(makeAdjustment({ ...input, reason: '' }))).toBe('reason_required')
    const raw: AdjustmentEntry = { ...input, type: 'ADJUSTMENT', reason: '  ' }
    expect(errorCode(l.post(raw))).toBe('reason_required')
    expect(l.balance).toBe(10_778_00)

    must(l.post(must(makeAdjustment({ ...input, reason: 'Crate charge agreed by phone' }))))
    expect(l.balance).toBe(11_278_00)
  })

  it('F-LED-11 the same sale id submitted twice is one entry', () => {
    const l = sourceLedger()
    const count = l.entries.length
    const sale = must(
      makeSale({ id: 'sale-9', customerId: LEDGER_CUSTOMER, date: '2026-10-25', createdBy: OWNER, grams: kg('10'), ratePaisePerKg: ratePerKg('130'), policy: 'TRUNCATE_RUPEE' }),
    )
    expect(must(l.post(sale)).status).toBe('saved')
    expect(must(l.post(structuredClone(sale))).status).toBe('already-saved')
    expect(l.entries).toHaveLength(count + 1)
    expect(l.balance).toBe(12_078_00)
  })

  it('F-LED-12 a stored snapshot of ₹10,000 against events of ₹10,778 is flagged; ₹10,778 is shown', () => {
    const l = sourceLedger()
    const badSnapshot: MonthEndSnapshot = {
      id: snapshotIdFor(LEDGER_CUSTOMER, '2026-10'),
      customerId: LEDGER_CUSTOMER,
      date: '2026-11-01',
      createdBy: OWNER,
      type: 'MONTH_END_SNAPSHOT',
      month: '2026-10',
      closingBalance: 10_000_00,
      entryCount: 4,
    }
    const view = customerBalance([...l.entries, badSnapshot], LEDGER_CUSTOMER)
    expect(view.snapshotMismatch).toBe(true)
    expect(view.balance).toBe(10_778_00)
  })
})
