import { describe, expect, it } from 'vitest'
import { kg, makeSale, ratePerKg, type RoundingPolicyId } from '../index'
import { LedgerBuilder, must, OWNER } from './fixtures'

function sale(weight: string, rate: string, policy: RoundingPolicyId) {
  return must(
    makeSale({ id: 's', customerId: 'c', date: '2026-10-05', createdBy: OWNER, grams: kg(weight), ratePaisePerKg: ratePerKg(rate), policy }),
  )
}

describe('Rounding: posted vs exact', () => {
  it.each([
    // id, kg, rate, TRUNCATE_RUPEE, ROUND_HALF_UP_RUPEE, EXACT_PAISE
    ['F-RND-01', '63.1', '128', 8_076_00, 8_077_00, 8_076_80],
    ['F-RND-02', '153.2', '118', 18_077_00, 18_078_00, 18_077_60],
    ['F-RND-03', '0.5', '101', 50_00, 51_00, 50_50],
    ['F-RND-05', '1.234', '99.99', 123_00, 123_00, 123_39],
  ])('%s %s kg × ₹%s', (_id, weight, rate, truncate, halfUp, exactPaise) => {
    expect(sale(weight, rate, 'TRUNCATE_RUPEE').amount).toBe(truncate)
    expect(sale(weight, rate, 'ROUND_HALF_UP_RUPEE').amount).toBe(halfUp)
    expect(sale(weight, rate, 'EXACT_PAISE').amount).toBe(exactPaise)
  })

  it('F-RND-04 changing the policy affects only new entries', () => {
    const l = new LedgerBuilder()
    l.opening('10625', '2026-10-01')
    const first = l.sale('sale-1', '63.1', '128', '2026-10-05', 'TRUNCATE_RUPEE')
    const firstBefore = structuredClone(first)

    const second = l.sale('sale-2', '153.2', '118', '2026-10-12', 'ROUND_HALF_UP_RUPEE')

    expect(l.entries.find((e) => e.id === 'sale-1')).toEqual(firstBefore)
    expect(first.amount).toBe(8_076_00)
    expect(second.amount).toBe(18_078_00)
    expect(l.balance).toBe(36_779_00)
  })

  it('F-RND-06 a SALE stores exact, posted, difference and policy', () => {
    const s = sale('63.1', '128', 'TRUNCATE_RUPEE')
    expect(s.exactMilliPaise).toBe(807_680_000) // ₹8,076.80 in thousandths of a paisa
    expect(s.amount).toBe(8_076_00)
    expect(s.differenceMilliPaise).toBe(80_000) // ₹0.80
    expect(s.policyId).toBe('TRUNCATE_RUPEE')
  })
})
