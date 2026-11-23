/**
 * What the phone itself provides (P8 device checks).
 *  - Storage (DV-06): entries are saved on the phone before the cloud has them, so the app asks the browser to keep
 *    its data (navigator.storage.persist). Chrome decides on its own, without a question; iPhones keep the data of an
 *    app added to the Home Screen. The Settings page shows the answer.
 *  - Location (DV-07): the shop's map pin from the phone's position, with a typed pin when location is blocked.
 */
import { makePin, type MapPin } from '../domain'

export interface StorageInfo {
  /** undefined: this browser cannot say. */
  kept: boolean | undefined
  usedBytes?: number
}

type StorageManagerLike = Pick<StorageManager, 'persist' | 'persisted' | 'estimate'>

const storageOf = (): Partial<StorageManagerLike> | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator.storage as Partial<StorageManagerLike> | undefined)

export async function storageInfo(): Promise<StorageInfo> {
  const s = storageOf()
  const kept = s?.persisted ? await s.persisted().catch(() => undefined) : undefined
  const estimate = s?.estimate ? await s.estimate().catch(() => undefined) : undefined
  return estimate?.usage !== undefined ? { kept, usedBytes: estimate.usage } : { kept }
}

/** Asks once to keep this phone's data; returns whether it is kept now. */
export async function keepStorage(): Promise<boolean | undefined> {
  const s = storageOf()
  if (!s?.persist || !s.persisted) return undefined
  try {
    if (await s.persisted()) return true
    return await s.persist()
  } catch {
    return undefined
  }
}

export type LocationProblem = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

export type LocationResult = { ok: true; pin: MapPin; accuracyMetres: number } | { ok: false; problem: LocationProblem }

/** The phone's position, once. Location needs a secure page (https or localhost); elsewhere it counts as blocked. */
export function currentLocation(geo: Geolocation | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation): Promise<LocationResult> {
  if (!geo) return Promise.resolve({ ok: false, problem: 'unsupported' })
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (position) => {
        const pin = makePin(position.coords.latitude, position.coords.longitude)
        resolve(pin.ok ? { ok: true, pin: pin.value, accuracyMetres: Math.round(position.coords.accuracy) } : { ok: false, problem: 'unavailable' })
      },
      (error) => resolve({ ok: false, problem: error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    )
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${bytes > 0 ? Math.max(1, Math.round(bytes / 1024)) : 0} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
