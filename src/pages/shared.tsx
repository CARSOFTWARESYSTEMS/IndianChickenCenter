/** Helpers shared by the screens: input conversion, the customer picker and the fuel fields. */
import { useMemo, useState } from 'react'
import { usePreferences, useT } from '../app/preferences'
import {
  divFloor,
  formatKg,
  formatLitres,
  formatRupees,
  multiplyExact,
  parseLitres,
  parsePricePerLitre,
  parseRupees,
  toExactPaise,
  todayInKolkata,
  type Grams,
  type Language,
  type MonthKey,
  type Paise,
  type Result,
} from '../domain'
import type { FuelInput } from '../store/commands'
import { customersWithBalance } from '../store/selectors'
import { useAppState } from '../store/store'
import { Field, Segmented } from '../ui/controls'
import { Amount, balanceTone } from '../ui/primitives'

export function useToday(): string {
  return todayInKolkata()
}

/** 14_000 → "140", 12_345 → "123.45" (to prefill a rupee field). */
export function rupeesText(paise: Paise | undefined): string {
  if (paise === undefined) return ''
  return paise % 100 === 0 ? String(paise / 100) : `${divFloor(paise, 100)}.${String(paise % 100).padStart(2, '0')}`
}

/** 130_000 → "130", 36_900 → "36.9" (to prefill a kg field). */
export function kgText(grams: Grams): string {
  if (grams <= 0) return ''
  return formatKg(grams).replace(/ kg$/, '').replace(/,/g, '')
}

/** The parsed value, or undefined while the field is empty or invalid. */
export function valueOf<T>(text: string, parse: (s: string) => Result<T>): T | undefined {
  if (!text.trim()) return undefined
  const r = parse(text)
  return r.ok ? r.value : undefined
}

/** The parse error message, shown only once something was typed. */
export function errorOf<T>(text: string, parse: (s: string) => Result<T>): string | undefined {
  if (!text.trim()) return undefined
  const r = parse(text)
  return r.ok ? undefined : r.error.message
}

export function monthLabel(month: MonthKey, language: Language): string {
  return new Intl.DateTimeFormat(language === 'kn' ? 'kn-IN' : 'en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  )
}

export function useDateLabel(): string {
  const { language } = usePreferences()
  return new Intl.DateTimeFormat(language === 'kn' ? 'kn-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(new Date())
}

/** Customers, most recently sold-to first, with a search box; the chosen one is highlighted. */
export function CustomerPicker({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  const t = useT()
  const s = useAppState()
  const [query, setQuery] = useState('')
  const all = useMemo(() => customersWithBalance(s), [s])
  const q = query.trim().toLowerCase()
  const shown = all
    .filter(({ customer: c }) => !q || c.shopName.toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q) || (c.phone ?? '').includes(q))
    .slice(0, 8)
  return (
    <div>
      <Field label={t.trip.customer} icon="search" type="search" placeholder={t.trip.searchCustomer} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div role="radiogroup" aria-label={t.trip.customer} className="mt-2 divide-y divide-line overflow-hidden rounded-xl bg-card">
        {shown.length === 0 && <p className="px-4 py-3 text-sub text-ink-2">{t.customers.noMatch}</p>}
        {shown.map(({ customer: c, balance }) => {
          const active = c.id === value
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(c.id)}
              className={`flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left ${active ? 'bg-accent-soft' : 'active:bg-fill'}`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-accent bg-accent' : 'border-line'}`}
                aria-hidden="true"
              >
                {active && <span className="size-2 rounded-full bg-on-accent" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body">{c.shopName}</span>
                {c.name && <span className="block truncate text-sub text-ink-2">{c.name}</span>}
              </span>
              <Amount paise={balance} tone={balanceTone(balance)} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

type FuelMode = 'LITRES' | 'AMOUNT'

/** Fuel by litres (cost worked out) or by pump amount (litres worked out); price prefilled from Settings. */
export function useFuelFields(defaultPrice: Paise | undefined) {
  const t = useT()
  const [mode, setMode] = useState<FuelMode>('LITRES')
  const [litres, setLitres] = useState('')
  const [amount, setAmount] = useState('')
  const [price, setPrice] = useState(rupeesText(defaultPrice))

  const ml = valueOf(litres, parseLitres)
  const paid = valueOf(amount, parseRupees)
  const perLitre = valueOf(price, parsePricePerLitre)
  const exact = mode === 'LITRES' && ml !== undefined && perLitre !== undefined ? multiplyExact(ml, perLitre) : null
  const cost = mode === 'LITRES' ? (exact === null ? undefined : toExactPaise(exact)) : paid
  const derivedLitres = mode === 'AMOUNT' && paid !== undefined && perLitre ? divFloor(paid * 2_000 + perLitre, perLitre * 2) : undefined

  const filled = mode === 'LITRES' ? litres.trim() !== '' : amount.trim() !== ''
  const input = (id: string): FuelInput | undefined => {
    if (perLitre === undefined) return undefined
    if (mode === 'LITRES') return ml === undefined ? undefined : { id, mode, millilitres: ml, pricePaisePerLitre: perLitre }
    return paid === undefined ? undefined : { id, mode, amount: paid, pricePaisePerLitre: perLitre }
  }

  const fields = (
    <>
      <Segmented
        label={t.trip.fuel}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'LITRES', label: t.trip.byLitres },
          { value: 'AMOUNT', label: t.trip.byAmount },
        ]}
      />
      {mode === 'LITRES' ? (
        <Field label={t.trip.litres} inputMode="decimal" suffix="L" value={litres} onChange={(e) => setLitres(e.target.value)} error={errorOf(litres, parseLitres)} />
      ) : (
        <Field label={t.trip.pumpAmount} inputMode="decimal" suffix="₹" value={amount} onChange={(e) => setAmount(e.target.value)} error={errorOf(amount, parseRupees)} />
      )}
      <Field
        label={t.trip.pricePerLitre}
        inputMode="decimal"
        suffix="₹/L"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        error={errorOf(price, parsePricePerLitre)}
      />
      <div className="rounded-xl bg-card p-3 text-center" aria-live="polite">
        <div className="text-sub text-ink-2">{t.trip.fuelCost}</div>
        <Amount paise={cost ?? 0} size="title" tone={cost === undefined ? 'muted' : 'neutral'} />
        {derivedLitres !== undefined && <div className="num text-sub text-ink-2">≈ {formatLitres(derivedLitres)}</div>}
      </div>
    </>
  )
  return { fields, filled, input, cost: cost === undefined ? undefined : formatRupees(cost) }
}
