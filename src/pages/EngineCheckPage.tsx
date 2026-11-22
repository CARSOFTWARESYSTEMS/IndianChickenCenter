/** Engine check on demo data: the source examples run through src/domain. For the developer, not the owner's screens. */
import { useMemo, useState } from 'react'
import { useT } from '../app/preferences'
import { demoLedger, demoTrip } from '../demo'
import {
  billText,
  DEFAULT_SETTINGS,
  formatIndianDate,
  formatKg,
  formatRatePerKg,
  formatRupees,
  whatsAppLink,
  type Language,
  type Paise,
  type RoundingPolicyId,
} from '../domain'
import { buttonClass } from '../ui/Button'
import { Field, Segmented } from '../ui/controls'
import { Amount, Card, PageHeader, Pill, StatTile } from '../ui/primitives'

const POLICIES: readonly { value: RoundingPolicyId; label: string }[] = [
  { value: 'ROUND_HALF_UP_RUPEE', label: 'Round' },
  { value: 'TRUNCATE_RUPEE', label: 'Drop paise' },
  { value: 'EXACT_PAISE', label: 'Keep paise' },
]

function Line({ label, paise, strong = false }: { label: string; paise: Paise | undefined; strong?: boolean }) {
  return (
    <p className={`flex justify-between gap-3 py-1 text-sub ${strong ? 'mt-1 border-t border-line pt-2 text-body font-semibold' : ''}`}>
      <span>{label}</span>
      {paise !== undefined && <Amount paise={paise} />}
    </p>
  )
}

const th = 'px-2 py-1.5 text-left text-caption font-medium text-ink-2'
const td = 'whitespace-nowrap px-2 py-1.5 text-sub'

export function EngineCheckPage() {
  const t = useT()
  const [policy, setPolicy] = useState<RoundingPolicyId>('ROUND_HALF_UP_RUPEE')
  const [language, setLanguage] = useState<Language>('en')
  const [phone, setPhone] = useState('')

  const trip = useMemo(() => demoTrip(policy), [policy])
  const ledger = useMemo(() => demoLedger(policy), [policy])
  const text = useMemo(
    () => billText(ledger.bill, { settings: DEFAULT_SETTINGS, language, shopName: 'Customer1' }),
    [ledger, language],
  )
  const link = phone.trim() ? whatsAppLink(phone, text) : null
  const { summary: s, profit: p } = trip

  return (
    <>
      <PageHeader
        title={t.more.engineCheck}
        back={{ to: '/more', label: t.more.back }}
        subtitle="Examples from IndianChickenCenter.txt, run through the money engine. Nothing is saved."
      />
      <Card className="mt-2">
        <p className="mb-2 text-sub text-ink-2">Bill rounding (owner chose Round)</p>
        <Segmented label="Bill rounding" value={policy} options={POLICIES} onChange={setPolicy} />
      </Card>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-title font-semibold">
            {formatIndianDate('2026-11-02')} · {trip.vehicleNumber}
          </h2>
          <Pill tone={s.provisional ? 'muted' : 'received'}>{s.provisional ? t.status.provisional : t.status.done}</Pill>
        </div>
        <p className="text-sub text-ink-2">
          {trip.driverName} · {formatRatePerKg(s.defaultSaleRatePaisePerKg ?? 0)}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              [t.today.loaded, formatKg(s.loadedGrams)],
              [t.today.sold, formatKg(s.soldGrams)],
              [t.today.wastage, formatKg(s.wastageGrams)],
              [t.today.left, formatKg(s.remainingGrams)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl bg-canvas">
              <StatTile label={label}>{value}</StatTile>
            </div>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Customer</th>
                <th className={`${th} text-right`}>Kg</th>
                <th className={`${th} text-right`}>Rate</th>
                <th className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody className="num">
              {trip.saleLines.map((l) => (
                <tr key={l.customer} className="border-b border-line last:border-0">
                  <td className={td}>{l.customer}</td>
                  <td className={`${td} text-right`}>{formatKg(l.grams)}</td>
                  <td className={`${td} text-right`}>{formatRatePerKg(l.rate)}</td>
                  <td className={`${td} text-right`}>{formatRupees(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-caption font-medium uppercase tracking-wide text-ink-2">Option 1</h3>
            <Line label={`Full load at ${formatRatePerKg(p.option1?.valuationRatePaisePerKg ?? 0)}`} paise={p.option1?.fullLoadValue} />
            <Line label="Less expenses incl. wastage" paise={p.option1?.totalExpenses} />
            <Line label="After expenses" paise={p.option1?.afterExpenses} />
            <Line label="Less purchase" paise={p.option1?.purchases} />
            <Line label={t.today.profit} paise={p.option1?.profit} strong />
          </div>
          <div>
            <h3 className="text-caption font-medium uppercase tracking-wide text-ink-2">Option 2</h3>
            <Line label="Sold (after wastage)" paise={p.option2.sales} />
            <Line label="Less expenses" paise={p.option2.operating} />
            <Line label="After expenses" paise={p.option2.afterExpenses} />
            <Line label="Less purchase" paise={p.option2.purchases} />
            <Line label={t.today.profit} paise={p.option2.profit} strong />
          </div>
        </div>
        <p className={`mt-3 text-sub font-semibold ${p.methodsMatch ? 'text-received' : 'text-due'}`}>
          {p.methodsMatch ? 'Both options match.' : `Options differ by ${formatRupees(p.differencePaise ?? 0)}.`}
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="text-title font-semibold">Customer1</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Date</th>
                <th className={`${th} text-right`}>Kg</th>
                <th className={`${th} text-right`}>Per kg</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={`${th} text-right`}>Paid</th>
                <th className={`${th} text-right`}>Balance</th>
                <th className={th}>Comments</th>
              </tr>
            </thead>
            <tbody className="num">
              {ledger.rows.map((r) => (
                <tr key={r.entryId} className="border-b border-line last:border-0">
                  <td className={td}>{formatIndianDate(r.date)}</td>
                  <td className={`${td} text-right`}>{r.totalItemsGrams === undefined ? '' : formatKg(r.totalItemsGrams)}</td>
                  <td className={`${td} text-right`}>{r.itemRatePaisePerKg === undefined ? '' : formatRatePerKg(r.itemRatePaisePerKg)}</td>
                  <td className={`${td} text-right`}>{r.totalAmount === undefined ? '' : formatRupees(r.totalAmount)}</td>
                  <td className={`${td} text-right text-received`}>{r.paidAmount === undefined ? '' : formatRupees(r.paidAmount)}</td>
                  <td className={`${td} text-right font-semibold`}>{formatRupees(r.balance)}</td>
                  <td className={td}>{r.comments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-title font-semibold">Bill</h2>
          <div className="w-48">
            <Segmented
              label="Bill language"
              value={language}
              options={[
                { value: 'en', label: 'English' },
                { value: 'kn', label: 'ಕನ್ನಡ' },
              ]}
              onChange={setLanguage}
            />
          </div>
        </div>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-canvas p-3 font-sans text-sub">{text}</pre>
        <Field
          className="mt-4"
          label="Customer WhatsApp number"
          inputMode="tel"
          placeholder="10-digit mobile"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={link && !link.ok ? link.error.message : undefined}
        />
        {link?.ok && (
          <a className={buttonClass('primary', true, 'mt-3')} href={link.value} target="_blank" rel="noreferrer">
            Open WhatsApp with this bill
          </a>
        )}
      </Card>
    </>
  )
}
