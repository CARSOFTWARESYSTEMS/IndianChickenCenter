import { divFloor, type Grams, type Millilitres, type Paise, type PaisePerKg } from './units'

const rupeeWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

function assertInt(n: number, what: string): void {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${what} must be an integer, got ${n}`)
}

/**
 * ₹ with Indian grouping. Whole rupees show no decimals; any paise show two.
 * 1_000_00 → "₹1,000" · 8_076_80 → "₹8,076.80" · -5_00 → "-₹5"
 */
export function formatRupees(paise: Paise): string {
  assertInt(paise, 'formatRupees input')
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  const whole = rupeeWhole.format(divFloor(abs, 100))
  const p = abs % 100
  return sign + (p === 0 ? whole : `${whole}.${String(p).padStart(2, '0')}`)
}

function formatScaled(value: number, unit: string): string {
  assertInt(value, `${unit} value`)
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const fraction = String(abs % 1_000).padStart(3, '0').replace(/0+$/, '')
  return `${sign}${grouped.format(divFloor(abs, 1_000))}${fraction ? `.${fraction}` : ''} ${unit}`
}

/** 63_100 → "63.1 kg" · 5_000_000 → "5,000 kg". Pass "ಕೆಜಿ" for Kannada. */
export function formatKg(grams: Grams, unit = 'kg'): string {
  return formatScaled(grams, unit)
}

/** 87_500 → "87.5 L" */
export function formatLitres(millilitres: Millilitres): string {
  return formatScaled(millilitres, 'L')
}

/** 12_800 → "₹128/kg" */
export function formatRatePerKg(rate: PaisePerKg, unit = 'kg'): string {
  return `${formatRupees(rate)}/${unit}`
}
