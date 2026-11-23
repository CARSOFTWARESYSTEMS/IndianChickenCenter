/**
 * Restore tool (P7, B-06): adds back records missing from Firestore, from a checked backup file.
 * It never changes or deletes a record that exists. Without --apply it only shows what it would add.
 *
 *   npm run restore -- <backup.json> --emulator             local emulator, project demo-icc
 *   npm run restore -- <backup.json> --project <id>          real project (shows the plan)
 *   npm run restore -- <backup.json> --project <id> --apply  real project (adds what is missing)
 *
 * For a real project it needs an access token of a project owner: sign in once with `gcloud auth login`
 * (the tool then runs `gcloud auth print-access-token`), or set ICC_ACCESS_TOKEN.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { cloudTarget, emulatorTarget, restoreMissing } from '../src/backup/restore'
import { checkBackup } from '../src/backup/backup'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--project' && args[args.indexOf(a) - 1] !== '--database')
const flag = (name: string) => args.includes(name)
const option = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function token(): string {
  if (process.env.ICC_ACCESS_TOKEN) return process.env.ICC_ACCESS_TOKEN
  try {
    return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
  } catch {
    console.error('Needs an owner access token: run `gcloud auth login` first, or set ICC_ACCESS_TOKEN.')
    process.exit(1)
  }
}

async function main(): Promise<void> {
  if (!file) {
    console.error('Usage: npm run restore -- <backup.json> (--emulator | --project <id>) [--apply]')
    process.exit(1)
  }
  const text = readFileSync(file, 'utf8')
  const check = await checkBackup(text)
  if (!check.ok) throw new Error(check.error.message)
  const c = check.value
  console.log(`Backup of ${c.file.projectId}, made ${c.file.createdAt}: ${c.documents} records, checksum ${c.ok ? 'OK' : 'NOT OK'}`)
  for (const p of c.problems) console.log(`  problem: ${p}`)
  if (c.snapshotMismatches.length) console.log(`  month-end snapshots that disagree with a recompute: ${c.snapshotMismatches.join(', ')}`)

  const project = option('--project')
  const target = flag('--emulator')
    ? emulatorTarget(project ?? 'demo-icc', option('--database') ?? '(default)')
    : project
      ? cloudTarget(project, token())
      : undefined
  if (!target) {
    console.error('Say where to restore: --emulator or --project <id>.')
    process.exit(1)
  }
  const apply = flag('--apply')
  const report = await restoreMissing(target, text, { apply })
  if (!report.ok) throw new Error(report.error.message)
  const r = report.value
  console.log(`${target.projectId}: ${r.same} records already there, ${r.different.length} differ (left as they are), ${r.missing.length} missing.`)
  for (const p of r.different.slice(0, 20)) console.log(`  differs, not touched: ${p}`)
  for (const p of r.missing.slice(0, 20)) console.log(`  missing: ${p}`)
  if (!apply) console.log(r.missing.length ? 'Nothing written. Run again with --apply to add the missing records.' : 'Nothing to add.')
  else console.log(`Added ${r.written.length}. Skipped ${r.skipped.length} that appeared meanwhile.`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
