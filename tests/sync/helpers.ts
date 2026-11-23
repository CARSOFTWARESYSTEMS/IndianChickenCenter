/**
 * Devices for the sync tests: a real Firestore client per device, signed in through the emulator's mock token,
 * running the app's cloud store. Seed data is written with rules off.
 */
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, terminate, type Firestore } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { DEFAULT_SETTINGS, type Role } from '../../src/domain'
import { settingsWrites, tripIdFor, type DocWrite } from '../../src/data/docs'
import { startCloud, type CloudStore } from '../../src/store/cloud'
import { commit } from '../rules/helpers'

export const TODAY = '2026-11-22'
export const TRIP = tripIdFor(TODAY, 'KA21AB1234')

let count = 0
const opened: { app: FirebaseApp; db: Firestore; store?: CloudStore }[] = []

export function device(uid: string): { db: Firestore } {
  const [host = '127.0.0.1', port = '8080'] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  const app = initializeApp({ projectId: 'demo-icc', apiKey: 'demo-api-key' }, `device-${uid}-${count++}`)
  const db = initializeFirestore(app, { localCache: memoryLocalCache() })
  connectFirestoreEmulator(db, host, Number(port), {
    mockUserToken: { sub: uid, user_id: uid, email: `${uid}@example.com`, email_verified: true },
  })
  opened.push({ app, db })
  return { db }
}

/** The app's cloud store on its own device. Only one store runs at a time (it is the app's single store). */
export async function phone(
  uid: string,
  role: Role,
  options: { today?: string; storage?: Map<string, string>; online?: () => boolean } = {},
) {
  const { db } = device(uid)
  const storage = options.storage ?? new Map<string, string>()
  const store = startCloud({
    db,
    uid,
    role,
    today: options.today ?? TODAY,
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) },
    ...(options.online ? { online: options.online } : {}),
  })
  const entry = opened.at(-1)
  if (entry) entry.store = store
  await store.ready
  return { db, store, storage }
}

export async function closeDevices(): Promise<void> {
  for (const { app, db, store } of opened.splice(0)) {
    store?.stop()
    await terminate(db)
    await deleteApp(app)
  }
}

export async function until(check: () => boolean, ms = 15_000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('Timed out waiting')
    await new Promise((r) => setTimeout(r, 50))
  }
}

const user = (name: string, role: string) => ({ name, email: `${name.toLowerCase()}@example.com`, role, addedBy: 'console', addedOn: '2026-11-01' })
const set = (path: string, data: Record<string, unknown>): DocWrite => ({ op: 'set', path, data })

/**
 * Owner, manager, driver; Customer1 with October closed at ₹10,778 and November activity;
 * Customer2 with nothing yet; an open trip for the driver with 1,000 kg loaded at ₹120.
 */
export async function seedCloud(env: RulesTestEnvironment): Promise<void> {
  // The emulator sometimes answers a clear with a 500 while a closed client's streams wind down; try again.
  for (let attempt = 0; ; attempt++) {
    try {
      await env.clearFirestore()
      break
    } catch (err) {
      if (attempt >= 5) throw err
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  await env.withSecurityRulesDisabled(async (ctx) => {
    await commit(ctx, [
      set('users/owner', user('Umarabba', 'owner')),
      set('users/manager', user('Manager', 'manager')),
      set('users/manager2', user('Manager2', 'manager')),
      set('users/driver', user('Ramesh', 'driver')),
      ...settingsWrites(DEFAULT_SETTINGS, 'owner'),
      set('customers/c1', { id: 'c1', shopName: 'Customer1', createdAt: '2026-10-01', createdBy: 'owner' }),
      set('customers/c2', { id: 'c2', shopName: 'Customer2', createdAt: '2026-10-01', createdBy: 'owner' }),
      // October, closed (C-TXT L64–69, paise dropped): ₹10,778 over four entries.
      set('ledgerEntries/open_c1', { id: 'open_c1', customerId: 'c1', date: '2026-10-01', createdBy: 'owner', type: 'OPENING_BALANCE', direction: 'DEBIT', amount: 1_062_500 }),
      set('ledgerEntries/oct-sale-1', { id: 'oct-sale-1', customerId: 'c1', date: '2026-10-05', createdBy: 'owner', type: 'SALE', grams: 63_100, ratePaisePerKg: 12_800, exactMilliPaise: 807_680_000, amount: 807_600, policyId: 'TRUNCATE_RUPEE', differenceMilliPaise: 80_000 }),
      set('ledgerEntries/oct-sale-2', { id: 'oct-sale-2', customerId: 'c1', date: '2026-10-12', createdBy: 'owner', type: 'SALE', grams: 153_200, ratePaisePerKg: 11_800, exactMilliPaise: 1_807_760_000, amount: 1_807_700, policyId: 'TRUNCATE_RUPEE', differenceMilliPaise: 60_000 }),
      set('ledgerEntries/oct-pay', { id: 'oct-pay', customerId: 'c1', date: '2026-10-20', createdBy: 'owner', type: 'PAYMENT', amount: 2_600_000, method: 'CASH' }),
      set('ledgerEntries/snap_c1_2026-10', { id: 'snap_c1_2026-10', customerId: 'c1', date: '2026-11-01', createdBy: 'owner', type: 'MONTH_END_SNAPSHOT', month: '2026-10', closingBalance: 1_077_800, entryCount: 4 }),
      set('ledgerClosures/c1', { customerId: 'c1', closedThrough: '2026-10', closedBy: 'owner' }),
      set('ledgerEntries/snap_c2_2026-10', { id: 'snap_c2_2026-10', customerId: 'c2', date: '2026-11-01', createdBy: 'owner', type: 'MONTH_END_SNAPSHOT', month: '2026-10', closingBalance: 0, entryCount: 0 }),
      set('ledgerClosures/c2', { customerId: 'c2', closedThrough: '2026-10', closedBy: 'owner' }),
      // November: 10 kg × ₹140 and ₹1,000 paid.
      set('ledgerEntries/nov-sale', { id: 'nov-sale', customerId: 'c1', date: '2026-11-05', createdBy: 'owner', type: 'SALE', grams: 10_000, ratePaisePerKg: 14_000, exactMilliPaise: 140_000_000, amount: 140_000, policyId: 'ROUND_HALF_UP_RUPEE', differenceMilliPaise: 0 }),
      set('ledgerEntries/nov-pay', { id: 'nov-pay', customerId: 'c1', date: '2026-11-10', createdBy: 'owner', type: 'PAYMENT', amount: 100_000, method: 'CASH' }),
      set(`trips/${TRIP}`, {
        id: TRIP, date: TODAY, status: 'OPEN', createdBy: 'owner', vehicleNumber: 'KA21AB1234', driverId: 'driver',
        driverName: 'Ramesh', defaultSaleRatePaisePerKg: 14_000, ratePaisePerKg: 14_000,
      }),
      set(`trips/${TRIP}/events/load-1`, { id: 'load-1', tripId: TRIP, date: TODAY, createdBy: 'owner', type: 'LOADING', grams: 1_000_000 }),
      set(`trips/${TRIP}/purchases/load-1`, {
        id: 'load-1', tripId: TRIP, createdBy: 'owner', grams: 1_000_000, ratePaisePerKg: 12_000, exactMilliPaise: 12_000_000_000, amount: 12_000_000,
      }),
    ])
  })
}
