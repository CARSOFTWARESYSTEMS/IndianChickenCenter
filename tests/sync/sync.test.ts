/**
 * Offline and sync (plan SY-01–SY-06), plus the cloud store's window and restart handling (SY-07–SY-09).
 * Each test runs the app's cloud store on real Firestore clients against the emulator, with the security rules on.
 */
import { assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { disableNetwork, enableNetwork } from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { kg, makeLoading, makeSale, ratePerKg, type Result } from '../../src/domain'
import { commitWrites } from '../../src/firebase/client'
import { ledgerEntryWrites } from '../../src/data/docs'
import { addTripEvent, closeMonthForAll, finishTrip, recordSale } from '../../src/store/commands'
import { balanceOf, tripById, tripSummaryOf } from '../../src/store/selectors'
import { dispatch, getState } from '../../src/store/store'
import { attentionItems, getSync, pendingCount } from '../../src/store/sync'
import { startEnv } from '../rules/helpers'
import { closeDevices, device, phone, seedCloud, TODAY, TRIP, until } from './helpers'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await startEnv()
})
beforeEach(() => seedCloud(env))
afterEach(() => closeDevices())
afterAll(() => env.cleanup())

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
  return r.value
}

const serverDoc = async (path: string) => {
  let data: Record<string, unknown> | undefined
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().doc(path).get()
    data = snap.exists ? (snap.data() as Record<string, unknown>) : undefined
  })
  return data
}

/** 10 kg at the trip rate ₹140 = ₹1,400. */
const driverSale = (id: string) => recordSale(TRIP, { id, customerId: 'c2', date: TODAY, createdBy: 'driver', grams: 10_000 })

describe('offline and sync (plan §5)', () => {
  it('SY-01 a sale with the network off is saved on the phone and counted at once', async () => {
    const { db } = await phone('driver', 'driver')
    await disableNetwork(db)
    must(dispatch(driverSale('sale-1')))
    const s = getSync()
    expect(pendingCount(s)).toBe(1)
    expect(s.pendingPaths.has('ledgerEntries/sale-1')).toBe(true)
    expect(getState().ledger.some((e) => e.id === 'sale-1')).toBe(true)
    expect(balanceOf(getState(), 'c2')).toBe(1_400_00)
    expect(await serverDoc('ledgerEntries/sale-1')).toBe(undefined)
  })

  it('SY-02 after reconnecting it shows "saved to cloud" only once the server confirms', async () => {
    const { db } = await phone('driver', 'driver')
    await disableNetwork(db)
    must(dispatch(driverSale('sale-1')))
    expect(getSync().items.at(-1)?.status).toBe('pending')
    await enableNetwork(db)
    await until(() => getSync().items.at(-1)?.status === 'saved')
    expect(pendingCount(getSync())).toBe(0)
    expect((await serverDoc('ledgerEntries/sale-1'))?.amount).toBe(1_400_00)
    await until(() => !getSync().pendingPaths.has('ledgerEntries/sale-1'))
  })

  it('SY-03 a double tap, or a retry from another start, keeps one sale with the original id', async () => {
    await phone('driver', 'driver')
    must(dispatch(driverSale('sale-1')))
    must(dispatch(driverSale('sale-1')))
    expect(getSync().items).toHaveLength(1)
    await until(() => getSync().items[0]?.status === 'saved')
    // The app restarts (a fresh phone copy) and the same form id is sent again.
    await closeDevices()
    await phone('driver', 'driver')
    must(dispatch(driverSale('sale-1')))
    expect(getSync().items).toHaveLength(0)
    expect(getState().ledger.filter((e) => e.id === 'sale-1')).toHaveLength(1)
  })

  it('SY-04 a sale refused after reconnecting shows "needs attention" with the reason; the balance leaves it out', async () => {
    const { db } = await phone('driver', 'driver')
    await disableNetwork(db)
    must(dispatch(driverSale('sale-2')))
    expect(balanceOf(getState(), 'c2')).toBe(1_400_00)
    // Meanwhile, on the owner's phone, the trip is closed.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`trips/${TRIP}`).update({
        status: 'CLOSED', closedBy: 'owner', closedOn: TODAY,
        closeKg: { loadedGrams: 1_000_000, soldGrams: 1_000_000, shopSoldGrams: 1_000_000, wastageGrams: 0 },
      })
    })
    await enableNetwork(db)
    await until(() => attentionItems(getSync())[0]?.error?.code === 'trip_closed')
    expect(attentionItems(getSync())[0]?.detail).toBe('Customer2 · 10 kg')
    await until(() => !getState().ledger.some((e) => e.id === 'sale-2'))
    expect(balanceOf(getState(), 'c2')).toBe(0)
    expect(await serverDoc('ledgerEntries/sale-2')).toBe(undefined)
  })

  it('SY-05 two phones offline sell the same kg: both sales are kept, the trip shows oversold, close is blocked', async () => {
    const { db } = await phone('manager', 'manager')
    const other = device('manager2')
    await disableNetwork(db)
    await disableNetwork(other.db)
    // 600 kg each from the 1,000 kg on the vehicle, at ₹140.
    must(dispatch(recordSale(TRIP, { id: 'sale-a', customerId: 'c1', date: TODAY, createdBy: 'manager', grams: 600_000 })))
    const b = must(makeSale({ id: 'sale-b', customerId: 'c2', date: TODAY, createdBy: 'manager2', grams: 600_000, ratePaisePerKg: 14_000, policy: 'ROUND_HALF_UP_RUPEE', tripId: TRIP }))
    const sentB = commitWrites(other.db, ledgerEntryWrites(b))
    await enableNetwork(db)
    await enableNetwork(other.db)
    await assertSucceeds(sentB)
    await until(() => getSync().items.at(-1)?.status === 'saved')
    await until(() => getState().ledger.some((e) => e.id === 'sale-b'))
    const trip = tripById(getState(), TRIP)
    if (!trip) throw new Error('trip missing')
    expect(tripSummaryOf(getState(), trip).remainingGrams).toBe(-200_000)
    const close = dispatch(finishTrip(TRIP, TODAY, true, pendingCount(getSync()) > 0))
    expect(!close.ok && close.error.code).toBe('oversold')
  })

  it('SY-06 closing a trip offline, or with entries still on the phone, is blocked with a plain reason', async () => {
    const { db } = await phone('manager', 'manager')
    const offline = dispatch(finishTrip(TRIP, TODAY, false))
    expect(!offline.ok && offline.error.code).toBe('not_online')
    await disableNetwork(db)
    must(dispatch(recordSale(TRIP, { id: 'sale-m', customerId: 'c2', date: TODAY, createdBy: 'manager', grams: 1_000_000 })))
    const waiting = dispatch(finishTrip(TRIP, TODAY, true, pendingCount(getSync()) > 0))
    expect(!waiting.ok && waiting.error.code).toBe('pending_writes')
  })
})

