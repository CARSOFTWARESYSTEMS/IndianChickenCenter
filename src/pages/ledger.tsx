/** Ledger: total to collect, every customer's balance, and the owner's month-end close (C-TXT L69, D-08). */
import { useState } from 'react'
import { usePreferences, useT } from '../app/preferences'
import { useToast } from '../app/toast'
import { errorText, fill } from '../i18n/labels'
import { monthOf, previousMonth } from '../domain'
import { closeMonthForAll } from '../store/commands'
import { allowed, customersWithBalance, totalToCollect } from '../store/selectors'
import { dispatch, useAppState } from '../store/store'
import { Button } from '../ui/Button'
import { Amount, balanceTone, Card, EmptyState, PageHeader, Row, Section } from '../ui/primitives'
import { monthLabel, useToday } from './shared'

export function LedgerPage() {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const toast = useToast()
  const { language } = usePreferences()
  const [error, setError] = useState<string>()
  const rows = customersWithBalance(s)
    .filter((r) => r.balance !== 0)
    .sort((a, b) => b.balance - a.balance)
  const owing = rows.filter((r) => r.balance > 0).length
  const month = previousMonth(monthOf(today))
  const label = monthLabel(month, language)

  const close = () => {
    const r = dispatch(closeMonthForAll(month, today))
    if (!r.ok) return setError(errorText(t, r.error))
    setError(undefined)
    toast(r.value > 0 ? fill(t.ledger.closed, { month: label, count: r.value }) : fill(t.ledger.nothingToClose, { month: label }))
  }

  return (
    <>
      <PageHeader title={t.tabs.ledger} />
      <Card className="mt-2 text-center">
        <p className="text-sub text-ink-2">{t.ledger.toCollect}</p>
        <Amount paise={totalToCollect(s)} size="key" tone="due" />
        <p className="text-sub text-ink-2">{fill(t.ledger.customersDue, { count: owing })}</p>
      </Card>

      {rows.length === 0 ? (
        <Card className="mt-4">
          <EmptyState icon="ledger" message={t.ledger.empty} />
        </Card>
      ) : (
        <Section>
          {rows.map(({ customer, balance }) => (
            <Row
              key={customer.id}
              to={`/customers/${customer.id}`}
              title={customer.shopName}
              subtitle={customer.name}
              value={<Amount paise={balance} tone={balanceTone(balance)} />}
            />
          ))}
        </Section>
      )}

      {allowed(s, 'month.close') && (
        <Section header={t.ledger.monthEnd} footer={t.ledger.monthNote}>
          <div className="p-3">
            <Button block variant="secondary" onClick={close}>
              {fill(t.ledger.closeMonth, { month: label })}
            </Button>
            {error && (
              <p role="alert" className="mt-2 text-sub text-danger">
                {error}
              </p>
            )}
          </div>
        </Section>
      )}
    </>
  )
}
