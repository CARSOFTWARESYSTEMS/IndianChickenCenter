/**
 * The backup file (P7, plan B-02): every stored record, by its Firestore path, with a schema version, record counts,
 * every customer's balance from a full recompute, and a SHA-256 checksum. No sign-in tokens or other secrets go in.
 *
 * checkBackup() reads a file back and re-checks all of it: the checksum, the counts, and every balance recomputed
 * from the entries. It also re-checks each month-end snapshot against a full recompute, which a phone cannot do
 * from its read window (KNOWN_LIMITATIONS.md). Pure TypeScript: no Firebase or Google code.
 */
import { customerBalance, fail, ok, recomputeBalance, type LedgerEntry, type Paise, type Result } from '../domain'
import { canonical } from '../domain/util'

export const BACKUP_APP = 'indian-chicken-center'
export const BACKUP_SCHEMA_VERSION = 1

/** A stored document's data, by path ("ledgerEntries/sale-1", "trips/trip_…/events/load-1"). */
export type BackupData = Record<string, Record<string, unknown>>

export const BACKUP_KINDS = [
  'settings',
  'users',
  'invites',
  'vehicles',
  'customers',
  'trips',
  'tripEvents',
  'purchases',
  'tripTotals',
  'ledgerEntries',
  'ledgerClosures',
  'bills',
  'billCounters',
] as const
export type BackupKind = (typeof BACKUP_KINDS)[number]

export interface BackupFile {
  schemaVersion: typeof BACKUP_SCHEMA_VERSION
  app: typeof BACKUP_APP
  /** ISO time the records were read. */
  createdAt: string
  /** User id of the owner who made it. */
  createdBy: string
  /** Firebase project the records came from. */
  projectId: string
  counts: Record<BackupKind, number>
  /** Every customer's balance in paise, recomputed from all their entries. */
  balances: Record<string, Paise>
  /** SHA-256 (hex) of the data, written with keys in a fixed order. */
  sha256: string
  data: BackupData
}

export function kindOf(path: string): BackupKind | undefined {
  const p = path.split('/')
  if (p.length === 2) {
    const top: Record<string, BackupKind> = {
      settings: 'settings',
      users: 'users',
      invites: 'invites',
      vehicles: 'vehicles',
      customers: 'customers',
      trips: 'trips',
      ledgerEntries: 'ledgerEntries',
      ledgerClosures: 'ledgerClosures',
      bills: 'bills',
      billCounters: 'billCounters',
    }
    return p[0] ? top[p[0]] : undefined
  }
  if (p.length === 4 && p[0] === 'trips') {
    return p[2] === 'events' ? 'tripEvents' : p[2] === 'purchases' ? 'purchases' : p[2] === 'totals' ? 'tripTotals' : undefined
  }
  return undefined
}

export function countsOf(data: BackupData): Record<BackupKind, number> {
  const counts = Object.fromEntries(BACKUP_KINDS.map((k) => [k, 0])) as Record<BackupKind, number>
  for (const path of Object.keys(data)) {
    const kind = kindOf(path)
    if (kind) counts[kind]++
  }
  return counts
}

function ledgerOf(data: BackupData): LedgerEntry[] {
  return Object.entries(data)
    .filter(([path]) => kindOf(path) === 'ledgerEntries')
    .map(([, doc]) => doc as unknown as LedgerEntry)
}

function customerIds(data: BackupData): string[] {
  return Object.keys(data)
    .filter((path) => kindOf(path) === 'customers')
    .map((path) => path.split('/')[1] ?? '')
    .sort()
}

/** Every customer's balance from all their entries (a full recompute, D-09). */
export function balancesOf(data: BackupData): Record<string, Paise> {
  const book = ledgerOf(data)
  return Object.fromEntries(customerIds(data).map((id) => [id, recomputeBalance(book, id)]))
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The checksum covers the data written with its keys in a fixed order, so the same records always give the same sum. */
export function checksumOf(data: BackupData): Promise<string> {
  return sha256Hex(canonical(data))
}

export async function makeBackup(
  data: BackupData,
  meta: { createdAt: string; createdBy: string; projectId: string },
): Promise<BackupFile> {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    app: BACKUP_APP,
    createdAt: meta.createdAt,
    createdBy: meta.createdBy,
    projectId: meta.projectId,
    counts: countsOf(data),
    balances: balancesOf(data),
    sha256: await checksumOf(data),
    data,
  }
}

