import { fail, ok, type Result } from './result'

/** Accepts 10-digit Indian mobiles, with or without +91 / 0 and spaces; returns "91XXXXXXXXXX". */
export function normalizeIndianMobile(input: string): Result<string> {
  const digits = input.replace(/\D/g, '')
  let national: string
  if (digits.length === 10) national = digits
  else if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1)
  else if (digits.length === 12 && digits.startsWith('91')) national = digits.slice(2)
  else return fail('invalid_phone', `"${input}" is not a 10-digit Indian mobile number`)
  if (!/^[6-9]/.test(national)) return fail('invalid_phone', `"${input}" is not an Indian mobile number`)
  return ok(`91${national}`)
}

/** "919876543210" → "+91 98765 43210" for printing. */
export function formatIndianMobile(normalized: string): string {
  const national = normalized.slice(-10)
  return `+91 ${national.slice(0, 5)} ${national.slice(5)}`
}
