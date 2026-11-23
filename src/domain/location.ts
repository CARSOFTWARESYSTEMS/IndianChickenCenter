/**
 * The shop's map pin (U-02: "shop pin" answered; DV-07). The owner sets it from the phone's location, or types or
 * pastes it when location is blocked: "12.9963, 75.3086" or a Google Maps link. Coordinates are not money, so
 * ordinary numbers are fine here; they are kept to 6 decimal places (about 10 cm).
 */
import { fail, ok, type Result } from './result'

export interface MapPin {
  latitude: number
  longitude: number
}

/** Why a typed pin could not be read: the screen shows its own words for each. */
export type PinProblem = 'empty' | 'not_a_pin' | 'out_of_range' | 'short_link'

const NUMBER = String.raw`[-+]?\d{1,3}(?:\.\d+)?`
const PLAIN = new RegExp(String.raw`^(${NUMBER})\s*[,;\s]\s*(${NUMBER})$`)
/** Place links carry the pin itself as !3d<lat>!4d<lng>; "@lat,lng" is only where the map was looking. */
const PLACE = new RegExp(String.raw`!3d(${NUMBER})!4d(${NUMBER})`)
const QUERY = new RegExp(String.raw`[?&](?:q|query|ll|destination|center)=(?:loc:)?(${NUMBER}),\s*(${NUMBER})`)
const AT = new RegExp(String.raw`@(${NUMBER}),(${NUMBER})`)
const SHORT_LINK = /^(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i

const problem = (reason: PinProblem, message: string): Result<never> => fail('invalid_input', message, { reason })

export function pinProblemOf(error: { details?: Record<string, unknown> }): PinProblem {
  const reason = error.details?.reason
  return reason === 'empty' || reason === 'out_of_range' || reason === 'short_link' ? reason : 'not_a_pin'
}

const round6 = (x: number) => Math.round(x * 1_000_000) / 1_000_000

/** Checks a latitude and longitude and keeps them to 6 decimal places. */
export function makePin(latitude: number, longitude: number): Result<MapPin> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return problem('not_a_pin', 'Latitude and longitude must be numbers')
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return problem('out_of_range', 'Latitude must be between -90 and 90, longitude between -180 and 180')
  }
  return ok({ latitude: round6(latitude), longitude: round6(longitude) })
}

/** Reads "lat, lng", "lat lng", or a full Google Maps link. Short links (maps.app.goo.gl) cannot be read offline. */
export function parseMapPin(input: string): Result<MapPin> {
  const text = input.trim()
  if (!text) return problem('empty', 'Type a pin or paste a Google Maps link')
  if (SHORT_LINK.test(text)) return problem('short_link', 'Short links cannot be read: open the link and copy the numbers shown')
  let decoded = text
  try {
    decoded = decodeURIComponent(text)
  } catch {
    // Not URL-encoded: read it as typed.
  }
  for (const pattern of [PLAIN, PLACE, QUERY, AT]) {
    const m = pattern.exec(decoded)
    if (m) return makePin(Number(m[1]), Number(m[2]))
  }
  return problem('not_a_pin', 'Type latitude, longitude (for example 12.9963, 75.3086) or paste a Google Maps link')
}

/** "12.996300, 75.308600" as shown on the screen. */
export function formatPin(pin: MapPin): string {
  return `${pin.latitude.toFixed(6)}, ${pin.longitude.toFixed(6)}`
}

/** Opens the pin in Google Maps (the app on phones that have it, the website elsewhere). */
export function mapsLink(pin: MapPin): string {
  return `https://www.google.com/maps/search/?api=1&query=${pin.latitude.toFixed(6)}%2C${pin.longitude.toFixed(6)}`
}
