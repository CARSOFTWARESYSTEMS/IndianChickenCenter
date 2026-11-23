/**
 * Customer record (C-TXT L62: [Shop name][Name][contact number]).
 * Customer details are not money, so they can be edited. A shared phone number is warned about, never merged.
 */
import { isIsoDate, type IsoDate } from './dates'
import { normalizeIndianMobile } from './phone'
import { fail, ok, type Result } from './result'
import { isNonEmptyString } from './util'

export interface Customer {
  id: string
  shopName: string
  name?: string
  /** Normalised "91XXXXXXXXXX"; needed to send bills on WhatsApp. */
  phone?: string
  createdAt: IsoDate
  createdBy: string
}

export interface CustomerInput {
  id: string
  shopName: string
  name?: string
  phone?: string
  createdAt: IsoDate
  createdBy: string
}

export interface CustomerResult {
  customer: Customer
  /** Another customer with the same phone number (kept; the screen shows a warning). */
  duplicatePhoneOf?: Customer
}

function build(others: readonly Customer[], input: CustomerInput): Result<CustomerResult> {
  if (!isNonEmptyString(input.id) || !isNonEmptyString(input.createdBy)) return fail('invalid_input', 'Customer needs an id and an author')
  if (!isIsoDate(input.createdAt)) return fail('invalid_input', `Invalid date "${input.createdAt}"`)
  const shopName = input.shopName.trim()
  if (!shopName) return fail('invalid_input', 'Shop name is required')
  const customer: Customer = { id: input.id, shopName, createdAt: input.createdAt, createdBy: input.createdBy }
  const name = input.name?.trim()
  if (name) customer.name = name
  if (input.phone?.trim()) {
    const phone = normalizeIndianMobile(input.phone)
    if (!phone.ok) return phone
    customer.phone = phone.value
  }
  const duplicate = customer.phone ? others.find((c) => c.phone === customer.phone) : undefined
  return ok(duplicate ? { customer, duplicatePhoneOf: duplicate } : { customer })
}

export function makeCustomer(existing: readonly Customer[], input: CustomerInput): Result<CustomerResult> {
  if (existing.some((c) => c.id === input.id)) return fail('id_conflict', `Customer id ${input.id} already exists`)
  return build(existing, input)
}

/** Edits shop name, name or phone; id, created date and author stay as they were. */
export function updateCustomer(
  existing: readonly Customer[],
  id: string,
  patch: { shopName: string; name?: string; phone?: string },
): Result<CustomerResult> {
  const current = existing.find((c) => c.id === id)
  if (!current) return fail('invalid_input', 'Customer not found')
  const input: CustomerInput = { id, shopName: patch.shopName, createdAt: current.createdAt, createdBy: current.createdBy }
  if (patch.name !== undefined) input.name = patch.name
  if (patch.phone !== undefined) input.phone = patch.phone
  return build(
    existing.filter((c) => c.id !== id),
    input,
  )
}
