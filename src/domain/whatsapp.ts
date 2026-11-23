/**
 * Bill text for WhatsApp, in English or Kannada.
 * A wa.me link opens the customer's chat with this text ready; it cannot attach the PDF,
 * which goes through the phone's share sheet (P6).
 */
import type { Bill } from './bill'
import { BILL_LABELS } from './billLabels'
import { formatIndianDate } from './dates'
import { formatKg, formatRatePerKg, formatRupees } from './format'
import { formatIndianMobile, normalizeIndianMobile } from './phone'
import { ok, type Result } from './result'
import type { BusinessSettings, Language } from './settings'

export function whatsAppLink(phone: string, text: string): Result<string> {
  const number = normalizeIndianMobile(phone)
  if (!number.ok) return number
  return ok(`https://wa.me/${number.value}?text=${encodeURIComponent(text)}`)
}

function printablePhone(raw: string): string {
  const n = normalizeIndianMobile(raw)
  return n.ok ? formatIndianMobile(n.value) : raw
}

/** Business header for bills, from Settings: only the details the owner chose to print (U-04). */
export function billHeaderLines(settings: BusinessSettings, language: Language): string[] {
  const L = BILL_LABELS[language]
  const { contact, print } = settings
  const lines = [language === 'kn' && settings.businessNameKn ? settings.businessNameKn : settings.businessName]
  lines.push(settings.shopLocation.label)
  if (print.ownerName) lines.push(contact.ownerName)
  if (print.phones && contact.phones.length > 0) lines.push(`${L.phone}: ${contact.phones.map(printablePhone).join(', ')}`)
  if (print.whatsapp && contact.whatsapp) lines.push(`${L.whatsapp}: ${printablePhone(contact.whatsapp)}`)
  if (print.email && contact.email) lines.push(`${L.email}: ${contact.email}`)
  if (print.address && contact.address) lines.push(contact.address)
  if (settings.gst.enabled && settings.gst.gstin) lines.push(`GSTIN: ${settings.gst.gstin}`)
  return lines
}

export interface BillTextContext {
  settings: BusinessSettings
  /** Defaults to the bill language in Settings. */
  language?: Language
  shopName: string
  customerName?: string
  /** Visible number, assigned online (D-07). Without one the text is titled "Statement". */
  billNumber?: string
}

export function billText(bill: Bill, ctx: BillTextContext): string {
  const language = ctx.language ?? ctx.settings.languages.bill
  const L = BILL_LABELS[language]
  const lines = billHeaderLines(ctx.settings, language)
  lines.push('')
  lines.push(`${ctx.billNumber ? `${L.bill} ${ctx.billNumber}` : L.statement}: ${ctx.shopName}${ctx.customerName ? ` (${ctx.customerName})` : ''}`)
  lines.push(
    bill.from === bill.to
      ? `${L.date}: ${formatIndianDate(bill.from)}`
      : L.period(formatIndianDate(bill.from), formatIndianDate(bill.to)),
  )
  lines.push(`${L.previousBalance}: ${formatRupees(bill.previousBalance)}`)
  for (const item of bill.items) {
    lines.push(
      `${formatIndianDate(item.date)}  ${formatKg(item.grams, L.kg)} × ${formatRatePerKg(item.ratePaisePerKg, L.kg)} = ${formatRupees(item.amount)}`,
    )
  }
  lines.push(`${L.items}: ${formatKg(bill.itemsGrams, L.kg)}, ${formatRupees(bill.itemsAmount)}`)
  for (const p of bill.payments) {
    lines.push(`${formatIndianDate(p.date)}  ${L.payment[p.method]}: ${formatRupees(p.amount)}`)
  }
  lines.push(`${L.paid}: ${formatRupees(bill.paid)}`)
  for (const o of bill.other) {
    lines.push(`${L[o.kind]}${o.reason ? ` (${o.reason})` : ''}: ${formatRupees(o.signedAmount)}`)
  }
  lines.push(
    bill.currentBalance >= 0
      ? `${L.balanceDue}: ${formatRupees(bill.currentBalance)}`
      : `${L.advance}: ${formatRupees(-bill.currentBalance)}`,
  )
  if (ctx.settings.gst.enabled && ctx.settings.gst.legalText) lines.push('', ctx.settings.gst.legalText)
  return lines.join('\n')
}
