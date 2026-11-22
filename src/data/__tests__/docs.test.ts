/** DOC-*: how engine records become Firestore documents. Expected documents are written out by hand. */
import { describe, expect, it } from 'vitest'
import type { LoadingEvent, MonthEndSnapshot, Trip } from '../../domain'
import {
  claimInviteWrites,
  closeTripWrites,
  inviteWrites,
  ledgerEntryWrites,
  openTripWrites,
  settingsWrites,
  tripEventWrites,
  withoutUndefined,
} from '../docs'
import { DEFAULT_SETTINGS } from '../../domain'

const openTrip: Trip = {
  id: 'trip_2026-11-22_KA21AB1234',
  date: '2026-11-22',
  status: 'OPEN',
  createdBy: 'u-owner',
  vehicleNumber: 'KA21AB1234',
  driverId: 'u-driver',
  driverName: 'Ramesh',
  defaultSaleRatePaisePerKg: 14_000,
}

describe('stored documents', () => {
  it('DOC-01 a loading keeps kg on the trip event and the purchase rate in its own document', () => {
    const loading: LoadingEvent = {
      id: 'load-1',
      tripId: openTrip.id,
      date: '2026-11-22',
      createdBy: 'u-manager',
      type: 'LOADING',
      grams: 1_000_000,
      ratePaisePerKg: 12_000,
      exactMilliPaise: 12_000_000_000,
      amount: 12_000_000,
    }
    expect(tripEventWrites(loading)).toEqual([
      {
        op: 'set',
        path: 'trips/trip_2026-11-22_KA21AB1234/events/load-1',
        data: { id: 'load-1', tripId: openTrip.id, date: '2026-11-22', createdBy: 'u-manager', type: 'LOADING', grams: 1_000_000 },
      },
      {
        op: 'set',
        path: 'trips/trip_2026-11-22_KA21AB1234/purchases/load-1',
        data: {
          id: 'load-1',
          tripId: openTrip.id,
          createdBy: 'u-manager',
          grams: 1_000_000,
          ratePaisePerKg: 12_000,
          exactMilliPaise: 12_000_000_000,
          amount: 12_000_000,
        },
      },
    ])
  })

  it('DOC-02 a rate change also moves the trip’s current rate', () => {
    const writes = tripEventWrites({
      id: 'rate-1',
      tripId: openTrip.id,
      date: '2026-11-22',
      createdBy: 'u-manager',
      type: 'DEFAULT_RATE',
      ratePaisePerKg: 14_500,
    })
    expect(writes[1]).toEqual({
      op: 'update',
      path: 'trips/trip_2026-11-22_KA21AB1234',
      data: { ratePaisePerKg: 14_500, rateEventId: 'rate-1' },
    })
  })

  it('DOC-03 a stored trip is named by date and vehicle and starts at its default rate', () => {
    const writes = openTripWrites(openTrip)
    expect(writes.ok && writes.value[0]).toEqual({
      op: 'set',
      path: 'trips/trip_2026-11-22_KA21AB1234',
      data: {
        id: 'trip_2026-11-22_KA21AB1234',
        date: '2026-11-22',
        status: 'OPEN',
        createdBy: 'u-owner',
        vehicleNumber: 'KA21AB1234',
        driverId: 'u-driver',
        driverName: 'Ramesh',
        defaultSaleRatePaisePerKg: 14_000,
        ratePaisePerKg: 14_000,
      },
    })
    const random = openTripWrites({ ...openTrip, id: 'trip-x7' })
    expect(random.ok).toBe(false)
    const noRate = openTripWrites({ ...openTrip, defaultSaleRatePaisePerKg: undefined })
    expect(!noRate.ok && noRate.error.code).toBe('invalid_rate')
  })

  it('DOC-04 closing keeps kg on the trip and the money totals in totals/close', () => {
    const closed: Trip = {
      ...openTrip,
      status: 'CLOSED',
      closedBy: 'u-manager',
      closedOn: '2026-11-22',
      closeSummary: {
        loadedGrams: 5_000_000,
        soldGrams: 4_870_000,
        shopSoldGrams: 0,
        wastageGrams: 130_000,
        purchasePaise: 60_000_000,
        salesPaise: 68_180_000,
        operatingPaise: 1_400_000,
      },
    }
    const writes = closeTripWrites(closed)
    expect(writes.ok && writes.value).toEqual([
      {
        op: 'update',
        path: 'trips/trip_2026-11-22_KA21AB1234',
        data: {
          status: 'CLOSED',
          closedBy: 'u-manager',
          closedOn: '2026-11-22',
          closeKg: { loadedGrams: 5_000_000, soldGrams: 4_870_000, shopSoldGrams: 0, wastageGrams: 130_000 },
        },
      },
      {
        op: 'set',
        path: 'trips/trip_2026-11-22_KA21AB1234/totals/close',
        data: {
          tripId: 'trip_2026-11-22_KA21AB1234',
          purchasePaise: 60_000_000,
          salesPaise: 68_180_000,
          operatingPaise: 1_400_000,
          closedBy: 'u-manager',
        },
      },
    ])
  })

  it('DOC-05 a month-end snapshot moves the customer’s closed month with it', () => {
    const snapshot: MonthEndSnapshot = {
      id: 'snap_c1_2026-10',
      customerId: 'c1',
      date: '2026-11-01',
      createdBy: 'u-owner',
      type: 'MONTH_END_SNAPSHOT',
      month: '2026-10',
      closingBalance: 1_077_800,
      entryCount: 4,
    }
    expect(ledgerEntryWrites(snapshot)[1]).toEqual({
      op: 'set',
      path: 'ledgerClosures/c1',
      data: { customerId: 'c1', closedThrough: '2026-10', closedBy: 'u-owner' },
    })
  })

  it('DOC-06 no stored document carries an undefined field', () => {
    expect(withoutUndefined({ a: 1, b: undefined, c: { d: undefined, e: [1, { f: undefined }] } })).toEqual({
      a: 1,
      c: { e: [1, {}] },
    })
    const [write] = settingsWrites({ ...DEFAULT_SETTINGS, gst: { enabled: false, gstin: undefined } }, 'u-owner')
    expect(write?.op === 'set' && write.data.gst).toEqual({ enabled: false })
  })

  it('DOC-07 an invite is keyed by the lower-case email and claimed by the matching Google account', () => {
    const invite = inviteWrites({ email: ' Ramesh.K@Gmail.com ', name: 'Ramesh', role: 'driver' }, 'u-owner', '2026-11-22')
    expect(invite.ok && invite.value).toEqual([
      {
        op: 'set',
        path: 'invites/ramesh.k@gmail.com',
        data: { email: 'ramesh.k@gmail.com', name: 'Ramesh', role: 'driver', invitedBy: 'u-owner', invitedOn: '2026-11-22' },
      },
    ])
    expect(
      claimInviteWrites(
        'uid-ramesh',
        { email: 'ramesh.k@gmail.com', name: 'Ramesh', role: 'driver', invitedBy: 'u-owner', invitedOn: '2026-11-22' },
        '2026-11-23',
      ),
    ).toEqual([
      {
        op: 'set',
        path: 'users/uid-ramesh',
        data: { name: 'Ramesh', email: 'ramesh.k@gmail.com', role: 'driver', addedBy: 'u-owner', addedOn: '2026-11-23' },
      },
      { op: 'delete', path: 'invites/ramesh.k@gmail.com' },
    ])
    expect(inviteWrites({ email: 'not-an-email', name: 'X', role: 'driver' }, 'u-owner', '2026-11-22').ok).toBe(false)
  })
})
