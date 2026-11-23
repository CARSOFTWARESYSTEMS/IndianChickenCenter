/**
 * RC-01: firestore.rules carries the engine's role table and value lists word for word.
 * `npm run rules:generate` rewrites the block; this test fails when someone changes the engine and forgets.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generatedBlockOf, renderRulesConstants, replaceGeneratedBlock } from '../rulesConstants'

const RULES = new URL('../../../firestore.rules', import.meta.url)

describe('firestore.rules generated block', () => {
  it('RC-01 matches the role table and value lists in src/domain', () => {
    const rules = readFileSync(RULES, 'utf8')
    const fresh = renderRulesConstants()
    if (process.env.WRITE_RULES === '1') writeFileSync(RULES, replaceGeneratedBlock(rules, fresh))
    expect(generatedBlockOf(readFileSync(RULES, 'utf8'))).toBe(fresh)
  })

  it('RC-02 the driver row is the D-17 split, written out by hand', () => {
    const block = renderRulesConstants()
    expect(block).toContain(
      "'driver': ['trip.record', 'sale.record', 'payment.record', 'customer.viewBalance', 'bill.send']",
    )
    expect(block).toContain("'LOADING': 'purchase.record'")
    expect(block).toContain("'ADJUSTMENT': 'ledger.adjust'")
    expect(block).toContain("return ['TRUNCATE_RUPEE', 'ROUND_HALF_UP_RUPEE', 'EXACT_PAISE'];")
  })
})
