/**
 * Backup and restore against the emulator (plan B-04, B-06): the owner's full read, the backup file, a dry-run
 * restore into an empty database, and a restore into live data that only adds what is missing.
 */
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { balancesOf, checkBackup, countsOf, makeBackup } from '../../src/backup/backup'
import { readEverything } from '../../src/backup/collect'
import { emulatorTarget, readPaths, restoreMissing } from '../../src/backup/restore'
import { startEnv } from '../rules/helpers'
import { closeDevices, device, seedCloud } from '../sync/helpers'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await startEnv()
})
beforeEach(() => seedCloud(env))
afterEach(() => closeDevices())
afterAll(() => env.cleanup())

const [HOST = '127.0.0.1', PORT = '8080'] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
const LIVE = emulatorTarget('demo-icc', '(default)', `${HOST}:${PORT}`)
/** A second, empty database in the same emulator: the "blank emulator" of B-04. */
const BLANK = emulatorTarget('demo-icc', 'restore-check', `${HOST}:${PORT}`)

async function emptyBlank(): Promise<void> {
  await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/demo-icc/databases/restore-check/documents`, { method: 'DELETE' })
}

async function ownersBackup(): Promise<string> {
  const { db } = device('owner')
  const data = await readEverything(db)
  if (!data.ok) throw new Error(data.error.message)
  const file = await makeBackup(data.value, { createdAt: '2026-11-23T03:45:00.000Z', createdBy: 'owner', projectId: 'demo-icc' })
  return JSON.stringify(file)
}

function must<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

describe('restore (P7)', () => {
  it('B-04 a dry-run restore into an empty database gives the same records, counts and balances', async () => {
    const text = await ownersBackup()
    const check = must(await checkBackup(text))
    expect(check.ok).toBe(true)
    // The seed: owner, manager, manager2, driver; settings; 2 customers; 6 entries + 2 snapshots; 2 closures; 1 trip.
    expect(check.counts).toMatchObject({ users: 4, settings: 1, customers: 2, ledgerEntries: 8, ledgerClosures: 2, trips: 1, tripEvents: 1, purchases: 1 })
    expect(check.balances).toEqual({ c1: 11_178_00, c2: 0 })

    await emptyBlank()
    const report = must(await restoreMissing(BLANK, text, { apply: true }))
    expect(report.written).toHaveLength(check.documents)
    expect(report.skipped).toEqual([])

    const backup = JSON.parse(text) as { data: Record<string, Record<string, unknown>> }
    const restored = must(await readPaths(BLANK, Object.keys(backup.data)))
    expect(restored).toEqual(backup.data)
    expect(countsOf(restored)).toEqual(check.counts)
    expect(balancesOf(restored)).toEqual({ c1: 11_178_00, c2: 0 })
    // A second run finds nothing to add.
    expect(must(await restoreMissing(BLANK, text, { apply: false })).missing).toEqual([])
  })

  it('B-06 restoring into live data previews first, adds only missing records and never overwrites', async () => {
    const text = await ownersBackup()
    // Since the backup: a payment record was lost, and a customer was renamed.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('ledgerEntries/nov-pay').delete()
      await ctx.firestore().doc('customers/c2').update({ shopName: 'Customer 2 Ujire' })
    })
    const preview = must(await restoreMissing(LIVE, text, { apply: false }))
    expect(preview.missing).toEqual(['ledgerEntries/nov-pay'])
    expect(preview.different).toEqual(['customers/c2'])
    expect(preview.written).toEqual([])
    expect(must(await readPaths(LIVE, ['ledgerEntries/nov-pay']))).toEqual({})

    const applied = must(await restoreMissing(LIVE, text, { apply: true }))
    expect(applied.written).toEqual(['ledgerEntries/nov-pay'])
    const after = must(await readPaths(LIVE, ['ledgerEntries/nov-pay', 'customers/c2']))
    expect(after['ledgerEntries/nov-pay']?.amount).toBe(1_000_00)
    expect(after['customers/c2']?.shopName).toBe('Customer 2 Ujire')
  })

  it('B-06b a backup that fails its checks is refused before anything is written', async () => {
    const text = (await ownersBackup()).replace('"c1":1117800', '"c1":1117900')
    const refused = await restoreMissing(LIVE, text, { apply: true })
    expect(!refused.ok && refused.error.code).toBe('invalid_input')
  })
})
