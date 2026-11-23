/** Bill rules (P6, plan §6): numbers without gaps or repeats, dated today, never changed. */
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { financialYearOf, todayInKolkata } from '../../src/domain'
import { as, commit, seed, set, startEnv } from './helpers'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await startEnv()
})
beforeEach(() => seed(env))
afterAll(() => env.cleanup())

// Bills are dated by the cloud's clock, so these tests use the real date.
const TODAY = todayInKolkata()
const YEAR = financialYearOf(TODAY)
const PREVIOUS_DAY = new Date(Date.now() - 86_400_000)

/** Customer1: previous ₹10,625, 63.1 kg × ₹128 = ₹8,077, due ₹18,702. */
const content = (over: Record<string, unknown> = {}) => ({
  customerId: 'c1', from: TODAY, to: TODAY, previousBalance: 1_062_500,
  items: [{ entryId: 'sale-1', date: TODAY, grams: 63_100, ratePaisePerKg: 12_800, amount: 807_700 }],
  itemsGrams: 63_100, itemsAmount: 807_700, payments: [], paid: 0, other: [], otherNet: 0, currentBalance: 1_870_200,
  ...over,
})

const bill = (id: string, sequence: number, number: string, over: Record<string, unknown> = {}) => ({
  id, number, financialYear: YEAR, sequence, customerId: 'c1', issuedOn: TODAY, issuedBy: 'owner', bill: content(), ...over,
})

const counter = (next: number, lastBillId: string) => set(`billCounters/${YEAR}`, { financialYear: YEAR, next, lastBillId })

describe('bill numbers (D-07)', () => {
  it('BR-01 the first bill of the year is 0001, the next 0002, whoever sends bills', async () => {
    await assertSucceeds(commit(as(env, 'owner'), [counter(2, 'b1'), set('bills/b1', bill('b1', 1, `ICC/${YEAR}/0001`))]))
    await assertSucceeds(
      commit(as(env, 'driver'), [counter(3, 'b2'), set('bills/b2', bill('b2', 2, `ICC/${YEAR}/0002`, { issuedBy: 'driver' }))]),
    )
  })

  it('BR-02 skipped, repeated or mislabelled numbers are refused', async () => {
    const owner = as(env, 'owner')
    await assertFails(commit(owner, [counter(3, 'b1'), set('bills/b1', bill('b1', 2, `ICC/${YEAR}/0002`))]))
    await assertFails(commit(owner, [set('bills/b1', bill('b1', 1, `ICC/${YEAR}/0001`))]))
    await assertFails(commit(owner, [counter(2, 'b1')]))
    await assertFails(commit(owner, [counter(2, 'b1'), set('bills/b1', bill('b1', 1, `ICC/${YEAR}/1`))]))
    await assertFails(commit(owner, [counter(2, 'b1'), set('bills/b1', bill('b1', 1, 'ICC/2020-21/0001', { financialYear: '2020-21' }))]))
    await assertSucceeds(commit(owner, [counter(2, 'b1'), set('bills/b1', bill('b1', 1, `ICC/${YEAR}/0001`))]))
    // 0001 again, with the counter wound back
    await assertFails(commit(owner, [counter(2, 'b9'), set('bills/b9', bill('b9', 1, `ICC/${YEAR}/0001`))]))
  })

  it('BR-03 a bill is dated today, adds up, belongs to a real customer, and comes from the team', async () => {
    const owner = as(env, 'owner')
    const yesterday = todayInKolkata(PREVIOUS_DAY)
    const issue = (over: Record<string, unknown>) => [counter(2, 'b1'), set('bills/b1', bill('b1', 1, `ICC/${YEAR}/0001`, over))]
    await assertFails(commit(owner, issue({ issuedOn: yesterday, bill: content({ from: yesterday, to: yesterday }) })))
    await assertFails(commit(owner, issue({ bill: content({ currentBalance: 1_870_100 }) })))
    await assertFails(commit(owner, issue({ customerId: 'c-missing', bill: content({ customerId: 'c-missing' }) })))
    await assertFails(commit(owner, issue({ issuedBy: 'manager' })))
    await assertFails(commit(owner, issue({ discount: 100 })))
    await assertFails(commit(as(env, 'stranger'), issue({ issuedBy: 'stranger' })))
  })

  it('BR-04 an issued bill is never changed; the team reads bills, strangers do not', async () => {
    const owner = as(env, 'owner')
    await assertSucceeds(commit(owner, [counter(2, 'b1'), set('bills/b1', bill('b1', 1, `ICC/${YEAR}/0001`))]))
    await assertFails(owner.firestore().doc('bills/b1').update({ number: `ICC/${YEAR}/0005` }))
    await assertFails(owner.firestore().doc('bills/b1').delete())
    await assertFails(owner.firestore().doc(`billCounters/${YEAR}`).delete())
    await assertSucceeds(as(env, 'driver').firestore().doc('bills/b1').get())
    await assertSucceeds(as(env, 'driver').firestore().doc(`billCounters/${YEAR}`).get())
    await assertFails(as(env, 'stranger').firestore().doc('bills/b1').get())
    await assertFails(as(env, 'stranger').firestore().doc(`billCounters/${YEAR}`).get())
  })
})
