/**
 * Issued bills and the bill as printed (plan §6, D-07, P6).
 *
 * A bill is a statement until it is issued. Issuing gives it the next visible number for the financial year
 * (ICC/2026-27/0001) and freezes its content: lines and totals are kept as they were, so the same bill can be
 * shared again later even when its entries are no longer loaded on the phone. Numbers come from an online
 * counter (the cloud) or the demo's own counter; offline, a bill is shared as a statement without a number.
 *
 * billDocument() is the single description of what a bill shows. The screen preview and the PDF both draw it,
 * so they never disagree. (The WhatsApp text in whatsapp.ts follows the same order.)
 */
import { formatBillNumber, type Bill } from './bill'
import { BILL_LABELS } from './billLabels'
import { financialYearOf, formatIndianDate, isIsoDate, type IsoDate } from './dates'
import { formatKg, formatRatePerKg } from './format'
import { fail, ok, type Result } from './result'
import type { BusinessSettings, Language } from './settings'
import type { Paise } from './units'
import { isNonEmptyString } from './util'
import { billHeaderLines } from './whatsapp'

export interface IssuedBill {
  id: string
  /** Visible number, e.g. "ICC/2026-27/0001". */
  number: string
  /** Indian financial year of `issuedOn`, e.g. "2026-27". Numbers start again at 1 each year. */
  financialYear: string
  sequence: number
  customerId: string
  issuedOn: IsoDate
  issuedBy: string
  /** The bill exactly as issued. */
  bill: Bill
}

export function makeIssuedBill(input: {
  id: string
  bill: Bill
  sequence: number
  issuedOn: IsoDate
  issuedBy: string
}): Result<IssuedBill> {
  const { bill } = input
  if (!isNonEmptyString(input.id) || !isNonEmptyString(input.issuedBy)) return fail('invalid_input', 'A bill needs an id and who issued it')
  if (!isIsoDate(input.issuedOn)) return fail('invalid_input', `Invalid date "${input.issuedOn}"`)
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) return fail('invalid_input', 'Bill sequence must be 1 or more')
  if (bill.to > input.issuedOn) return fail('invalid_input', 'A bill cannot cover days after it is issued')
  if (bill.currentBalance !== bill.previousBalance + bill.itemsAmount - bill.paid + bill.otherNet) {
    return fail('amount_mismatch', 'Bill totals do not add up')
  }
  return ok({
    id: input.id,
    number: formatBillNumber(input.issuedOn, input.sequence),
    financialYear: financialYearOf(input.issuedOn),
    sequence: input.sequence,
    customerId: bill.customerId,
    issuedOn: input.issuedOn,
    issuedBy: input.issuedBy,
    bill,
  })
}

// ---------------------------------------------------------------------------
// What a bill shows
// ---------------------------------------------------------------------------

/** total: a section total · detail: one entry under it · due: the closing line. */
export interface BillRow {
  kind: 'total' | 'detail' | 'due'
  label: string
  amount: Paise
}

export interface BillDocument {
  language: Language
  /** Business name, location and the contact details the owner chose to print (U-04). */
  header: string[]
  /** "Bill ICC/2026-27/0001" once issued, otherwise "Statement". */
  title: string
  /** Shop name, and the person's name when known. */
  customer: string
  /** "Period: 01-11-2026 to 22-11-2026", or "Date: …" for one day. */
  period: string
  /** "Date: 22-11-2026" for an issued bill. */
  issued?: string
  rows: BillRow[]
  /** Legal text at the end, when GST is switched on (U-08). */
  footer?: string
}

export function billDocument(
  bill: Bill,
  ctx: {
    settings: BusinessSettings
    language: Language
    shopName: string
    customerName?: string
    issued?: Pick<IssuedBill, 'number' | 'issuedOn'>
  },
): BillDocument {
  const L = BILL_LABELS[ctx.language]
  const rows: BillRow[] = [{ kind: 'total', label: L.previousBalance, amount: bill.previousBalance }]
  for (const item of bill.items) {
    rows.push({
      kind: 'detail',
      label: `${formatIndianDate(item.date)}  ${formatKg(item.grams, L.kg)} × ${formatRatePerKg(item.ratePaisePerKg, L.kg)}`,
      amount: item.amount,
    })
  }
  rows.push({ kind: 'total', label: `${L.items}: ${formatKg(bill.itemsGrams, L.kg)}`, amount: bill.itemsAmount })
  for (const p of bill.payments) rows.push({ kind: 'detail', label: `${formatIndianDate(p.date)}  ${L.payment[p.method]}`, amount: p.amount })
  rows.push({ kind: 'total', label: L.paid, amount: bill.paid })
  for (const o of bill.other) rows.push({ kind: 'detail', label: `${L[o.kind]}${o.reason ? ` (${o.reason})` : ''}`, amount: o.signedAmount })
  rows.push({
    kind: 'due',
    label: bill.currentBalance >= 0 ? L.balanceDue : L.advance,
    amount: Math.abs(bill.currentBalance),
  })

  const doc: BillDocument = {
    language: ctx.language,
    header: billHeaderLines(ctx.settings, ctx.language),
    title: ctx.issued ? `${L.bill} ${ctx.issued.number}` : L.statement,
    customer: `${ctx.shopName}${ctx.customerName ? ` (${ctx.customerName})` : ''}`,
    period: bill.from === bill.to ? `${L.date}: ${formatIndianDate(bill.from)}` : L.period(formatIndianDate(bill.from), formatIndianDate(bill.to)),
    rows,
  }
  if (ctx.issued) doc.issued = `${L.date}: ${formatIndianDate(ctx.issued.issuedOn)}`
  if (ctx.settings.gst.enabled && ctx.settings.gst.legalText) doc.footer = ctx.settings.gst.legalText
  return doc
}

/**
 * Splits rows over pages: `first` rows fit under the header on page 1, `next` on each later page.
 * The closing "balance due" line never stands alone on a page.
 */
export function paginate<T>(rows: readonly T[], first: number, next: number): T[][] {
  if (first < 2 || next < 2) throw new RangeError('A page must hold at least two rows')
  const pages: T[][] = []
  let start = 0
  let capacity = first
  while (start < rows.length) {
    let end = Math.min(rows.length, start + capacity)
    if (end === rows.length - 1 && rows.length - start > 1) end -= 1 // keep the last row with the one before it
    pages.push(rows.slice(start, end))
    start = end
    capacity = next
  }
  return pages.length ? pages : [[]]
}

/** A file name a phone can show: "Bill-ICC-2026-27-0001-Customer1.pdf" or "Statement-Customer1-2026-11-22.pdf". */
export function billFileName(doc: Pick<BillDocument, 'customer'>, issued: Pick<IssuedBill, 'number'> | undefined, date: IsoDate): string {
  const clean = (s: string) => s.normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const who = clean(doc.customer.split(' (')[0] ?? '') || 'customer'
  return issued ? `Bill-${clean(issued.number)}-${who}.pdf` : `Statement-${who}-${date}.pdf`
}
