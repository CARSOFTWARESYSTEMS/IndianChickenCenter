/**
 * LW-*: a ledger read from the cloud is a window (entries from a date on, plus month-end snapshots), not the whole
 * history. Balances, passbooks, bills and month end must give the same numbers as the full ledger.
 * Source customer (C-TXT L62–69): October closes at ₹10,778 (paise dropped); November adds 10 kg × ₹140 and ₹1,000 paid.
 */
import { describe, expect, it } from 'vitest'
import { balanceBefore, buildBill, closeMonth, currentBalance, passbook, type LedgerEntry } from '../index'
import { errorCode, LEDGER_CUSTOMER, must, owner, OWNER, sourceLedger } from './fixtures'

function november() {
  const l = sourceLedger()
  must(l.closeMonth('2026-10', '2026-11-01'))
  l.sale('sale-3', '10', '140', '2026-11-05')
  l.payment('pay-2', '1000', '2026-11-10')
  return l
}

/** What the app loads: entries dated from `from`, and the snapshots. */
const windowOf = (entries: readonly LedgerEntry[], from: string): LedgerEntry[] =>
  entries.filter((e) => e.type === 'MONTH_END_SNAPSHOT' || e.date >= from)

const NOV = { from: '2026-11-01' }

describe('ledger window (P5)', () => {
  it('LW-01 the balance from the October snapshot equals the full recompute', () => {
    const l = november()
    expect(currentBalance(l.entries, LEDGER_CUSTOMER)).toBe(11_178_00)
    expect(currentBalance(windowOf(l.entries, NOV.from), LEDGER_CUSTOMER, NOV)).toBe(11_178_00)
  })

  it('LW-02 the balance before a date inside the window', () => {
    const l = november()
    const book = windowOf(l.entries, NOV.from)
    expect(must(balanceBefore(book, LEDGER_CUSTOMER, '2026-11-01', NOV))).toBe(10_778_00)
    expect(must(balanceBefore(book, LEDGER_CUSTOMER, '2026-11-06', NOV))).toBe(12_178_00)
    expect(must(balanceBefore(l.entries, LEDGER_CUSTOMER, '2026-11-01'))).toBe(10_778_00)
    expect(errorCode(balanceBefore(book, LEDGER_CUSTOMER, '2026-10-15', NOV))).toBe('outside_window')
  })

  it('LW-03 a passbook that starts at the window opens with the balance brought forward', () => {
    const rows = passbook(windowOf(november().entries, NOV.from), LEDGER_CUSTOMER, NOV)
    expect(rows.map((r) => [r.type, r.date, r.balance])).toEqual([
      ['BROUGHT_FORWARD', '2026-11-01', 10_778_00],
      ['SALE', '2026-11-05', 12_178_00],
      ['PAYMENT', '2026-11-10', 11_178_00],
    ])
  })

  it('LW-03b a customer added inside the window has no brought-forward line', () => {
    const l = sourceLedger()
    const rows = passbook(windowOf(l.entries, '2026-10-01'), LEDGER_CUSTOMER, { from: '2026-10-01' })
    expect(rows.map((r) => r.type)).toEqual(['OPENING_BALANCE', 'SALE', 'SALE', 'PAYMENT'])
    expect(rows.at(-1)?.balance).toBe(10_778_00)
  })

  it('LW-04 a bill for the window month starts from the snapshot; an earlier period is refused', () => {
    const book = windowOf(november().entries, NOV.from)
    const bill = must(buildBill(book, LEDGER_CUSTOMER, { from: '2026-11-01', to: '2026-11-30' }, NOV))
    expect(bill.previousBalance).toBe(10_778_00)
    expect(bill.itemsGrams).toBe(10_000)
    expect(bill.itemsAmount).toBe(1_400_00)
    expect(bill.paid).toBe(1_000_00)
    expect(bill.currentBalance).toBe(11_178_00)
    expect(errorCode(buildBill(book, LEDGER_CUSTOMER, { from: '2026-10-01', to: '2026-10-31' }, NOV))).toBe('outside_window')

    // F-BILL-01 again, from a window that starts on 1 October: previous ₹10,625, current ₹10,778.
    const oct = { from: '2026-10-01' }
    const october = must(buildBill(windowOf(november().entries, oct.from), LEDGER_CUSTOMER, { from: '2026-10-01', to: '2026-10-31' }, oct))
    expect(october.previousBalance).toBe(10_625_00)
    expect(october.itemsAmount).toBe(26_153_00)
    expect(october.currentBalance).toBe(10_778_00)
  })

  it('LW-05 closing November from the window carries the October snapshot forward', () => {
    const l = november()
    const input = { customerId: LEDGER_CUSTOMER, month: '2026-11', date: '2026-12-01', createdBy: OWNER }
    const fromWindow = must(closeMonth(windowOf(l.entries, NOV.from), input, owner, NOV)).entry
    expect(fromWindow.closingBalance).toBe(11_178_00)
    expect(fromWindow.entryCount).toBe(6)
    const full = must(closeMonth(l.entries, input, owner)).entry
    expect(full.closingBalance).toBe(11_178_00)
    expect(full.entryCount).toBe(6)
    // A window that skips November cannot close it.
    const dec = { from: '2026-12-01' }
    expect(errorCode(closeMonth(windowOf(l.entries, dec.from), input, owner, dec))).toBe('outside_window')
  })
})
