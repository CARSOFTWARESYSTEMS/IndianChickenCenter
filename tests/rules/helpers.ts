/**
 * Shared set-up for the security-rule tests. Every test starts from the same seed, written with rules off:
 * four app users, two customers, an open trip for the driver, an open trip for a second driver, a closed trip.
 */
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { DEFAULT_SETTINGS } from '../../src/domain'
import { settingsWrites, type DocWrite } from '../../src/data/docs'

export const TODAY = '2026-11-22'
export const OPEN_TRIP = 'trip_2026-11-22_KA21AB1234'
export const OTHER_DRIVER_TRIP = 'trip_2026-11-22_KA21AB1235'
export const CLOSED_TRIP = 'trip_2026-11-21_KA21AB1234'

export const EMAIL = {
  owner: 'owner@example.com',
  manager: 'manager@example.com',
  driver: 'driver@example.com',
  driver2: 'driver2@example.com',
  stranger: 'stranger@example.com',
  invitee: 'new.driver@example.com',
}

export async function startEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'demo-icc',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
}

export type Who = keyof typeof EMAIL

export function as(env: RulesTestEnvironment, who: Who, verified = true): RulesTestContext {
  return env.authenticatedContext(who, { email: EMAIL[who], email_verified: verified })
}

/** Applies DocWrites as one batched write, the way the app saves. */
export function commit(ctx: RulesTestContext, writes: DocWrite[]): Promise<void> {
  const db = ctx.firestore()
  const batch = db.batch()
  for (const w of writes) {
    const ref = db.doc(w.path)
    if (w.op === 'set') batch.set(ref, w.data)
    else if (w.op === 'update') batch.update(ref, w.data)
    else batch.delete(ref)
  }
  return batch.commit()
}

export const set = (path: string, data: Record<string, unknown>): DocWrite => ({ op: 'set', path, data })
export const update = (path: string, data: Record<string, unknown>): DocWrite => ({ op: 'update', path, data })

const user = (name: string, email: string, role: string) => ({ name, email, role, addedBy: 'console', addedOn: '2026-11-01' })

const trip = (id: string, date: string, vehicleNumber: string, driverId: string, status = 'OPEN') => ({
  id,
  date,
  status,
  createdBy: 'owner',
  vehicleNumber,
  driverId,
  driverName: driverId === 'driver' ? 'Ramesh' : 'Suresh',
  defaultSaleRatePaisePerKg: 14_000,
  ratePaisePerKg: 14_000,
})

/** 63.1 kg × ₹128, posted under the owner's rounding (₹8,076.80 → ₹8,077). */
export const SEED_SALE = {
  id: 'sale-1',
  customerId: 'c1',
  date: TODAY,
  createdBy: 'owner',
  type: 'SALE',
  tripId: OPEN_TRIP,
  grams: 63_100,
  ratePaisePerKg: 12_800,
  exactMilliPaise: 807_680_000,
  amount: 807_700,
  policyId: 'ROUND_HALF_UP_RUPEE',
  differenceMilliPaise: -20_000,
}

export async function seed(env: RulesTestEnvironment): Promise<void> {
  // The emulator sometimes answers a clear with a 500 while an earlier client's streams wind down; try again.
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
      set('users/owner', user('Umarabba', EMAIL.owner, 'owner')),
      set('users/manager', user('Manager', EMAIL.manager, 'manager')),
      set('users/driver', user('Ramesh', EMAIL.driver, 'driver')),
      set('users/driver2', user('Suresh', EMAIL.driver2, 'driver')),
      ...settingsWrites(DEFAULT_SETTINGS, 'owner'),
      set('customers/c1', { id: 'c1', shopName: 'Customer1', createdAt: '2026-10-01', createdBy: 'owner' }),
      set('customers/c2', { id: 'c2', shopName: 'Customer2', phone: '919876543210', createdAt: '2026-10-01', createdBy: 'owner' }),
      set('ledgerEntries/open_c1', {
        id: 'open_c1',
        customerId: 'c1',
        date: '2026-10-01',
        createdBy: 'owner',
        type: 'OPENING_BALANCE',
        direction: 'DEBIT',
        amount: 1_062_500,
      }),
      set(`trips/${OPEN_TRIP}`, trip(OPEN_TRIP, TODAY, 'KA21AB1234', 'driver')),
      set(`trips/${OTHER_DRIVER_TRIP}`, trip(OTHER_DRIVER_TRIP, TODAY, 'KA21AB1235', 'driver2')),
      set(`trips/${CLOSED_TRIP}`, {
        ...trip(CLOSED_TRIP, '2026-11-21', 'KA21AB1234', 'driver', 'CLOSED'),
        closedBy: 'owner',
        closedOn: '2026-11-21',
        closeKg: { loadedGrams: 100_000, soldGrams: 100_000, shopSoldGrams: 0, wastageGrams: 0 },
      }),
      set(`trips/${CLOSED_TRIP}/totals/close`, {
        tripId: CLOSED_TRIP,
        purchasePaise: 1_200_000,
        salesPaise: 1_400_000,
        operatingPaise: 0,
        closedBy: 'owner',
      }),
      set(`trips/${OPEN_TRIP}/events/load-1`, {
        id: 'load-1', tripId: OPEN_TRIP, date: TODAY, createdBy: 'owner', type: 'LOADING', grams: 1_000_000,
      }),
      set(`trips/${OPEN_TRIP}/purchases/load-1`, {
        id: 'load-1', tripId: OPEN_TRIP, createdBy: 'owner', grams: 1_000_000, ratePaisePerKg: 12_000,
        exactMilliPaise: 12_000_000_000, amount: 12_000_000,
      }),
      set(`trips/${OPEN_TRIP}/events/exp-1`, {
        id: 'exp-1', tripId: OPEN_TRIP, date: TODAY, createdBy: 'owner', type: 'EXPENSE', category: 'FOOD', amount: 50_000,
      }),
      set(`trips/${OTHER_DRIVER_TRIP}/events/exp-2`, {
        id: 'exp-2', tripId: OTHER_DRIVER_TRIP, date: TODAY, createdBy: 'owner', type: 'EXPENSE', category: 'FOOD', amount: 50_000,
      }),
      set(`trips/${CLOSED_TRIP}/events/exp-closed`, {
        id: 'exp-closed', tripId: CLOSED_TRIP, date: '2026-11-21', createdBy: 'owner', type: 'EXPENSE', category: 'FOOD', amount: 50_000,
      }),
      set('ledgerEntries/sale-1', SEED_SALE),
      set('ledgerEntries/sale-closed', {
        ...SEED_SALE, id: 'sale-closed', tripId: CLOSED_TRIP, date: '2026-11-21', customerId: 'c2',
      }),
    ])
  })
}
