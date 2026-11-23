/**
 * Makes a backup file of the local emulator's data, as the owner would from the app, to try the restore tool:
 *
 *   npm run emulator:backup -- <owner email or uid> <out.json>
 *   npm run restore -- <out.json> --emulator --database restore-check            (dry run into an empty database)
 *   npm run restore -- <out.json> --emulator --database restore-check --apply
 */
import { writeFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, terminate } from 'firebase/firestore'
import { makeBackup } from '../src/backup/backup'
import { readEverything } from '../src/backup/collect'

const [who, out] = process.argv.slice(2)
const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'

async function ownerUid(key: string): Promise<string> {
  if (!key.includes('@')) return key
  const res = await fetch(`http://${HOST}/v1/projects/demo-icc/databases/(default)/documents/users?pageSize=300`, {
    headers: { Authorization: 'Bearer owner' },
  })
  const { documents = [] } = (await res.json()) as { documents?: { name: string; fields: Record<string, { stringValue?: string }> }[] }
  const match = documents.find((d) => d.fields.email?.stringValue === key.toLowerCase())
  if (!match) throw new Error(`No user ${key} in the emulator`)
  return match.name.split('/').pop() ?? key
}

async function main(): Promise<void> {
  if (!who || !out) throw new Error('Usage: npm run emulator:backup -- <owner email or uid> <out.json>')
  const uid = await ownerUid(who)
  const [host = '127.0.0.1', port = '8080'] = HOST.split(':')
  const app = initializeApp({ projectId: 'demo-icc', apiKey: 'demo-api-key' })
  const db = initializeFirestore(app, { localCache: memoryLocalCache() })
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid, user_id: uid, email_verified: true } })
  const data = await readEverything(db)
  if (!data.ok) throw new Error(data.error.message)
  const file = await makeBackup(data.value, { createdAt: new Date().toISOString(), createdBy: uid, projectId: 'demo-icc' })
  writeFileSync(out, JSON.stringify(file))
  console.log(`Wrote ${Object.keys(file.data).length} records to ${out}`)
  await terminate(db)
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
