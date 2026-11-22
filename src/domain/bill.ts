/**
 * Customer bill (C-TXT L71–72): previous balance, items bought, paid, balance due.
 * Built only from ledger entries, so a bill can never disagree with the passbook.
 */
import { financialYearOf, isIsoDate, type IsoDate } from './dates'
import { isFinancial, signedAmount, type LedgerEntry, type PaymentMethod } from './ledger'
import { fail, ok, type Result } from './result'
import type { Grams, Paise, PaisePerKg } from './units'

export interface BillItem {
  entryId: string
  date: IsoDate
  grams: Grams
  ratePaisePerKg: PaisePerKg
  amount: Paise
}

export interface BillPayment {
  entryId: string
  date: IsoDate
  amount: Paise
  method: PaymentMethod
}

export interface BillOtherLine {
  entryId: string
  date: IsoDate
  label: string
  signedAmount: Paise
}

export interface Bill {
  customerId: string
  from: IsoDate
  to: IsoDate
  /** Balance before the period, including the opening balance. */
  previousBalance: Paise
  items: BillItem[]
  itemsGrams: Grams
  itemsAmount: Paise
  payments: BillPayment[]
  paid: Paise
  /** Reversals and adjustments in the period (signed). */
  other: BillOtherLine[]
  otherNet: Paise
  /** previous + items − paid + other. */
  currentBalance: Paise
}

export function buildBill(
  book: readonly LedgerEntry[],
  customerId: string,
  period: { from: IsoDate; to: IsoDate },
): Result<Bill> {
  if (!isIsoDate(period.from) || !isIsoDate(period.to) || period.from > period.to) {
    return fail('invalid_input', 'Bill period needs a valid start and end date')
  }
  const entries = book.filter((e) => e.customerId === customerId && isFinancial(e) && e.date <= period.to)
  const inPeriod = (date: IsoDate): boolean => date >= period.from && date <= period.to

  let previousBalance = 0
  const items: BillItem[] = []
  const payments: BillPayment[] = []
  const other: BillOtherLine[] = []

  for (const e of entries) {
    if (!isFinancial(e)) continue
    if (e.type === 'OPENING_BALANCE' || !inPeriod(e.date)) {
      previousBalance += signedAmount(e)
      continue
    }
    switch (e.type) {
      case 'SALE':
        items.push({ entryId: e.id, date: e.date, grams: e.grams, ratePaisePerKg: e.ratePaisePerKg, amount: e.amount })
        break
      case 'PAYMENT':
        payments.push({ entryId: e.id, date: e.date, amount: e.amount, method: e.method })
        break
      case 'REVERSAL':
        other.push({ entryId: e.id, date: e.date, label: e.reason ? `Reversal: ${e.reason}` : 'Reversal', signedAmount: signedAmount(e) })
        break
      case 'ADJUSTMENT':
        other.push({ entryId: e.id, date: e.date, label: `Adjustment: ${e.reason}`, signedAmount: signedAmount(e) })
        break
    }
  }

  const itemsGrams = items.reduce((a, i) => a + i.grams, 0)
  const itemsAmount = items.reduce((a, i) => a + i.amount, 0)
  const paid = payments.reduce((a, p) => a + p.amount, 0)
  const otherNet = other.reduce((a, o) => a + o.signedAmount, 0)

  return ok({
    customerId,
    from: period.from,
    to: period.to,
    previousBalance,
    items,
    itemsGrams,
    itemsAmount,
    payments,
    paid,
    other,
    otherNet,
    currentBalance: previousBalance + itemsAmount - paid + otherNet,
  })
}

/**
 * Visible bill number (D-07), e.g. "ICC/2026-27/0001". The sequence comes from an online counter (P6);
 * offline bills are shared as "Statement" without a number. No GST or legal text until U-08.
 */
export function formatBillNumber(date: IsoDate, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new RangeError('Bill sequence must be 1 or more')
  return `ICC/${financialYearOf(date)}/${String(sequence).padStart(4, '0')}`
}
