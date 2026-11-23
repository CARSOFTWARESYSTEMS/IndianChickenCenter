/** Who may read and write what: S-01–S-03 from the plan, plus visibility, invites, settings, customers (R-*). */
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/domain'
import { claimInviteWrites, inviteWrites, newCustomerWrites, settingsWrites, vehicleWrites } from '../../src/data/docs'
import { as, CLOSED_TRIP, commit, EMAIL, OPEN_TRIP, OTHER_DRIVER_TRIP, seed, set, startEnv, TODAY } from './helpers'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await startEnv()
})
beforeEach(() => seed(env))
afterAll(() => env.cleanup())

const must = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  if (!r.ok) throw new Error('builder failed')
  return r.value
}

describe('sign-in and authorised users', () => {
  it('S-01 a visitor who is not signed in can read nothing', async () => {
    const db = env.unauthenticatedContext().firestore()
    for (const path of [
      'settings/business',
      'users/owner',
      'customers/c1',
      `trips/${OPEN_TRIP}`,
      `trips/${OPEN_TRIP}/events/exp-1`,
      `trips/${OPEN_TRIP}/purchases/load-1`,
      `trips/${CLOSED_TRIP}/totals/close`,
      'ledgerEntries/sale-1',
    ]) {
      await assertFails(db.doc(path).get())
    }
    await assertFails(db.collection('customers').get())
    await assertFails(db.collection('ledgerEntries').get())
  })

  it('S-02 a Google account with no user record cannot read customers or the ledger', async () => {
    const db = as(env, 'stranger').firestore()
    await assertFails(db.doc('customers/c1').get())
    await assertFails(db.collection('customers').get())
    await assertFails(db.doc('ledgerEntries/sale-1').get())
    await assertFails(db.collection('ledgerEntries').get())
    await assertFails(db.doc('settings/business').get())
    // It may look for its own record (to show "ask the owner to add you"), and finds none.
    await assertSucceeds(db.doc('users/stranger').get())
    // It cannot make itself a user without an invite.
    await assertFails(
      db.doc('users/stranger').set({ name: 'X', email: EMAIL.stranger, role: 'owner', addedBy: 'owner', addedOn: TODAY }),
    )
  })

  it('S-03 nobody writes user records directly or changes their own role', async () => {
    await assertFails(
      as(env, 'manager').firestore().doc('users/someone').set({
        name: 'Someone', email: 'someone@example.com', role: 'manager', addedBy: 'manager', addedOn: TODAY,
      }),
    )
    await assertFails(as(env, 'driver').firestore().doc('users/driver').update({ role: 'owner' }))
    await assertFails(as(env, 'manager').firestore().doc('users/manager').update({ role: 'owner' }))
    await assertFails(as(env, 'owner').firestore().doc('users/owner').update({ role: 'manager' }))
    // The owner cannot create a record for a Google account either: people join by invite.
    await assertFails(
      as(env, 'owner').firestore().doc('users/new').set({
        name: 'New', email: 'new@example.com', role: 'driver', addedBy: 'owner', addedOn: TODAY,
      }),
    )
    // The owner may change someone else's role, but not make another owner.
    await assertSucceeds(as(env, 'owner').firestore().doc('users/driver2').update({ role: 'manager' }))
    await assertFails(as(env, 'owner').firestore().doc('users/driver').update({ role: 'owner' }))
    await assertFails(as(env, 'manager').firestore().doc('users/driver').update({ role: 'manager' }))
  })
})