describe('the cloud store', () => {
  it('SY-07 month end from a window: November closes from the October snapshot without October entries loaded', async () => {
    await phone('owner', 'owner', { today: '2026-12-01' })
    expect(getState().ledgerWindow).toEqual({ from: '2026-11-01' })
    expect(getState().ledger.some((e) => e.id === 'oct-sale-1')).toBe(false)
    expect(balanceOf(getState(), 'c1')).toBe(11_178_00)
    expect(must(dispatch(closeMonthForAll('2026-11', '2026-12-01')))).toBe(2)
    await until(() => getSync().items.at(-1)?.status === 'saved')
    const snap = await serverDoc('ledgerEntries/snap_c1_2026-11')
    expect(snap?.closingBalance).toBe(11_178_00)
    expect(snap?.entryCount).toBe(6)
    expect((await serverDoc('ledgerClosures/c1'))?.closedThrough).toBe('2026-11')
  })

  it('SY-08 a loading saves its purchase rate apart; the driver sees the kg but not the rate', async () => {
    await phone('manager', 'manager')
    must(dispatch(addTripEvent(must(makeLoading({ id: 'load-2', tripId: TRIP, date: TODAY, createdBy: 'manager', grams: kg('200'), ratePaisePerKg: ratePerKg('118') })))))
    await until(() => getSync().items.at(-1)?.status === 'saved')
    expect((await serverDoc(`trips/${TRIP}/purchases/load-2`))?.amount).toBe(23_600_00)
    expect(await serverDoc(`trips/${TRIP}/events/load-2`)).not.toHaveProperty('ratePaisePerKg')
    await closeDevices()

    await phone('driver', 'driver')
    const trip = tripById(getState(), TRIP)
    if (!trip) throw new Error('trip missing')
    const summary = tripSummaryOf(getState(), trip)
    expect(summary.loadedGrams).toBe(1_200_000)
    expect(summary.purchasePaise).toBe(0)
  })

  it('SY-09 after a restart, a save that never reached the cloud is reported; one that did is cleared', async () => {
    const storage = new Map<string, string>()
    storage.set(
      'icc.sync.v1',
      JSON.stringify([
        { id: 'sync-1', kind: 'sale', detail: 'Customer2 · 5 kg', at: 0, status: 'pending', paths: ['ledgerEntries/lost-sale'] },
        { id: 'sync-2', kind: 'payment', detail: 'Customer1 · ₹1,000', at: 0, status: 'pending', paths: ['ledgerEntries/nov-pay'] },
      ]),
    )
    await phone('owner', 'owner', { storage })
    await until(() => getSync().items.every((i) => i.status !== 'pending'))
    expect(getSync().items.map((i) => [i.id, i.status])).toEqual([
      ['sync-1', 'attention'],
      ['sync-2', 'saved'],
    ])
    expect(JSON.parse(storage.get('icc.sync.v1') ?? '[]')).toHaveLength(1)
  })
})
