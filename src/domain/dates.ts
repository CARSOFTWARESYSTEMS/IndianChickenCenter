/** Calendar date in Asia/Kolkata, "YYYY-MM-DD". */
export type IsoDate = string
/** Calendar month, "YYYY-MM" (D-08: month end = calendar month, Asia/Kolkata). */
export type MonthKey = string

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_KEY = /^(\d{4})-(\d{2})$/

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

export function isMonthKey(value: string): boolean {
  const m = MONTH_KEY.exec(value)
  return m !== null && Number(m[2]) >= 1 && Number(m[2]) <= 12
}

export function monthOf(date: IsoDate): MonthKey {
  return date.slice(0, 7)
}

const kolkataParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's date in Asia/Kolkata, whatever the device time zone. */
export function todayInKolkata(now: Date = new Date()): IsoDate {
  const parts = Object.fromEntries(kolkataParts.formatToParts(now).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** "2026-01" → "2025-12". */
export function previousMonth(month: MonthKey): MonthKey {
  const year = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`
}

/** "2026-12" → "2027-01". */
export function nextMonth(month: MonthKey): MonthKey {
  const year = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`
}

export function firstDayOfMonth(month: MonthKey): IsoDate {
  return `${month}-01`
}

/** "2028-02" → "2028-02-29". */
export function lastDayOfMonth(month: MonthKey): IsoDate {
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
  return `${month}-${String(days).padStart(2, '0')}`
}

/** "2026-10-05" → "05-10-2026" (bill and passbook display). */
export function formatIndianDate(date: IsoDate): string {
  const [y, m, d] = date.split('-')
  return `${d}-${m}-${y}`
}

/** Indian financial year (April–March): "2026-11-22" → "2026-27", "2027-03-31" → "2026-27". */
export function financialYearOf(date: IsoDate): string {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const start = month >= 4 ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}
