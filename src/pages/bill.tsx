/**
 * Bills (C-TXT L71–72, plan §6, P6): previous balance, items, paid, balance due, in English or Kannada.
 *  - BillPage: the statement for a period. "Issue bill" gives it the next number (online) and freezes it.
 *  - IssuedBillPage: a numbered bill as issued, to share or print again.
 * Both share the PDF through the phone's share sheet (or download it), send the text on WhatsApp, or print.
 */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useOnline } from '../app/hooks'
import { usePreferences, useT } from '../app/preferences'
import { useToast } from '../app/toast'
import { errorText, fill } from '../i18n/labels'
import {
  billDocument,
  billFileName,
  billText,
  buildBill,
  firstDayOfMonth,
  formatIndianDate,
  formatRupees,
  lastDayOfMonth,
  monthOf,
  previousMonth,
  whatsAppLink,
  type Bill,
  type BillDocument,
  type Customer,
  type IssuedBill,
  type Language,
} from '../domain'
import { newId } from '../store/ids'
import { allowed, billById, customerById } from '../store/selectors'
import { issueBill, useAppState } from '../store/store'
import { StickyAction } from '../ui/StickyAction'
import { Button, buttonClass } from '../ui/Button'
import { Segmented } from '../ui/controls'
import { Card, EmptyState, PageHeader } from '../ui/primitives'
import { useToday } from './shared'

type Period = 'thisMonth' | 'lastMonth' | 'today'

const LANGUAGES: readonly { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'kn', label: 'ಕನ್ನಡ' },
]

function NotFound({ message }: { message: string }) {
  const t = useT()
  return (
    <>
      <PageHeader title={t.bill.title} back={{ to: '/customers', label: t.tabs.customers }} />
      <Card>
        <EmptyState icon="customers" message={message} />
      </Card>
    </>
  )
}

export function BillPage() {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const online = useOnline()
  const toast = useToast()
  const navigate = useNavigate()
  const { language: screenLanguage } = usePreferences()
  const { customerId } = useParams()
  const [period, setPeriod] = useState<Period>('thisMonth')
  const [language, setLanguage] = useState<Language>(s.settings.languages.bill ?? screenLanguage)
  // Made when the page opens, so a double tap on "Issue bill" cannot take two numbers.
  const [billId] = useState(() => newId('bill'))
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState<string>()
  const customer = customerById(s, customerId)

  if (!customer) return <NotFound message={t.customers.notFound} />

  const thisMonth = monthOf(today)
  const range =
    period === 'today'
      ? { from: today, to: today }
      : period === 'lastMonth'
        ? { from: firstDayOfMonth(previousMonth(thisMonth)), to: lastDayOfMonth(previousMonth(thisMonth)) }
        : { from: firstDayOfMonth(thisMonth), to: today }
  const built = buildBill(s.ledger, customer.id, range, s.ledgerWindow)
  if (!built.ok) return <NotFound message={errorText(t, built.error)} />
  const bill = built.value
  const doc = billDocument(bill, { settings: s.settings, language, shopName: customer.shopName, ...(customer.name ? { customerName: customer.name } : {}) })

  const onIssue = async () => {
    setIssuing(true)
    setError(undefined)
    const r = await issueBill({ id: billId, customerId: customer.id, from: range.from, to: range.to, date: today })
    setIssuing(false)
    if (!r.ok) {
      setError(r.error.code === 'not_online' ? t.bill.needInternet : r.error.code === 'not_saved' ? t.bill.wrongDate : errorText(t, r.error))
      return
    }
    toast(fill(t.bill.issued, { number: r.value.number }))
    navigate(`/customers/${customer.id}/bills/${r.value.id}`, { replace: true })
  }

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
        <Segmented label={t.bill.language} value={language} onChange={setLanguage} options={LANGUAGES} />
      </div>
      <BillView doc={doc} />
      <p className="mt-2 px-1 text-caption text-ink-2 print:hidden">{online ? t.bill.statementNote : t.bill.needInternet}</p>
      <BillActions
        doc={doc}
        bill={bill}
        customer={customer}
        language={language}
        date={today}
        primary={
          allowed(s, 'bill.send') ? (
            <>
              {error && (
                <p role="alert" className="mb-2 rounded-xl bg-card px-4 py-2 text-sub font-medium text-danger">
                  {error}
                </p>
              )}
              <Button block disabled={issuing} onClick={() => void onIssue()}>
                {issuing ? t.bill.issuing : t.bill.issue}
              </Button>
            </>
          ) : undefined
        }
      />
    </>
  )
}

