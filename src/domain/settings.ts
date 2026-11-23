/**
 * Business settings (owner only). Gate A answers, 22 Nov 2026:
 *  U-01 round to the rupee · U-03/U-04 business and contact details editable, printed on bills by choice ·
 *  U-08 GST can be switched on with a GSTIN · U-09 English and Kannada for screens and bills.
 */
import { normalizeIndianMobile } from './phone'
import { fail, ok, type Result } from './result'
import { isRoundingPolicy, type RoundingPolicyId } from './rounding'
import { isSafePositiveInt, type PaisePerKg, type PaisePerLitre } from './units'
import { isNonEmptyString } from './util'

export const LANGUAGES = ['en', 'kn'] as const
export type Language = (typeof LANGUAGES)[number]

export interface ContactDetails {
  ownerName: string
  /** Stored normalised as 91XXXXXXXXXX. */
  phones: string[]
  whatsapp?: string
  email?: string
  address?: string
}

/** Which contact details print on bills and the WhatsApp text. */
export interface PrintOptions {
  ownerName: boolean
  phones: boolean
  whatsapp: boolean
  email: boolean
  address: boolean
}

/**
 * GST switch. Only identification prints for now (GSTIN + optional legal text).
 * Tax amounts are not calculated until the rate and inclusive/exclusive rule are confirmed (see open questions).
 */
export interface GstSettings {
  enabled: boolean
  gstin?: string
  legalText?: string
}

export interface ShopLocation {
  label: string
  latitude?: number
  longitude?: number
}

export interface BusinessSettings {
  businessName: string
  /** Optional Kannada spelling used on Kannada bills. */
  businessNameKn?: string
  shopLocation: ShopLocation
  contact: ContactDetails
  print: PrintOptions
  gst: GstSettings
  /** Live rounding for customer sale lines. */
  roundingPolicy: RoundingPolicyId | null
  /** Suggested selling rate for new trips; each trip keeps its own default rate. */
  defaultSaleRatePaisePerKg?: PaisePerKg
  /** Last diesel price, to prefill the next fill (E-03). */
  dieselPricePaisePerLitre?: PaisePerLitre
  languages: { screen: Language; bill: Language }
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: 'Indian Chicken Center',
  shopLocation: { label: 'Ujire · Belthangady' },
  contact: { ownerName: 'Umarabba', phones: [] },
  print: { ownerName: true, phones: true, whatsapp: true, email: false, address: true },
  gst: { enabled: false },
  roundingPolicy: 'ROUND_HALF_UP_RUPEE',
  languages: { screen: 'en', bill: 'en' },
}

/** 15-character GSTIN: state code, PAN, entity number, "Z", check character. */
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidGstin(value: string): boolean {
  return GSTIN.test(value.trim().toUpperCase())
}

/** Checks and normalises settings before the owner saves them. */
export function validateSettings(input: BusinessSettings): Result<BusinessSettings> {
  if (!isNonEmptyString(input.businessName)) return fail('invalid_input', 'Business name is required')
  if (!isNonEmptyString(input.contact.ownerName)) return fail('invalid_input', 'Owner name is required')
  if (!isNonEmptyString(input.shopLocation.label)) return fail('invalid_input', 'Shop location is required')

  const { latitude, longitude } = input.shopLocation
  if ((latitude === undefined) !== (longitude === undefined)) return fail('invalid_input', 'Map pin needs both latitude and longitude')
  if (latitude !== undefined && (latitude < -90 || latitude > 90)) return fail('invalid_input', 'Latitude out of range')
  if (longitude !== undefined && (longitude < -180 || longitude > 180)) return fail('invalid_input', 'Longitude out of range')

  const phones: string[] = []
  for (const p of input.contact.phones) {
    const n = normalizeIndianMobile(p)
    if (!n.ok) return n
    phones.push(n.value)
  }
  const contact: ContactDetails = { ...input.contact, phones }
  if (input.contact.whatsapp !== undefined) {
    const w = normalizeIndianMobile(input.contact.whatsapp)
    if (!w.ok) return w
    contact.whatsapp = w.value
  }
  if (input.contact.email !== undefined && !EMAIL.test(input.contact.email)) {
    return fail('invalid_input', `"${input.contact.email}" is not an email address`)
  }

  const gst: GstSettings = { ...input.gst }
  if (gst.gstin !== undefined) gst.gstin = gst.gstin.trim().toUpperCase()
  if (gst.enabled && (gst.gstin === undefined || !isValidGstin(gst.gstin))) {
    return fail('invalid_input', 'Turning GST on needs a valid 15-character GSTIN')
  }

  if (input.roundingPolicy !== null && !isRoundingPolicy(input.roundingPolicy)) {
    return fail('unknown_policy', 'Unknown rounding policy')
  }
  if (input.defaultSaleRatePaisePerKg !== undefined && !isSafePositiveInt(input.defaultSaleRatePaisePerKg)) {
    return fail('invalid_rate', 'Default rate must be more than ₹0/kg')
  }
  if (!LANGUAGES.includes(input.languages.screen) || !LANGUAGES.includes(input.languages.bill)) {
    return fail('invalid_input', 'Language must be English or Kannada')
  }
  return ok({ ...input, contact, gst })
}
