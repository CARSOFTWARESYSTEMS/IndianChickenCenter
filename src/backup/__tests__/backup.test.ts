/** B-*: the backup file, its checks, Drive upload and download (fake Drive), and the restore preview (plan v3 #9). */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../domain'
import { canonical } from '../../domain/util'
import { checkBackup, makeBackup, planRestore, type BackupData } from '../backup'
import { driveSignInProvider } from '../connect'
import { DRIVE_SCOPE, driveClient } from '../drive'
import { backUpToDrive } from '../flow'
import { fakeDrive } from './fakeDrive'

const T = 'trip_2026-11-02_KA21AB1234'

/** Customer1: October as in the source (₹10,778, closed), then 10 kg × ₹140 and ₹1,000 paid in November. */
function records(): BackupData {
  const entry = (id: string, rest: Record<string, unknown>) => ({ [`ledgerEntries/${id}`]: { id, customerId: 'c1', createdBy: 'owner', ...rest } })
  return {
    'settings/business': { ...DEFAULT_SETTINGS, updatedBy: 'owner' },
    'users/owner': { name: 'Umarabba', email: 'owner@example.com', role: 'owner', addedBy: 'console', addedOn: '2026-10-01' },
    'customers/c1': { id: 'c1', shopName: 'Customer1', createdAt: '2026-10-01', createdBy: 'owner' },
    'customers/c2': { id: 'c2', shopName: 'Customer2', createdAt: '2026-10-01', createdBy: 'owner' },
    ...entry('open_c1', { date: '2026-10-01', type: 'OPENING_BALANCE', direction: 'DEBIT', amount: 1_062_500 }),
    ...entry('s1', { date: '2026-10-05', type: 'SALE', grams: 63_100, ratePaisePerKg: 12_800, exactMilliPaise: 807_680_000, amount: 807_600, policyId: 'TRUNCATE_RUPEE', differenceMilliPaise: 80_000 }),
    ...entry('s2', { date: '2026-10-12', type: 'SALE', grams: 153_200, ratePaisePerKg: 11_800, exactMilliPaise: 1_807_760_000, amount: 1_807_700, policyId: 'TRUNCATE_RUPEE', differenceMilliPaise: 60_000 }),
    ...entry('p1', { date: '2026-10-20', type: 'PAYMENT', amount: 2_600_000, method: 'CASH' }),
    ...entry('snap_c1_2026-10', { date: '2026-11-01', type: 'MONTH_END_SNAPSHOT', month: '2026-10', closingBalance: 1_077_800, entryCount: 4 }),
    ...entry('s3', { date: '2026-11-05', type: 'SALE', tripId: T, grams: 10_000, ratePaisePerKg: 14_000, exactMilliPaise: 140_000_000, amount: 140_000, policyId: 'ROUND_HALF_UP_RUPEE', differenceMilliPaise: 0 }),
    ...entry('p2', { date: '2026-11-10', type: 'PAYMENT', amount: 100_000, method: 'UPI' }),
    'ledgerClosures/c1': { customerId: 'c1', closedThrough: '2026-10', closedBy: 'owner' },
    [`trips/${T}`]: { id: T, date: '2026-11-02', status: 'OPEN', createdBy: 'owner', vehicleNumber: 'KA21AB1234', defaultSaleRatePaisePerKg: 14_000, ratePaisePerKg: 14_000 },
    [`trips/${T}/events/load-1`]: { id: 'load-1', tripId: T, date: '2026-11-02', createdBy: 'owner', type: 'LOADING', grams: 100_000 },
    [`trips/${T}/purchases/load-1`]: { id: 'load-1', tripId: T, createdBy: 'owner', grams: 100_000, ratePaisePerKg: 12_000, exactMilliPaise: 1_200_000_000, amount: 1_200_000 },
    'billCounters/2026-27': { financialYear: '2026-27', next: 2, lastBillId: 'b1' },
  }
}

const META = { createdAt: '2026-11-23T03:45:00.000Z', createdBy: 'owner', projectId: 'demo-icc' }