export function IssuedBillPage() {
  const t = useT()
  const s = useAppState()
  const { language: screenLanguage } = usePreferences()
  const { customerId, billId } = useParams()
  const [language, setLanguage] = useState<Language>(s.settings.languages.bill ?? screenLanguage)
  const customer = customerById(s, customerId)
  const issued = billById(s, billId)

  if (!customer) return <NotFound message={t.customers.notFound} />
  if (!issued || issued.customerId !== customer.id) return <NotFound message={t.bill.notFound} />

  const doc = billDocument(issued.bill, {
    settings: s.settings,
    language,
    shopName: customer.shopName,
    ...(customer.name ? { customerName: customer.name } : {}),
    issued,
  })

  return (
    <>
      <PageHeader title={issued.number} subtitle={customer.shopName} back={{ to: `/customers/${customer.id}`, label: customer.shopName }} />
      <div className="print:hidden">
        <Segmented label={t.bill.language} value={language} onChange={setLanguage} options={LANGUAGES} />
      </div>
      <BillView doc={doc} />
      <p className="mt-2 px-1 text-caption text-ink-2 print:hidden">{t.bill.issuedNote}</p>
      <BillActions doc={doc} bill={issued.bill} customer={customer} language={language} date={issued.issuedOn} issued={issued} />
    </>
  )
}

/** The bill as printed: the same document the PDF draws. */
function BillView({ doc }: { doc: BillDocument }) {
  return (
    <article className="mt-4 rounded-2xl bg-card p-5 print:p-0" lang={doc.language}>
      <header className="border-b border-line pb-3 text-center">
        {doc.header.map((line, i) => (
          <p key={`${i}-${line}`} className={i === 0 ? 'text-title font-bold' : 'text-sub text-ink-2'}>
            {line}
          </p>
        ))}
      </header>
      <div className="space-y-0.5 py-3">
        <p className="text-body font-bold">{doc.title}</p>
        <p className="text-sub font-semibold">{doc.customer}</p>
        <p className="num text-sub text-ink-2">{doc.period}</p>
        {doc.issued && <p className="num text-sub text-ink-2">{doc.issued}</p>}
      </div>
      <div className="border-t border-line pt-2">
        {doc.rows.map((row, i) =>
          row.kind === 'due' ? (
            <div key={i} className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <span className="text-body font-semibold">{row.label}</span>
              <span className="num text-amount font-semibold">{formatRupees(row.amount)}</span>
            </div>
          ) : (
            <p key={i} className={`flex justify-between gap-3 py-1 ${row.kind === 'detail' ? 'pl-3 text-sub text-ink-2' : 'text-body'}`}>
              <span className="num">{row.label}</span>
              <span className="num shrink-0">{formatRupees(row.amount)}</span>
            </p>
          ),
        )}
      </div>
      {doc.footer && <p className="mt-3 text-caption text-ink-2">{doc.footer}</p>}
    </article>
  )
}

/** Share PDF, WhatsApp text and Print, under the page's main action. */
function BillActions({
  doc,
  bill,
  customer,
  language,
  date,
  issued,
  primary,
}: {
  doc: BillDocument
  bill: Bill
  customer: Customer
  language: Language
  date: string
  issued?: IssuedBill
  primary?: React.ReactNode
}) {
  const t = useT()
  const s = useAppState()
  const toast = useToast()
  const [making, setMaking] = useState(false)
  const text = billText(bill, {
    settings: s.settings,
    language,
    shopName: customer.shopName,
    ...(customer.name ? { customerName: customer.name } : {}),
    ...(issued ? { billNumber: issued.number } : {}),
  })
  const link = customer.phone ? whatsAppLink(customer.phone, text) : undefined

  const onShare = async () => {
    setMaking(true)
    try {
      const { billPdfFile, shareOrDownload } = await import('../pdf/billPdf')
      const file = await billPdfFile(doc, billFileName(doc, issued, date))
      const outcome = await shareOrDownload(file, doc.title)
      if (outcome === 'downloaded') toast(t.bill.pdfSaved)
    } catch (err) {
      toast(fill(t.errors.generic, { message: err instanceof Error ? err.message : String(err) }))
    } finally {
      setMaking(false)
    }
  }

  return (
    <StickyAction>
      {primary}
      <div className={`grid grid-cols-3 gap-2 ${primary ? 'mt-2' : ''}`}>
        <Button variant={primary ? 'secondary' : 'primary'} disabled={making} onClick={() => void onShare()}>
          {making ? t.bill.makingPdf : t.bill.sharePdf}
        </Button>
        {link?.ok ? (
          <a className={buttonClass('secondary')} href={link.value} target="_blank" rel="noreferrer">
            {t.bill.whatsappText}
          </a>
        ) : (
          <Button variant="secondary" disabled title={t.bill.needPhone}>
            {t.bill.whatsappText}
          </Button>
        )}
        <Button variant="secondary" onClick={() => window.print()}>
          {t.bill.print}
        </Button>
      </div>
      {!customer.phone && <p className="mt-2 text-center text-caption text-ink-2">{t.bill.needPhone}</p>}
    </StickyAction>
  )
}

/** One issued bill as a line on the customer page. */
export function billLine(b: IssuedBill): { title: string; subtitle: string; amount: number } {
  return {
    title: b.number,
    subtitle: `${formatIndianDate(b.bill.from)} – ${formatIndianDate(b.bill.to)}`,
    amount: b.bill.currentBalance,
  }
}