describe('what each role can see (D-17)', () => {
  it('R-02 drivers see their own trip and its events, but no purchase rates, money totals or other trips', async () => {
    const driver = as(env, 'driver').firestore()
    await assertSucceeds(driver.doc(`trips/${OPEN_TRIP}`).get())
    await assertSucceeds(driver.collection('trips').where('driverId', '==', 'driver').get())
    await assertSucceeds(driver.collection(`trips/${OPEN_TRIP}/events`).get())
    await assertSucceeds(driver.doc(`trips/${OPEN_TRIP}/events/load-1`).get())
    await assertFails(driver.doc(`trips/${OPEN_TRIP}/purchases/load-1`).get())
    await assertFails(driver.collection(`trips/${OPEN_TRIP}/purchases`).get())
    await assertFails(driver.doc(`trips/${CLOSED_TRIP}/totals/close`).get())
    await assertFails(driver.doc(`trips/${OTHER_DRIVER_TRIP}`).get())
    await assertFails(driver.collection('trips').get())
    await assertFails(driver.collection(`trips/${OTHER_DRIVER_TRIP}/events`).get())
    // Balances and bills: drivers read the ledger, customers and settings.
    await assertSucceeds(driver.collection('ledgerEntries').get())
    await assertSucceeds(driver.doc('customers/c1').get())
    await assertSucceeds(driver.doc('settings/business').get())

    for (const who of ['owner', 'manager'] as const) {
      const db = as(env, who).firestore()
      await assertSucceeds(db.collection('trips').get())
      await assertSucceeds(db.doc(`trips/${OPEN_TRIP}/purchases/load-1`).get())
      await assertSucceeds(db.doc(`trips/${CLOSED_TRIP}/totals/close`).get())
    }
    // Invites are the owner's business.
    await assertFails(as(env, 'manager').firestore().collection('invites').get())
  })

  it('R-16 owner and manager read every trip\'s events, purchases and totals in one query each; drivers cannot', async () => {
    for (const who of ['owner', 'manager'] as const) {
      const db = as(env, who).firestore()
      await assertSucceeds(db.collectionGroup('events').where('tripId', '>=', 'trip_2026-11-01').get())
      await assertSucceeds(db.collectionGroup('purchases').where('tripId', '>=', 'trip_2026-11-01').get())
      await assertSucceeds(db.collectionGroup('totals').where('tripId', '>=', 'trip_2026-11-01').get())
    }
    const driver = as(env, 'driver').firestore()
    await assertFails(driver.collectionGroup('events').where('tripId', '>=', 'trip_2026-11-01').get())
    await assertFails(driver.collectionGroup('purchases').get())
    await assertFails(driver.collectionGroup('totals').get())
    // Writing through a collection-group path is still the trip rules' business.
    await assertFails(as(env, 'manager').firestore().doc(`trips/${CLOSED_TRIP}/events/late`).set({ id: 'late' }))
  })
})

describe('invites (D-22)', () => {
  const invite = { email: EMAIL.invitee, name: 'Mahesh', role: 'driver' as const }
  const inviteDoc = { ...invite, invitedBy: 'owner', invitedOn: TODAY }

  it('R-09 the owner invites by email; that Google account joins with exactly the invited role', async () => {
    await assertFails(commit(as(env, 'manager'), must(inviteWrites(invite, 'manager', TODAY))))
    await assertFails(as(env, 'owner').firestore().doc(`invites/${EMAIL.invitee}`).set({ ...inviteDoc, role: 'owner' }))
    await assertFails(as(env, 'owner').firestore().doc('invites/New.Driver@example.com').set({ ...inviteDoc, email: 'New.Driver@example.com' }))
    await assertSucceeds(commit(as(env, 'owner'), must(inviteWrites(invite, 'owner', TODAY))))

    const invitee = env.authenticatedContext('uid-mahesh', { email: EMAIL.invitee, email_verified: true })
    const unverified = env.authenticatedContext('uid-mahesh', { email: EMAIL.invitee, email_verified: false })
    const someoneElse = env.authenticatedContext('uid-other', { email: 'other@example.com', email_verified: true })
    await assertSucceeds(invitee.firestore().doc(`invites/${EMAIL.invitee}`).get())
    await assertFails(someoneElse.firestore().doc(`invites/${EMAIL.invitee}`).get())

    const claim = claimInviteWrites('uid-mahesh', inviteDoc, TODAY)
    await assertFails(commit(unverified, claim))
    await assertFails(commit(someoneElse, claimInviteWrites('uid-other', inviteDoc, TODAY)))
    await assertFails(commit(invitee, [claim[0]!])) // the invite must be used up in the same write
    await assertFails(
      commit(invitee, [set('users/uid-mahesh', { name: 'Mahesh', email: EMAIL.invitee, role: 'manager', addedBy: 'owner', addedOn: TODAY }), claim[1]!]),
    )
    await assertFails(invitee.firestore().doc('customers/c1').get())
    await assertSucceeds(commit(invitee, claim))
    await assertSucceeds(invitee.firestore().doc('customers/c1').get())
    await assertFails(invitee.firestore().doc(`trips/${CLOSED_TRIP}/totals/close`).get())
  })

  it('R-09b the owner withdraws invites and removes people, but not themselves', async () => {
    await assertSucceeds(commit(as(env, 'owner'), must(inviteWrites(invite, 'owner', TODAY))))
    await assertFails(as(env, 'manager').firestore().doc(`invites/${EMAIL.invitee}`).delete())
    await assertSucceeds(as(env, 'owner').firestore().doc(`invites/${EMAIL.invitee}`).delete())
    await assertFails(as(env, 'manager').firestore().doc('users/driver2').delete())
    await assertSucceeds(as(env, 'owner').firestore().doc('users/driver2').delete())
    await assertFails(as(env, 'driver2').firestore().doc('customers/c1').get())
    await assertFails(as(env, 'owner').firestore().doc('users/owner').delete())
  })
})