describe('Google Drive backup (P7)', () => {
  it('B-01 Drive access asks for the drive.file scope and nothing wider', () => {
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file')
    // Firebase's Google sign-in always asks for the basic profile (name, email); the only Drive scope is drive.file.
    expect(driveSignInProvider('owner@example.com').getScopes()).toEqual(['profile', 'https://www.googleapis.com/auth/drive.file'])
  })

  it('B-02 the export is JSON with a schema version, record counts, balances and a SHA-256, and no tokens', async () => {
    const data = records()
    const file = await makeBackup(data, META)
    expect(file.schemaVersion).toBe(1)
    expect(file.app).toBe('indian-chicken-center')
    expect(file.counts).toEqual({
      settings: 1, users: 1, invites: 0, vehicles: 0, customers: 2, trips: 1, tripEvents: 1, purchases: 1,
      tripTotals: 0, ledgerEntries: 7, ledgerClosures: 1, bills: 0, billCounters: 1,
    })
    expect(file.balances).toEqual({ c1: 11_178_00, c2: 0 })
    expect(file.sha256).toBe(createHash('sha256').update(canonical(data)).digest('hex'))
    expect(JSON.stringify(file)).not.toMatch(/token|refresh|password|secret/i)
    const changed = await makeBackup({ ...data, 'customers/c2': { ...data['customers/c2'], shopName: 'Customer 2' } }, META)
    expect(changed.sha256).not.toBe(file.sha256)
  })

  it('B-03 upload, then download the same file id: the checksum matches and the copy passes every check', async () => {
    const drive = fakeDrive()
    const steps: string[] = []
    const outcome = await backUpToDrive({
      readEverything: async () => ({ ok: true, value: records() }),
      connect: async () => ({ ok: true, value: driveClient('test-token', drive.fetch) }),
      meta: { createdBy: 'owner', projectId: 'demo-icc' },
      now: () => new Date(META.createdAt),
      onStep: (s) => steps.push(s),
    })
    if (!outcome.ok) throw new Error(outcome.error.message)
    expect(steps).toEqual(['reading', 'connecting', 'uploading', 'checking', 'done'])
    expect(outcome.value.file.name).toBe('ICC backup 2026-11-23 0915.json')
    expect(outcome.value.check.ok).toBe(true)
    expect(outcome.value.check.file.sha256).toBe(outcome.value.backup.sha256)
    expect(outcome.value.verified).toBe(true)
    const listed = await driveClient('test-token', drive.fetch).list()
    expect(listed.ok && listed.value.map((f) => [f.name, f.appProperties?.verified])).toEqual([['ICC backup 2026-11-23 0915.json', 'yes']])
  })

  it('B-05 a backup is marked verified only when the downloaded copy passes; a changed copy is not', async () => {
    const drive = fakeDrive({ corrupt: (text) => text.replace('"c1":1117800', '"c1":1117900') })
    const outcome = await backUpToDrive({
      readEverything: async () => ({ ok: true, value: records() }),
      connect: async () => ({ ok: true, value: driveClient('test-token', drive.fetch) }),
      meta: { createdBy: 'owner', projectId: 'demo-icc' },
    })
    if (!outcome.ok) throw new Error(outcome.error.message)
    expect(outcome.value.verified).toBe(false)
    expect(outcome.value.check.problems.join(' ')).toContain('Customer c1')
    expect(outcome.value.file.appProperties?.verified).toBe(undefined)

    const refused = await driveClient('wrong-token', fakeDrive().fetch).upload('x.json', '{}')
    expect(!refused.ok && refused.error.code).toBe('not_permitted')
  })

  it('B-05b checks re-add every entry: a month-end snapshot that disagrees is reported', async () => {
    const data = records()
    data['ledgerEntries/snap_c1_2026-10'] = { ...data['ledgerEntries/snap_c1_2026-10'], closingBalance: 1_077_900 }
    const check = await checkBackup(JSON.stringify(await makeBackup(data, META)))
    expect(check.ok && check.value.ok).toBe(true)
    expect(check.ok && check.value.snapshotMismatches).toEqual(['c1'])
    const notOurs = await checkBackup('{"app":"something-else"}')
    expect(!notOurs.ok && notOurs.error.code).toBe('invalid_input')
  })

  it('B-06 preview: records missing from the cloud are listed; records that differ are listed and never replaced', () => {
    const backup = records()
    const live = { ...records() }
    delete live['ledgerEntries/p2']
    delete live[`trips/${T}/purchases/load-1`]
    live['customers/c2'] = { ...live['customers/c2'], shopName: 'Customer 2 Ujire' }
    expect(planRestore(backup, live)).toEqual({
      missing: ['ledgerEntries/p2', `trips/${T}/purchases/load-1`],
      different: ['customers/c2'],
      same: 13,
    })
  })
})
