/**
 * Restore (P7, B-06): adds back records that are missing from a Firestore database, from a checked backup file.
 * It never changes a record that exists: each write carries the condition "only if this document does not exist".
 *
 * This runs on a computer (scripts/restore.ts), not in the app. The security rules only accept records written
 * now by the person signed in, on open trips, in open months; a record from a backup is none of those, so it is
 * written with the project's admin access instead of loosening the rules (decision D-29).
 * Talks to the Firestore REST API with `fetch`, so it also works against the emulator (and in the tests).
 */
import { fail, ok, type Result } from '../domain'
import { checkBackup, planRestore, type BackupData, type BackupFile } from './backup'

export interface RestTarget {
  /** e.g. https://firestore.googleapis.com/v1, or http://127.0.0.1:8080/v1 for the emulator */
  baseUrl: string
  projectId: string
  database: string
  /** An access token of a project owner (gcloud auth print-access-token); "owner" for the emulator. */
  token: string
}

export function emulatorTarget(projectId: string, database = '(default)', host = '127.0.0.1:8080'): RestTarget {
  return { baseUrl: `http://${host}/v1`, projectId, database, token: 'owner' }
}

export function cloudTarget(projectId: string, token: string): RestTarget {
  return { baseUrl: 'https://firestore.googleapis.com/v1', projectId, database: '(default)', token }
}

type Value =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: Value[] } }
  | { mapValue: { fields?: Record<string, Value> } }

export function toValue(v: unknown): Value {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toValue) } : {} }
  return { mapValue: { fields: toFields(v as Record<string, unknown>) } }
}

export function toFields(doc: Record<string, unknown>): Record<string, Value> {
  return Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toValue(v)]))
}

export function fromValue(v: Value): unknown {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('stringValue' in v) return v.stringValue
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue)
  return fromFields(v.mapValue.fields ?? {})
}

export function fromFields(fields: Record<string, Value>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)]))
}

function root(t: RestTarget): string {
  return `projects/${t.projectId}/databases/${t.database}/documents`
}

async function post(t: RestTarget, action: string, body: unknown): Promise<Response> {
  return fetch(`${t.baseUrl}/${root(t)}:${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** The documents that exist now at these paths, read in groups of 100. */
export async function readPaths(t: RestTarget, paths: readonly string[]): Promise<Result<BackupData>> {
  const found: BackupData = {}
  for (let i = 0; i < paths.length; i += 100) {
    const res = await post(t, 'batchGet', { documents: paths.slice(i, i + 100).map((p) => `${root(t)}/${p}`) })
    if (!res.ok) return fail('not_saved', `Reading the database failed (${res.status}) ${(await res.text()).slice(0, 200)}`)
    const rows = (await res.json()) as { found?: { name: string; fields?: Record<string, Value> } }[]
    for (const row of rows) {
      if (row.found) found[row.found.name.slice(root(t).length + 1)] = fromFields(row.found.fields ?? {})
    }
  }
  return ok(found)
}

export interface RestoreReport {
  missing: string[]
  different: string[]
  same: number
  /** Added (only with apply). */
  written: string[]
  /** Not added because a record appeared there meanwhile (never overwritten). */
  skipped: string[]
}

/** Checks the backup, compares it with the database, and (with apply) adds only what is missing. */
export async function restoreMissing(t: RestTarget, text: string, options: { apply: boolean }): Promise<Result<RestoreReport>> {
  const check = await checkBackup(text)
  if (!check.ok) return check
  if (!check.value.ok) return fail('invalid_input', `The backup did not pass its checks: ${check.value.problems.join(' ')}`)
  const backup = JSON.parse(text) as BackupFile
  const live = await readPaths(t, Object.keys(backup.data))
  if (!live.ok) return live
  const plan = planRestore(backup.data, live.value)
  const report: RestoreReport = { ...plan, written: [], skipped: [] }
  if (!options.apply) return ok(report)

  for (let i = 0; i < plan.missing.length; i += 500) {
    const chunk = plan.missing.slice(i, i + 500)
    const res = await post(t, 'batchWrite', {
      writes: chunk.map((path) => ({
        update: { name: `${root(t)}/${path}`, fields: toFields(backup.data[path] ?? {}) },
        currentDocument: { exists: false },
      })),
    })
    if (!res.ok) return fail('not_saved', `Writing failed (${res.status}) ${(await res.text()).slice(0, 200)}`)
    const { status = [] } = (await res.json()) as { status?: { code?: number }[] }
    chunk.forEach((path, j) => ((status[j]?.code ?? 0) === 0 ? report.written : report.skipped).push(path))
  }
  return ok(report)
}
