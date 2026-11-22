/**
 * Bill (C-TXT L71–72): previous balance, items, paid, balance due — in English or Kannada,
 * sent as WhatsApp text or printed. Visible bill numbers come with sign-in (D-07), so this is a statement for now.
 */
import { useState } from 'react'
import { useParams } from 'react-router'
import { usePreferences, useT } from '../app/preferences'
import {
  BILL_LABELS,
  billHeaderLines,
  billText,
  buildBill,
  firstDayOfMonth,
  formatIndianDate,
  formatKg,
  formatRatePerKg,
  formatRupees,
  lastDayOfMonth,
  monthOf,
  previousMonth,
  whatsAppLink,
  type Language,
} from '../domain'
import { customerById } from '../store/selectors'
import { useAppState } from '../store/store'
import { StickyAction } from '../ui/StickyAction'
import { Button, buttonClass } from '../ui/Button'
import { Segmented } from '../ui/controls'
import { Card, EmptyState, PageHeader } from '../ui/primitives'
import { useToday } from './shared'

type Period = 'thisMonth' | 'lastMonth' | 'today'

export function BillPage() {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const { language: screenLanguage } = usePreferences()
  const { customerId } = useParams()
  const [period, setPeriod] = useState<Period>('thisMonth')
  const [language, setLanguage] = useState<Language>(s.settings.languages.bill ?? screenLanguage)
  const customer = customerById(s, customerId)

  if (!customer) {
    return (
      <>
        <PageHeader title={t.bill.title} back={{ to: '/customers', label: t.tabs.customers }} />
        <Card>
          <EmptyState icon="customers" message={t.customers.notFound} />
        </Card>
      </>
    )
  }

  const thisMonth = monthOf(today)
  const range =
    period === 'today'
      ? { from: today, to: today }
      : period === 'lastMonth'
        ? { from: firstDayOfMonth(previousMonth(thisMonth)), to: lastDayOfMonth(previousMonth(thisMonth)) }
        : { from: firstDayOfMonth(thisMonth), to: today }
  const built = buildBill(s.ledger, customer.id, range)
  if (!built.ok) return null
  const bill = built.value
  const L = BILL_LABELS[language]
  const ctx = { settings: s.settings, language, shopName: customer.shopName, ...(customer.name ? { customerName: customer.name } : {}) }
  const link = customer.phone ? whatsAppLink(customer.phone, billText(bill, ctx)) : undefined

  return (
    <>
      <PageHeader title={t.bill.title} subtitle={customer.shopName} back={{ to: `/customers/${customer.id}`, label: customer.shopName }} />
      <div className="space-y-3 print:hidden">
        <Segmented
          label={t.bill.title}
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'thisMonth', label: t.bill.thisMonth },
            { value: 'lastMonth', label: t.bill.lastMonth },
            { value: 'today', label: t.bill.today },
          ]}
        />
        <Segmented
          label={t.bill.language}
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'en', label: 'English' },
            { value: 'kn', label: 'ಕನ್ನಡ' },
          ]}
        />
      </div>

      <article className="mt-4 rounded-2xl bg-card p-5 print:p-0" lang={language}>
        <header className="border-b border-line pb-3 text-center">
          {billHeaderLines(s.settings, language).map((line, i) => (
            <p key={`${i}-${line}`} className={i === 0 ? 'text-title font-bold' : 'text-sub text-ink-2'}>
              {line}
            </p>
          ))}
        </header>
        <div className="flex flex-wrap justify-between gap-2 py-3 text-sub">
          <p>
            <span className="font-semibold">{L.statement}:</span> {customer.shopName}
            {customer.name ? ` (${customer.name})` : ''}
          </p>
          <p className="num text-ink-2">
            {bill.from === bill.to ? `${L.date}: ${formatIndianDate(bill.from)}` : L.period(formatIndianDate(bill.from), formatIndianDate(bill.to))}
          </p>
        </div>
        <BillLine label={L.previousBalance} paise={bill.previousBalance} />
        {bill.items.map((item) => (
          <BillLine
            key={item.entryId}
            label={`${formatIndianDate(item.date)}  ${formatKg(item.grams, L.kg)} × ${formatRatePerKg(item.ratePaisePerKg, L.kg)}`}
            paise={item.amount}
            muted
          />
        ))}
        <BillLine label={`${L.items}: ${formatKg(bill.itemsGrams, L.kg)}`} paise={bill.itemsAmount} />
        {bill.payments.map((p) => (
          <BillLine key={p.entryId} label={`${formatIndianDate(p.date)}  ${L.payment[p.method]}`} paise={p.amount} muted />
        ))}
        <BillLine label={L.paid} paise={bill.paid} />
        {bill.other.map((o) => (
          <BillLine key={o.entryId} label={`${L[o.kind]}${o.reason ? ` (${o.reason})` : ''}`} paise={o.signedAmount} muted />
        ))}
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <span className="text-body font-semibold">{bill.currentBalance >= 0 ? L.balanceDue : L.advance}</span>
          <span className={`num text-amount font-semibold ${bill.currentBalance > 0 ? 'text-due' : 'text-received'}`}>
            {formatRupees(Math.abs(bill.currentBalance))}
          </span>
        </div>
        {s.settings.gst.enabled && s.settings.gst.legalText && <p className="mt-3 text-caption text-ink-2">{s.settings.gst.legalText}</p>}
      </article>
      <p className="mt-2 px-1 text-caption text-ink-2 print:hidden">{t.bill.statementNote}</p>

      <StickyAction>
        {link?.ok ? (
          <a className={buttonClass('primary', true)} href={link.value} target="_blank" rel="noreferrer">
            {t.bill.send}
          </a>
        ) : (
          <p className="rounded-xl bg-card px-4 py-3 text-sub text-ink-2">{t.bill.needPhone}</p>
        )}
        <Button block variant="secondary" onClick={() => window.print()}>
          {t.bill.print}
        </Button>
      </StickyAction>
    </>
  )
}

function BillLine({ label, paise, muted = false }: { label: string; paise: number; muted?: boolean }) {
  return (
    <p className={`flex justify-between gap-3 py-1 ${muted ? 'pl-3 text-sub text-ink-2' : 'text-body'}`}>
      <span className="num">{label}</span>
      <span className="num shrink-0">{formatRupees(paise)}</span>
    </p>
  )
}
