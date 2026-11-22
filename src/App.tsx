// Engine check page (demo data). The real screens come in P1 (shell + design system) and P3 (clickable prototype).
import { useMemo, useState } from 'react'
import { demoLedger, demoTrip } from './demo'
import {
  billText,
  DEFAULT_SETTINGS,
  formatIndianDate,
  formatKg,
  formatRatePerKg,
  formatRupees,
  whatsAppLink,
  type Language,
  type RoundingPolicyId,
} from './domain'
import './app.css'

const POLICIES: { id: RoundingPolicyId; label: string }[] = [
  { id: 'ROUND_HALF_UP_RUPEE', label: 'Round to rupee (owner’s choice)' },
  { id: 'TRUNCATE_RUPEE', label: 'Drop paise (as in the source file)' },
  { id: 'EXACT_PAISE', label: 'Keep paise' },
]

function Money({ paise }: { paise: number | undefined }) {
  return <span className="num">{paise === undefined ? '' : formatRupees(paise)}</span>
}

export function App() {
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
    <main>
      <header>
        <h1>{DEFAULT_SETTINGS.businessName}</h1>
        <p className="secondary">{DEFAULT_SETTINGS.shopLocation.label}</p>
        <p className="badge">Demo data · engine check, not the final design</p>
      </header>

      <section className="card">
        <label className="field">
          <span>Bill rounding</span>
          <select value={policy} onChange={(e) => setPolicy(e.target.value as RoundingPolicyId)}>
            {POLICIES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card">
        <h2>
          Trip {formatIndianDate('2026-11-02')} · {trip.vehicleNumber}
        </h2>
        <p className="secondary">
          Driver {trip.driverName} · default rate {formatRatePerKg(s.defaultSaleRatePaisePerKg ?? 0)} · {s.status === 'CLOSED' ? 'Closed' : 'Open'}
        </p>
        <dl className="stats">
          <div><dt>Loaded</dt><dd>{formatKg(s.loadedGrams)}</dd></div>
          <div><dt>Sold</dt><dd>{formatKg(s.soldGrams)}</dd></div>
          <div><dt>Wastage</dt><dd>{formatKg(s.wastageGrams)}</dd></div>
          <div><dt>Left</dt><dd>{formatKg(s.remainingGrams)}</dd></div>
          <div><dt>Purchase</dt><dd><Money paise={s.purchasePaise} /></dd></div>
          <div><dt>Sales</dt><dd><Money paise={s.salesPaise} /></dd></div>
          <div><dt>Fuel</dt><dd><Money paise={s.fuelPaise} /></dd></div>
          <div><dt>Labour</dt><dd><Money paise={s.expensesByCategory.LABOUR} /></dd></div>
        </dl>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Customer</th><th className="r">Kg</th><th className="r">Rate</th><th className="r">Amount</th></tr>
            </thead>
            <tbody>
              {trip.saleLines.map((l) => (
                <tr key={l.customer}>
                  <td>{l.customer}</td>
                  <td className="r num">{formatKg(l.grams)}</td>
                  <td className="r num">{formatRatePerKg(l.rate)}</td>
                  <td className="r"><Money paise={l.amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="options">
          <div>
            <h3>Option 1</h3>
            <p className="row"><span>Full load at {formatRatePerKg(p.option1?.valuationRatePaisePerKg ?? 0)}</span><Money paise={p.option1?.fullLoadValue} /></p>
            <p className="row"><span>Less expenses incl. wastage</span><Money paise={p.option1?.totalExpenses} /></p>
            <p className="row"><span>After expenses</span><Money paise={p.option1?.afterExpenses} /></p>
            <p className="row"><span>Less purchase</span><Money paise={p.option1?.purchases} /></p>
            <p className="row total"><span>Profit</span><Money paise={p.option1?.profit} /></p>
          </div>
          <div>
            <h3>Option 2</h3>
            <p className="row"><span>Sold (after wastage)</span><Money paise={p.option2.sales} /></p>
            <p className="row"><span>Less expenses</span><Money paise={p.option2.operating} /></p>
            <p className="row"><span>After expenses</span><Money paise={p.option2.afterExpenses} /></p>
            <p className="row"><span>Less purchase</span><Money paise={p.option2.purchases} /></p>
            <p className="row total"><span>Profit</span><Money paise={p.option2.profit} /></p>
          </div>
        </div>
        <p className={p.methodsMatch ? 'ok' : 'warn'}>
          {p.methodsMatch ? 'Both options match.' : `Options differ by ${formatRupees(p.differencePaise ?? 0)}.`}
          {p.provisional ? ' Provisional.' : ''}
        </p>
      </section>

      <section className="card">
        <h2>Customer1 ledger</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th className="r">Kg</th><th className="r">Per kg</th><th className="r">Total</th>
                <th className="r">Paid</th><th className="r">Balance</th><th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((r) => (
                <tr key={r.entryId}>
                  <td className="num">{formatIndianDate(r.date)}</td>
                  <td className="r num">{r.totalItemsGrams === undefined ? '' : formatKg(r.totalItemsGrams)}</td>
                  <td className="r num">{r.itemRatePaisePerKg === undefined ? '' : formatRatePerKg(r.itemRatePaisePerKg)}</td>
                  <td className="r"><Money paise={r.totalAmount} /></td>
                  <td className="r"><Money paise={r.paidAmount} /></td>
                  <td className="r strong"><Money paise={r.balance} /></td>
                  <td>{r.comments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Bill for October</h2>
        <div className="segmented" role="group" aria-label="Bill language">
          <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
          <button type="button" aria-pressed={language === 'kn'} onClick={() => setLanguage('kn')}>ಕನ್ನಡ</button>
        </div>
        <pre className="bill">{text}</pre>
        <label className="field">
          <span>Customer WhatsApp number</span>
          <input inputMode="tel" placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        {link && !link.ok && <p className="warn">{link.error.message}</p>}
        {link?.ok && (
          <a className="button" href={link.value} target="_blank" rel="noreferrer">
            Open WhatsApp with this bill
          </a>
        )}
      </section>
    </main>
  )
}
