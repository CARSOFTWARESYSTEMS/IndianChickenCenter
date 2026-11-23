/** Customers: list with balances, the customer's passbook (the source's 7 columns), payments, reversals. */
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useT } from '../app/preferences'
import { useToast } from '../app/toast'
import { errorText, fill } from '../i18n/labels'
import {
  formatIndianDate,
  formatIndianMobile,
  formatKg,
  formatRatePerKg,
  formatRupees,
  normalizeIndianMobile,
  parseRupees,
  type Customer,
  type LedgerEntry,
  type PassbookRow,
  type PaymentMethod,
} from '../domain'
import { addCustomer, editCustomer, recordPayment, reverseLedgerEntry } from '../store/commands'
import { newId } from '../store/ids'
import { allowed, balanceOf, billsOf, customerById, customersWithBalance, openTripsToday, passbookOf, reversedIds } from '../store/selectors'
import { dispatch, useAppState } from '../store/store'
import { billLine } from './bill'
import { isPending, useSync } from '../store/sync'
import { Button, ButtonLink } from '../ui/Button'
import { Field, Segmented } from '../ui/controls'
import { FormSheet } from '../ui/FormSheet'
import { Amount, balanceTone, Card, EmptyState, PageHeader, Row, Section } from '../ui/primitives'
import { errorOf, useToday, valueOf } from './shared'
import { ReverseSheet, SaleSheet } from './tripSheets'

