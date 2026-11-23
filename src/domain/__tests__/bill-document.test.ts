/** BD-*: issued bills, their numbers, and what a bill shows (P6). Expected text and amounts are written out by hand. */
import { describe, expect, it } from 'vitest'
import { billDocument, billFileName, buildBill, DEFAULT_SETTINGS, makeIssuedBill, paginate, type Bill } from '../index'
import { errorCode, LEDGER_CUSTOMER, must, OWNER, sourceLedger } from './fixtures'

const OCTOBER = { from: '2026-10-01', to: '2026-10-31' }
const octoberBill = (): Bill => must(buildBill(sourceLedger().entries, LEDGER_CUSTOMER, OCTOBER))
const ctx = { settings: DEFAULT_SETTINGS, shopName: 'Customer1' }

describe('bills (P6)', () => {
  it('BD-01 an issued bill takes the number for its financial year (D-07)', () => {
    const bill = octoberBill()
    const first = must(makeIssuedBill({ id: 'b1', bill, sequence: 1, issuedOn: '2026-11-22', issuedBy: OWNER }))
    expect(first.number).toBe('ICC/2026-27/0001')
    expect(first.financialYear).toBe('2026-27')
    expect(must(makeIssuedBill({ id: 'b2', bill, sequence: 12, issuedOn: '2027-03-31', issuedBy: OWNER })).number).toBe('ICC/2026-27/0012')
    expect(must(makeIssuedBill({ id: 'b3', bill, sequence: 1, issuedOn: '2027-04-01', issuedBy: OWNER })).number).toBe('ICC/2027-28/0001')
    expect(errorCode(makeIssuedBill({ id: 'b4', bill, sequence: 1, issuedOn: '2026-10-30', issuedBy: OWNER }))).toBe('invalid_input')
    expect(errorCode(makeIssuedBill({ id: 'b5', bill, sequence: 0, issuedOn: '2026-11-22', issuedBy: OWNER }))).toBe('invalid_input')
    expect(errorCode(makeIssuedBill({ id: 'b6', bill: { ...bill, paid: 1 }, sequence: 1, issuedOn: '2026-11-22', issuedBy: OWNER }))).toBe('amount_mismatch')
  })

  it('BD-02 the source month as printed (F-BILL-01): previous ₹10,625, items ₹26,153, paid ₹26,000, due ₹10,778', () => {
    const doc = billDocument(octoberBill(), { ...ctx, language: 'en' })
    expect(doc.title).toBe('Statement')
    expect(doc.customer).toBe('Customer1')
    expect(doc.period).toBe('Period: 01-10-2026 to 31-10-2026')
    expect(doc.rows).toEqual([
      { kind: 'total', label: 'Previous balance', amount: 10_625_00 },
      { kind: 'detail', label: '05-10-2026  63.1 kg × ₹128/kg', amount: 8_076_00 },
      { kind: 'detail', label: '12-10-2026  153.2 kg × ₹118/kg', amount: 18_077_00 },
      { kind: 'total', label: 'Items: 216.3 kg', amount: 26_153_00 },
      { kind: 'detail', label: '20-10-2026  Cash', amount: 26_000_00 },
      { kind: 'total', label: 'Paid', amount: 26_000_00 },
      { kind: 'due', label: 'Balance due', amount: 10_778_00 },
    ])
    const issued = billDocument(octoberBill(), { ...ctx, language: 'en', issued: { number: 'ICC/2026-27/0001', issuedOn: '2026-11-22' } })
    expect(issued.title).toBe('Bill ICC/2026-27/0001')
    expect(issued.issued).toBe('Date: 22-11-2026')
  })

  it('BD-03 the same bill in Kannada', () => {
    const doc = billDocument(octoberBill(), { ...ctx, language: 'kn', issued: { number: 'ICC/2026-27/0001', issuedOn: '2026-11-22' } })
    expect(doc.title).toBe('ಬಿಲ್ ICC/2026-27/0001')
    expect(doc.rows[1]?.label).toBe('05-10-2026  63.1 ಕೆಜಿ × ₹128/ಕೆಜಿ')
    expect(doc.rows.at(-1)).toEqual({ kind: 'due', label: 'ಬಾಕಿ ಮೊತ್ತ', amount: 10_778_00 })
  })

  it('BD-04 long bills split over pages; the balance due never stands alone', () => {
    const rows = Array.from({ length: 10 }, (_, i) => i)
    expect(paginate(rows, 4, 5).map((p) => p.length)).toEqual([4, 4, 2])
    expect(paginate(rows, 20, 20).map((p) => p.length)).toEqual([10])
    expect(paginate([], 4, 5)).toEqual([[]])
  })

  it('BD-05 file names a phone can show', () => {
    expect(billFileName({ customer: 'Customer1 (Ravi)' }, { number: 'ICC/2026-27/0001' }, '2026-11-22')).toBe('Bill-ICC-2026-27-0001-Customer1.pdf')
    expect(billFileName({ customer: 'Sri Durga Chicken' }, undefined, '2026-11-22')).toBe('Statement-Sri-Durga-Chicken-2026-11-22.pdf')
  })
})
