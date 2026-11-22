/** Today: today's trips (Loaded · Sold · Left · Wastage · Expenses · Profit), money to collect and received today. */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { InstallCard } from '../app/InstallCard'
import { useT } from '../app/preferences'
import { DEFAULT_SETTINGS, formatKg, formatRupees } from '../domain'
import { allowed, openTripsToday, receivedOn, totalToCollect, tripProfitOf, tripSummaryOf } from '../store/selectors'
import { useAppState } from '../store/store'
import { StickyAction } from '../ui/StickyAction'
import { Button } from '../ui/Button'
import { Card, EmptyState, PageHeader, Pill, StatTile } from '../ui/primitives'
import { useDateLabel, useToday } from './shared'
import { SaleSheet } from './tripSheets'

export function TodayPage() {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const date = useDateLabel()
  const navigate = useNavigate()
  const [selling, setSelling] = useState(false)
  const trips = openTripsToday(s, today)
  const showMoney = allowed(s, 'profit.view')
  const canStart = allowed(s, 'trip.open')
  const toCollect = totalToCollect(s)

  return (
    <>
      <p className="pt-3 text-sub text-ink-2 md:hidden">
        <span className="font-semibold text-ink">{s.settings.businessName || DEFAULT_SETTINGS.businessName}</span> · {s.settings.shopLocation.label}
      </p>
      <PageHeader title={t.tabs.today} subtitle={date} />
      <InstallCard dismissible />

      {trips.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon="trip"
            message={t.today.noTrip}
            action={
              canStart ? (
                <Button block onClick={() => navigate('/trip?start=1')}>
                  {t.today.startTrip}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <section className="mt-4 space-y-3">
          <h2 className="px-4 text-caption font-medium uppercase tracking-wide text-ink-2">{t.today.todaysTrips}</h2>
          {trips.map((trip) => {
            const sum = tripSummaryOf(s, trip)
            const profit = tripProfitOf(s, trip)
            return (
              <Link key={trip.id} to={`/trip/${trip.id}`} className="block rounded-2xl bg-card p-4 active:opacity-80">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="num text-body font-semibold">{trip.vehicleNumber}</p>
                    <p className="truncate text-sub text-ink-2">{trip.driverName}</p>
                  </div>
                  <Pill tone="muted">{t.status.provisional}</Pill>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sub">
                  {(
                    [
                      [t.today.loaded, formatKg(sum.loadedGrams)],
                      [t.today.sold, formatKg(sum.soldGrams)],
                      [t.today.left, formatKg(sum.remainingGrams)],
                      [t.today.wastage, formatKg(sum.wastageGrams)],
                      ...(showMoney
                        ? [
                            [t.today.expenses, formatRupees(sum.operatingPaise)],
                            [t.today.profit, formatRupees(profit.option2.profit)],
                          ]
                        : []),
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-caption text-ink-2">{label}</dt>
                      <dd className="num font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            )
          })}
        </section>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link to="/ledger" className="active:opacity-80">
          <StatTile label={t.today.toCollect} tone={toCollect > 0 ? 'due' : 'muted'}>
            {formatRupees(toCollect)}
          </StatTile>
        </Link>
        <StatTile label={t.today.receivedToday} tone="received">
          {formatRupees(receivedOn(s, today))}
        </StatTile>
      </div>

      {trips.length > 0 && allowed(s, 'sale.record') && (
        <StickyAction>
          <Button block onClick={() => setSelling(true)}>
            {t.today.recordSale}
          </Button>
        </StickyAction>
      )}
      {selling && <SaleSheet trips={trips} onClose={() => setSelling(false)} />}
    </>
  )
}
