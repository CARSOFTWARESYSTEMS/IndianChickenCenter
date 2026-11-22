/**
 * WhatsApp text fallback (plan "WhatsApp bill"): opens the customer's chat with a ready summary.
 * A wa.me link cannot attach the PDF; the PDF goes through the share sheet (P6).
 */
import type { Bill } from './bill'
import { formatIndianDate } from './dates'
import { formatKg, formatRatePerKg, formatRupees } from './format'
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

export function whatsAppLink(phone: string, text: string): Result<string> {
  const number = normalizeIndianMobile(phone)
  if (!number.ok) return number
  return ok(`https://wa.me/${number.value}?text=${encodeURIComponent(text)}`)
}

export interface BillTextContext {
  businessName: string
  location?: string
  shopName: string
  customerName?: string
  billNumber?: string
}

export function billText(bill: Bill, ctx: BillTextContext): string {
  const lines: string[] = [ctx.businessName]
  if (ctx.location) lines.push(ctx.location)
  lines.push('')
  lines.push(`${ctx.billNumber ? `Bill ${ctx.billNumber}` : 'Statement'}: ${ctx.shopName}${ctx.customerName ? ` (${ctx.customerName})` : ''}`)
  lines.push(
    bill.from === bill.to
      ? `Date: ${formatIndianDate(bill.from)}`
      : `Period: ${formatIndianDate(bill.from)} to ${formatIndianDate(bill.to)}`,
  )
  lines.push(`Previous balance: ${formatRupees(bill.previousBalance)}`)
  for (const item of bill.items) {
    lines.push(
      `${formatIndianDate(item.date)}  ${formatKg(item.grams)} × ${formatRatePerKg(item.ratePaisePerKg)} = ${formatRupees(item.amount)}`,
    )
  }
  lines.push(`Items: ${formatKg(bill.itemsGrams)}, ${formatRupees(bill.itemsAmount)}`)
  lines.push(`Paid: ${formatRupees(bill.paid)}`)
  for (const o of bill.other) lines.push(`${o.label}: ${formatRupees(o.signedAmount)}`)
  lines.push(
    bill.currentBalance >= 0
      ? `Balance due: ${formatRupees(bill.currentBalance)}`
      : `Advance: ${formatRupees(-bill.currentBalance)}`,
  )
  return lines.join('\n')
}