/** "ICC backup 2026-11-23 0915.json" (the time is the phone's, in Asia/Kolkata). */
export function backupFileName(createdAt: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(createdAt))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `ICC backup ${get('year')}-${get('month')}-${get('day')} ${get('hour')}${get('minute')}.json`
}

export interface BackupCheck {
  /** True when the checksum, the counts and every balance agree with the file's own figures. */
  ok: boolean
  /** What did not agree, in plain words (empty when ok). */
  problems: string[]
  file: Pick<BackupFile, 'createdAt' | 'createdBy' | 'projectId' | 'sha256'>
  documents: number
  counts: Record<BackupKind, number>
  balances: Record<string, Paise>
  /** Customers whose latest month-end snapshot disagrees with a full recompute of that month. */
  snapshotMismatches: string[]
}

/** Reads a backup file and checks every part of it again. */
export async function checkBackup(text: string): Promise<Result<BackupCheck>> {
  let file: BackupFile
  try {
    file = JSON.parse(text) as BackupFile
  } catch {
    return fail('invalid_input', 'This is not a backup file (it is not JSON)')
  }
  if (file?.app !== BACKUP_APP) return fail('invalid_input', 'This is not an Indian Chicken Center backup')
  if (file.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    return fail('invalid_input', `Backup version ${String(file.schemaVersion)} is not supported by this app`)
  }
  if (typeof file.data !== 'object' || file.data === null) return fail('invalid_input', 'The backup has no records')

  const problems: string[] = []
  const sum = await checksumOf(file.data)
  if (sum !== file.sha256) problems.push('The checksum does not match: the file has changed since it was made.')
  const unknown = Object.keys(file.data).filter((path) => !kindOf(path))
  if (unknown.length) problems.push(`Records in unknown places: ${unknown.slice(0, 3).join(', ')}`)

  const counts = countsOf(file.data)
  for (const kind of BACKUP_KINDS) {
    if (counts[kind] !== file.counts?.[kind]) problems.push(`${kind}: the file says ${String(file.counts?.[kind])}, it holds ${counts[kind]}.`)
  }
  const balances = balancesOf(file.data)
  for (const [id, balance] of Object.entries(balances)) {
    if (file.balances?.[id] !== balance) problems.push(`Customer ${id}: the file says ${String(file.balances?.[id])} paise, the entries add up to ${balance}.`)
  }
  for (const id of Object.keys(file.balances ?? {})) {
    if (!(id in balances)) problems.push(`Customer ${id} has a balance but no customer record.`)
  }

  const book = ledgerOf(file.data)
  const snapshotMismatches = customerIds(file.data).filter((id) => customerBalance(book, id).snapshotMismatch)

  return ok({
    ok: problems.length === 0,
    problems,
    file: { createdAt: file.createdAt, createdBy: file.createdBy, projectId: file.projectId, sha256: file.sha256 },
    documents: Object.keys(file.data).length,
    counts,
    balances,
    snapshotMismatches,
  })
}

/**
 * B-05: a backup counts as verified only when the copy downloaded from Drive has the checksum it was uploaded with
 * (B-03) and passes every check (B-04 on the phone; the restore tool repeats it into an empty database).
 */
export async function verifyCopy(uploaded: Pick<BackupFile, 'sha256'>, downloaded: string): Promise<Result<BackupCheck>> {
  const check = await checkBackup(downloaded)
  if (!check.ok) return check
  if (check.value.file.sha256 !== uploaded.sha256) {
    return ok({ ...check.value, ok: false, problems: ['The copy on Drive is a different backup.', ...check.value.problems] })
  }
  return check
}

/** B-06 preview: which backed-up records are missing from the cloud, and which differ (those are never overwritten). */
export function planRestore(
  backup: BackupData,
  live: BackupData,
): { missing: string[]; different: string[]; same: number } {
  const missing: string[] = []
  const different: string[] = []
  let same = 0
  for (const [path, doc] of Object.entries(backup)) {
    const now = live[path]
    if (!now) missing.push(path)
    else if (canonical(now) !== canonical(doc)) different.push(path)
    else same++
  }
  return { missing: missing.sort(), different: different.sort(), same }
}
