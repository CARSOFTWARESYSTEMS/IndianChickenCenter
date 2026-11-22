import { describe, expect, it } from 'vitest'
import { billText, buildBill, DEFAULT_SETTINGS, formatRupees, whatsAppLink } from '../index'
import { LEDGER_CUSTOMER, must, sourceLedger } from './fixtures'

const OCTOBER = { from: '2026-10-01', to: '2026-10-31' }

describe('Bill and formatting', () => {
  it('F-BILL-01 bill for the source month: previous ₹10,625; items 216.3 kg, ₹26,153; paid ₹26,000; current ₹10,778', () => {
    const bill = must(buildBill(sourceLedger().entries, LEDGER_CUSTOMER, OCTOBER))
    expect(bill.previousBalance).toBe(10_625_00)
    expect(bill.items).toHaveLength(2)
    expect(bill.itemsGrams).toBe(216_300)
    expect(bill.itemsAmount).toBe(26_153_00)
    expect(bill.paid).toBe(26_000_00)
    expect(bill.currentBalance).toBe(10_778_00)
  })

  // Corrected from the plan: encodeURIComponent turns "," into "%2C", so "10,778" cannot appear in the raw URL.
  // The check is on the decoded text instead.
  it('F-BILL-02 WhatsApp fallback opens 919876543210 with ₹ encoded and "₹10,778" intact after decoding', () => {
    const bill = must(buildBill(sourceLedger().entries, LEDGER_CUSTOMER, OCTOBER))
    const text = billText(bill, { settings: DEFAULT_SETTINGS, shopName: 'Customer1' })
    const url = must(whatsAppLink('98765 43210', text))

    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true)
    expect(url).toContain('%E2%82%B9')
    const decoded = decodeURIComponent(url.slice(url.indexOf('text=') + 5))
    expect(decoded).toBe(text)
    expect(decoded).toContain('Balance due: ₹10,778')
    expect(decoded).toContain('05-10-2026  63.1 kg × ₹128/kg = ₹8,076')
  })

  // Corrected from the plan: the spec now states the rule — no decimals for whole rupees, two when there are paise.
  it('F-FMT-01 Indian grouping: ₹1,000 · ₹1,00,000 · ₹6,81,800 · ₹8,076.80', () => {
    expect(formatRupees(1_000_00)).toBe('₹1,000')
    expect(formatRupees(1_00_000_00)).toBe('₹1,00,000')
    expect(formatRupees(6_81_800_00)).toBe('₹6,81,800')
    expect(formatRupees(8_076_80)).toBe('₹8,076.80')
  })
})
