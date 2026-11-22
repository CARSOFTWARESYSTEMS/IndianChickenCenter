import { fail, ok, type Result } from './result'

/** Integer grams. 63.1 kg = 63_100. */
export type Grams = number
/** Integer paise. ₹8,076.80 = 807_680. */
export type Paise = number
/** Integer paise per kg. ₹128/kg = 12_800. */
export type PaisePerKg = number
/** Integer millilitres. 87.5 L = 87_500. */
export type Millilitres = number
/** Integer paise per litre. ₹91/L = 9_100. */
export type PaisePerLitre = number
/**
 * An exact line value before rounding, in thousandths of a paisa.
 * grams × paise/kg and millilitres × paise/litre both land in this unit,
 * so no precision is lost: 63_100 g × 12_800 = 807_680_000 = ₹8,076.80 exactly.
 */
export type MilliPaise = number

export const MILLI_PER_PAISA = 1_000

export function isSafeNonNegativeInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
}

export function isSafePositiveInt(n: unknown): n is number {
  return isSafeNonNegativeInt(n) && n > 0
}

/** floor(a / b) for a non-negative safe integer a and positive integer b, with no float rounding. */
export function divFloor(a: number, b: number): number {
  return (a - (a % b)) / b
}

/** a × b, or null when the product is not a safe integer. */
export function multiplyExact(a: number, b: number): number | null {
  const product = a * b
  return Number.isSafeInteger(product) ? product : null
}

const DECIMAL = /^(\d+)(?:\.(\d+))?$/

/**
 * Parses a plain decimal ("63.1", "6,81,800", "0.5") into an integer scaled by 10^decimals.
 * Numbers are accepted for convenience and read through their shortest decimal form.
 */
function parseScaled(input: string | number, decimals: number, what: string): Result<number> {
  let text: string
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return fail('invalid_input', `${what} must be a number`)
    text = String(input)
  } else {
    text = input
  }
  text = text.trim().replace(/,/g, '')
  const match = DECIMAL.exec(text)
  if (!match) return fail('invalid_input', `${what} must be a plain positive number, got "${String(input)}"`)
  const whole = match[1] ?? ''
  const fraction = match[2] ?? ''
  if (fraction.length > decimals) {
    return fail('invalid_input', `${what} allows at most ${decimals} decimal places, got "${String(input)}"`)
  }
  const scaled = Number(whole + fraction.padEnd(decimals, '0'))
  if (!Number.isSafeInteger(scaled)) return fail('invalid_input', `${what} is too large`)
  return ok(scaled)
}

export const parseKg = (input: string | number): Result<Grams> => parseScaled(input, 3, 'Weight (kg)')
export const parseRupees = (input: string | number): Result<Paise> => parseScaled(input, 2, 'Amount (₹)')
export const parseRatePerKg = (input: string | number): Result<PaisePerKg> =>
  parseScaled(input, 2, 'Rate (₹/kg)')
export const parseLitres = (input: string | number): Result<Millilitres> => parseScaled(input, 3, 'Litres')
export const parsePricePerLitre = (input: string | number): Result<PaisePerLitre> =>
  parseScaled(input, 2, 'Price (₹/L)')

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new RangeError(result.error.message)
  return result.value
}

/** Throwing shorthands for fixed inputs (tests, seed data). Screens use the parse* functions. */
export const kg = (input: string | number): Grams => unwrap(parseKg(input))
export const rupees = (input: string | number): Paise => unwrap(parseRupees(input))
export const ratePerKg = (input: string | number): PaisePerKg => unwrap(parseRatePerKg(input))
export const litres = (input: string | number): Millilitres => unwrap(parseLitres(input))
export const pricePerLitre = (input: string | number): PaisePerLitre => unwrap(parsePricePerLitre(input))