describe('settings and customers', () => {
  it('R-10 only the owner saves settings, and only valid ones (U-01, U-08)', async () => {
    await assertSucceeds(commit(as(env, 'owner'), settingsWrites(DEFAULT_SETTINGS, 'owner')))
    await assertFails(commit(as(env, 'manager'), settingsWrites(DEFAULT_SETTINGS, 'manager')))
    await assertFails(commit(as(env, 'owner'), settingsWrites(DEFAULT_SETTINGS, 'manager')))
    await assertFails(commit(as(env, 'owner'), settingsWrites({ ...DEFAULT_SETTINGS, gst: { enabled: true } }, 'owner')))
    await assertFails(
      commit(as(env, 'owner'), settingsWrites({ ...DEFAULT_SETTINGS, gst: { enabled: true, gstin: '29ABCDE1234F1Z' } }, 'owner')),
    )
    await assertSucceeds(
      commit(as(env, 'owner'), settingsWrites({ ...DEFAULT_SETTINGS, gst: { enabled: true, gstin: '29ABCDE1234F1Z5' } }, 'owner')),
    )
    await assertFails(
      commit(as(env, 'owner'), settingsWrites({ ...DEFAULT_SETTINGS, roundingPolicy: 'ROUND_DOWN' as never }, 'owner')),
    )
    await assertSucceeds(commit(as(env, 'owner'), settingsWrites({ ...DEFAULT_SETTINGS, roundingPolicy: null }, 'owner')))
    await assertFails(as(env, 'owner').firestore().doc('settings/other').set({ businessName: 'X' }))
  })

  it('R-13 owner and manager add and edit customers; customers are never deleted', async () => {
    const customer = { id: 'c3', shopName: 'New Shop', phone: '919812345678', createdAt: TODAY, createdBy: 'manager' }
    await assertFails(commit(as(env, 'driver'), newCustomerWrites({ ...customer, createdBy: 'driver' })))
    await assertFails(commit(as(env, 'manager'), newCustomerWrites({ ...customer, phone: '9812345678' })))
    await assertFails(commit(as(env, 'manager'), newCustomerWrites({ ...customer, createdBy: 'owner' })))
    await assertFails(as(env, 'manager').firestore().doc('customers/c3').set({ ...customer, balance: 0 }))
    await assertSucceeds(commit(as(env, 'manager'), newCustomerWrites(customer)))
    await assertSucceeds(as(env, 'manager').firestore().doc('customers/c3').update({ shopName: 'New Shop Ujire' }))
    await assertFails(as(env, 'manager').firestore().doc('customers/c3').update({ createdBy: 'manager2' }))
    await assertFails(as(env, 'driver').firestore().doc('customers/c3').update({ shopName: 'Mine' }))
    await assertFails(as(env, 'owner').firestore().doc('customers/c3').delete())
  })

  it('R-14 owner and manager register vehicles by their cleaned-up number (U-06)', async () => {
    await assertSucceeds(commit(as(env, 'manager'), vehicleWrites('KA21Z4321', 'manager')))
    await assertFails(commit(as(env, 'driver'), vehicleWrites('KA21Z4322', 'driver')))
    await assertFails(commit(as(env, 'manager'), vehicleWrites('ka-21 z 4323', 'manager')))
    await assertFails(as(env, 'manager').firestore().doc('vehicles/KA21Z4321').update({ number: 'KA21Z4321' }))
    await assertFails(as(env, 'manager').firestore().doc('vehicles/KA21Z4321').delete())
    await assertSucceeds(as(env, 'owner').firestore().doc('vehicles/KA21Z4321').delete())
  })
})