export function CustomersPage() {
  const t = useT()
  const s = useAppState()
  const [params] = useSearchParams()
  const search = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (params.get('focus') === 'search') search.current?.focus()
  }, [params])

  const q = query.trim().toLowerCase()
  const list = customersWithBalance(s).filter(
    ({ customer: c }) => !q || c.shopName.toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q) || (c.phone ?? '').includes(q),
  )
  const canAdd = allowed(s, 'customer.manage')

  return (
    <>
      <PageHeader
        title={t.tabs.customers}
        action={
          canAdd ? (
            <Button variant="plain" onClick={() => setAdding(true)} aria-label={t.customers.add} icon="plus">
              <span className="sr-only md:not-sr-only">{t.customers.add}</span>
            </Button>
          ) : undefined
        }
      />
      <Field
        ref={search}
        label={t.customers.search}
        hideLabel
        icon="search"
        type="search"
        placeholder={t.customers.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {s.customers.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon="customers"
            message={t.customers.empty}
            action={
              canAdd ? (
                <Button block variant="secondary" onClick={() => setAdding(true)}>
                  {t.customers.add}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Section>
          {list.length === 0 && <p className="px-4 py-3 text-sub text-ink-2">{t.customers.noMatch}</p>}
          {list.map(({ customer: c, balance }) => (
            <Row
              key={c.id}
              to={`/customers/${c.id}`}
              title={c.shopName}
              subtitle={[c.name, c.phone ? formatIndianMobile(c.phone) : undefined].filter(Boolean).join(' · ') || undefined}
              value={<Amount paise={balance} tone={balanceTone(balance)} />}
            />
          ))}
        </Section>
      )}
      {adding && <CustomerSheet onClose={() => setAdding(false)} />}
    </>
  )
}

/** Add a customer (shop name, name, mobile, optional opening balance) or edit one. Shared numbers are warned about. */
function CustomerSheet({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const toast = useToast()
  const [id] = useState(() => customer?.id ?? newId('c'))
  const [shopName, setShopName] = useState(customer?.shopName ?? '')
  const [name, setName] = useState(customer?.name ?? '')
  const [phone, setPhone] = useState(customer?.phone ? formatIndianMobile(customer.phone) : '')
  const [opening, setOpening] = useState('')
  const [error, setError] = useState<string>()

  const normalized = phone.trim() ? normalizeIndianMobile(phone) : undefined
  const sharedWith = normalized?.ok ? s.customers.find((c) => c.phone === normalized.value && c.id !== id) : undefined
  const openingP = valueOf(opening, parseRupees)
  const canSave = shopName.trim() !== '' && (!normalized || normalized.ok) && (opening.trim() === '' || openingP !== undefined)

  const onSave = () => {
    const r = customer
      ? dispatch(editCustomer(customer.id, { shopName, name, phone }))
      : dispatch(
          addCustomer({
            id,
            shopName,
            date: today,
            ...(name.trim() ? { name } : {}),
            ...(phone.trim() ? { phone } : {}),
            ...(openingP ? { openingBalance: openingP } : {}),
          }),
        )
    if (!r.ok) return setError(errorText(t, r.error))
    toast(t.common.saved)
    onClose()
  }

  return (
    <FormSheet title={customer ? t.customers.edit : t.customers.add} onClose={onClose} onSave={onSave} canSave={canSave} error={error}>
      <Field label={t.customers.shopName} value={shopName} onChange={(e) => setShopName(e.target.value)} />
      <Field label={t.customers.name} value={name} onChange={(e) => setName(e.target.value)} />
      <Field
        label={t.customers.phone}
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={normalized && !normalized.ok ? t.errors.invalid_phone : undefined}
        hint={sharedWith ? fill(t.customers.duplicatePhone, { name: sharedWith.shopName }) : undefined}
      />
      {!customer && (
        <Field
          label={t.customers.openingBalance}
          inputMode="decimal"
          suffix="₹"
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          error={errorOf(opening, parseRupees)}
        />
      )}
    </FormSheet>
  )
}

function PaymentSheet({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const toast = useToast()
  const [id] = useState(() => newId('pay'))
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string>()
  const paise = valueOf(amount, parseRupees)
  // A driver's collections belong to their trip today.
  const driverTrip = allowed(s, 'trip.viewAll') ? undefined : openTripsToday(s, today)[0]

  const onSave = () => {
    if (paise === undefined) return
    const r = dispatch(
      recordPayment({
        id,
        customerId: customer.id,
        date: today,
        amount: paise,
        method,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(driverTrip ? { tripId: driverTrip.id } : {}),
      }),
    )
    if (!r.ok) return setError(errorText(t, r.error))
    toast(t.common.saved)
    onClose()
  }

  return (
    <FormSheet title={t.customers.recordPayment} onClose={onClose} onSave={onSave} canSave={paise !== undefined} error={error}>
      <p className="px-1 text-sub text-ink-2">
        {customer.shopName} · {t.customers.balance}{' '}
        <Amount paise={balanceOf(s, customer.id)} tone={balanceTone(balanceOf(s, customer.id))} />
      </p>
      <Field label={t.customers.amountRs} inputMode="decimal" suffix="₹" value={amount} onChange={(e) => setAmount(e.target.value)} error={errorOf(amount, parseRupees)} />
      <Segmented
        label={t.trip.method}
        value={method}
        onChange={setMethod}
        options={(['CASH', 'UPI', 'BANK_TRANSFER'] as const).map((m) => ({ value: m, label: t.methods[m] }))}
      />
      {method !== 'CASH' && <Field label={t.customers.reference} value={reference} onChange={(e) => setReference(e.target.value)} />}
    </FormSheet>
  )
}

/** One passbook line in words, for the phone list and the reverse sheet. */
function describe(t: ReturnType<typeof useT>, row: PassbookRow, entry: LedgerEntry | undefined): { title: string; amount?: number } {
  switch (row.type) {
    case 'OPENING_BALANCE':
      return { title: t.customers.opening }
    case 'SALE':
      return { title: `${formatKg(row.totalItemsGrams ?? 0)} × ${formatRatePerKg(row.itemRatePaisePerKg ?? 0)}`, amount: row.totalAmount ?? 0 }
    case 'PAYMENT':
      return { title: entry?.type === 'PAYMENT' ? `${t.customers.payment} · ${t.methods[entry.method]}` : t.customers.payment, amount: -(row.paidAmount ?? 0) }
    case 'REVERSAL':
      return { title: row.comments, amount: row.totalAmount ?? -(row.paidAmount ?? 0) }
    case 'ADJUSTMENT':
      return { title: row.comments, amount: row.totalAmount ?? 0 }
    case 'MONTH_END_SNAPSHOT':
      return { title: t.customers.monthEnd }
    case 'BROUGHT_FORWARD':
      return { title: t.customers.broughtForward }
  }
}

export function CustomerDetailPage() {
  const t = useT()
  const s = useAppState()
  const sync = useSync()
  const today = useToday()
  const { customerId } = useParams()
  const [sheet, setSheet] = useState<'edit' | 'payment' | 'sale'>()
  const [reversing, setReversing] = useState<{ entry: LedgerEntry; line: string }>()
  const customer = customerById(s, customerId)

  if (!customer) {
    return (
      <>
        <PageHeader title={t.tabs.customers} back={{ to: '/customers', label: t.tabs.customers }} />
        <Card>
          <EmptyState icon="customers" message={t.customers.notFound} />
        </Card>
      </>
    )
  }

  const balance = balanceOf(s, customer.id)
  const rows = passbookOf(s, customer.id)
  const bills = billsOf(s, customer.id)
  const byId = new Map(s.ledger.map((e) => [e.id, e]))
  const reversed = reversedIds(s)
  const saleTrips = openTripsToday(s, today)
  const mayReverse = allowed(s, 'entry.reverse')
  const subtitle = [customer.name, customer.phone ? formatIndianMobile(customer.phone) : undefined].filter(Boolean).join(' · ')

  const canReverse = (row: PassbookRow) => {
    const e = byId.get(row.entryId)
    return mayReverse && e && e.type !== 'MONTH_END_SNAPSHOT' && e.type !== 'REVERSAL' && !reversed.has(e.id) ? e : undefined
  }

  return (
    <>
      <PageHeader
        title={customer.shopName}
        subtitle={subtitle || undefined}
        back={{ to: '/customers', label: t.tabs.customers }}
        action={
          allowed(s, 'customer.manage') ? (
            <Button variant="plain" onClick={() => setSheet('edit')}>
              {t.common.edit}
            </Button>
          ) : undefined
        }
      />
      <Card className="mt-2 text-center">
        <p className="text-sub text-ink-2">{t.customers.balance}</p>
        <Amount paise={Math.abs(balance)} size="key" tone={balanceTone(balance)} />
        <p className="text-sub text-ink-2">{balance > 0 ? t.customers.due : balance < 0 ? t.customers.advance : t.customers.settled}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 print:hidden">
          <Button variant="secondary" disabled={saleTrips.length === 0 || !allowed(s, 'sale.record')} onClick={() => setSheet('sale')}>
            {t.customers.sale}
          </Button>
          <Button variant="secondary" disabled={!allowed(s, 'payment.record')} onClick={() => setSheet('payment')}>
            {t.customers.payment}
          </Button>
          <ButtonLink variant="secondary" to={`/customers/${customer.id}/bill`}>
            {t.customers.bill}
          </ButtonLink>
        </div>
        {saleTrips.length === 0 && <p className="mt-2 text-caption text-ink-2">{t.customers.saleNeedsTrip}</p>}
      </Card>

      {bills.length > 0 && (
        <Section header={t.bill.bills}>
          {bills.map((b) => {
            const line = billLine(b)
            return (
              <Row
                key={b.id}
                to={`/customers/${customer.id}/bills/${b.id}`}
                title={line.title}
                subtitle={line.subtitle}
                value={<Amount paise={line.amount} tone={balanceTone(line.amount)} />}
              />
            )
          })}
        </Section>
      )}

      <Section header={t.customers.entries}>
        {rows.length === 0 && <p className="px-4 py-3 text-sub text-ink-2">{t.customers.noEntries}</p>}
        {/* Phones: one line per entry. */}
        <div className="divide-y divide-line md:hidden">
          {rows.map((row) => {
            const entry = byId.get(row.entryId)
            const d = describe(t, row, entry)
            const target = canReverse(row)
            return (
              <Row
                key={row.entryId}
                title={d.title}
                subtitle={
                  isPending(sync, `ledgerEntries/${row.entryId}`)
                    ? `${formatIndianDate(row.date)} · ${t.status.savedOnPhone}`
                    : formatIndianDate(row.date)
                }
                value={
                  <span className="block">
                    {d.amount === undefined ? formatRupees(row.balance) : <Amount paise={d.amount} tone={d.amount < 0 ? 'received' : 'neutral'} />}
                    <span className="block text-caption text-ink-2">
                      {t.customers.balance} {formatRupees(row.balance)}
                    </span>
                  </span>
                }
                struck={reversed.has(row.entryId)}
                {...(target ? { onClick: () => setReversing({ entry: target, line: `${formatIndianDate(row.date)} · ${d.title}` }) } : {})}
              />
            )
          })}
        </div>
        {/* Tablet and desktop: the source ledger's seven columns. */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-sub">
            <thead>
              <tr className="border-b border-line text-left text-caption text-ink-2">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Kg</th>
                <th className="px-3 py-2 text-right font-medium">Per kg</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 font-medium">Comments</th>
              </tr>
            </thead>
            <tbody className="num [&_td]:whitespace-nowrap">
              {rows.map((row) => {
                const target = canReverse(row)
                return (
                  <tr
                    key={row.entryId}
                    className={`border-b border-line last:border-0 ${reversed.has(row.entryId) ? 'text-ink-2 line-through' : ''} ${target ? 'cursor-pointer hover:bg-fill' : ''}`}
                    onClick={target ? () => setReversing({ entry: target, line: `${formatIndianDate(row.date)} · ${describe(t, row, target).title}` }) : undefined}
                  >
                    <td className="px-3 py-2">{formatIndianDate(row.date)}</td>
                    <td className="px-3 py-2 text-right">{row.totalItemsGrams === undefined ? '' : formatKg(row.totalItemsGrams)}</td>
                    <td className="px-3 py-2 text-right">{row.itemRatePaisePerKg === undefined ? '' : formatRatePerKg(row.itemRatePaisePerKg)}</td>
                    <td className="px-3 py-2 text-right">{row.totalAmount === undefined ? '' : formatRupees(row.totalAmount)}</td>
                    <td className="px-3 py-2 text-right text-received">{row.paidAmount === undefined ? '' : formatRupees(row.paidAmount)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatRupees(row.balance)}</td>
                    <td className="px-3 py-2">
                      {row.type === 'BROUGHT_FORWARD' ? t.customers.broughtForward : row.comments}
                      {isPending(sync, `ledgerEntries/${row.entryId}`) && <span className="ml-2 text-caption text-due">{t.status.savedOnPhone}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {sheet === 'edit' && <CustomerSheet customer={customer} onClose={() => setSheet(undefined)} />}
      {sheet === 'payment' && <PaymentSheet customer={customer} onClose={() => setSheet(undefined)} />}
      {sheet === 'sale' && saleTrips.length > 0 && <SaleSheet trips={saleTrips} presetCustomerId={customer.id} onClose={() => setSheet(undefined)} />}
      {reversing && (
        <ReverseSheet
          title={t.customers.reverseEntry}
          lines={[reversing.line]}
          onReverse={(reason) => dispatch(reverseLedgerEntry(reversing.entry.id, reason, today))}
          onClose={() => setReversing(undefined)}
        />
      )}
    </>
  )
}
