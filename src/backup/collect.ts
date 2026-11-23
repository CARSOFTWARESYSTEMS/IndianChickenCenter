/**
 * Reads every record for a backup, from the cloud (not this phone's copy), with the owner's sign-in.
 * Unlike the screens, which read a recent window (P5), a backup takes the whole history: one full read per backup.
 */
import { collection, collectionGroup, getDocsFromServer, type Firestore } from 'firebase/firestore'
import { fail, ok, type Result } from '../domain'
import type { BackupData } from './backup'

const COLLECTIONS = ['settings', 'users', 'invites', 'vehicles', 'customers', 'trips', 'ledgerEntries', 'ledgerClosures', 'bills', 'billCounters']
/** Kept under each trip: read across all trips at once. */
const PER_TRIP = ['events', 'purchases', 'totals']

export async function readEverything(db: Firestore): Promise<Result<BackupData>> {
  try {
    const snaps = await Promise.all([
      ...COLLECTIONS.map((name) => getDocsFromServer(collection(db, name))),
      ...PER_TRIP.map((name) => getDocsFromServer(collectionGroup(db, name))),
    ])
    const data: BackupData = {}
    for (const snap of snaps) for (const d of snap.docs) data[d.ref.path] = d.data()
    return ok(data)
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : ''
    if (code === 'unavailable') return fail('not_online', 'Connect to the internet to read the records for a backup')
    if (code === 'permission-denied') return fail('not_permitted', 'Only the owner can make a backup')
    return fail('not_saved', code || 'Could not read the records')
  }
}
