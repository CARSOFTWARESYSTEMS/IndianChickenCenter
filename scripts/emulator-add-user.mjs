// Adds a user record in the local Firestore emulator (rules are bypassed with the emulator's "owner" token).
// This stands in for the Firebase console step "create users/{uid}" in docs/SETUP_AND_DEPLOY.md.
//
//   node scripts/emulator-add-user.mjs <uid or email> <owner|manager|driver> "<name>"
//
// Sign in once in the app first (the emulator's Google screen), so the account exists.
const [who, role = 'owner', name = 'Owner'] = process.argv.slice(2)
const PROJECT = 'demo-icc'
const AUTH = 'http://127.0.0.1:9099'
const FIRESTORE = 'http://127.0.0.1:8080'
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

if (!who || !['owner', 'manager', 'driver'].includes(role)) {
  console.error('Usage: node scripts/emulator-add-user.mjs <uid or email> <owner|manager|driver> "<name>"')
  process.exit(1)
}

async function findAccount(key) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet?maxResults=500`, { headers: admin })
  if (!res.ok) throw new Error(`Auth emulator: ${res.status} ${await res.text()}`)
  const { users = [] } = await res.json()
  const match = users.find((u) => u.localId === key || (u.email ?? '').toLowerCase() === key.toLowerCase())
  if (!match) throw new Error(`No emulator account for "${key}". Sign in once in the app first.`)
  return match
}

const account = await findAccount(who)
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const fields = {
  name: { stringValue: name },
  email: { stringValue: (account.email ?? '').toLowerCase() },
  role: { stringValue: role },
  addedBy: { stringValue: 'console' },
  addedOn: { stringValue: today },
}
const res = await fetch(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${account.localId}`, {
  method: 'PATCH',
  headers: admin,
  body: JSON.stringify({ fields }),
})
if (!res.ok) throw new Error(`Firestore emulator: ${res.status} ${await res.text()}`)
console.log(`users/${account.localId}: ${name} <${account.email}> as ${role}`)
