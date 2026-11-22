/** Trip list and the trip screen: six steps in the owner's order, each with its entries, total and next action. */
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useOnline } from '../app/hooks'
import { useT } from '../app/preferences'
import { useToast } from '../app/toast'
import { errorText, fill } from '../i18n/labels'
import {
  formatIndianDate,
  formatKg,
  formatLitres,
  formatRatePerKg,
  formatRupees,
  type LedgerEntry,
  type Trip,
  type TripEvent,
} from '../domain'
import { finishTrip, reverseLedgerEntry, reverseTripEvent } from '../store/commands'
import {
  allowed,
  customerById,
  reversedIds,
  reversedTripEventIds,
  tripById,
  tripProfitOf,
  tripSummaryOf,
  visibleTrips,
} from '../store/selectors'
import { dispatch, useAppState } from '../store/store'
import { StickyAction } from '../ui/StickyAction'
import { Button } from '../ui/Button'
import { Stepper, type Step } from '../ui/controls'
import { Amount, Card, EmptyState, PageHeader, Pill, Row, Section, StatTile } from '../ui/primitives'
import { useToday } from './shared'
import {
  ExpenseSheet,
  FuelSheet,
  LoadingSheet,
  OrderSheet,
  RateSheet,
  ReverseSheet,
  SaleSheet,
  ShopSaleSheet,
  StartTripSheet,
  WastageSheet,
} from './tripSheets'

export function TripsPage() {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const trips = visibleTrips(s)
  const open = trips.filter((tr) => tr.status === 'OPEN')
  const closed = trips.filter((tr) => tr.status === 'CLOSED').slice(0, 10)
  const canStart = allowed(s, 'trip.open')
  const showProfit = allowed(s, 'profit.view')
  const starting = params.get('start') === '1'

  // Keyboard shortcut N (/trip?sheet=sale): go straight to today's only open trip.
  useEffect(() => {
    if (params.get('sheet') !== 'sale') return
    const todays = open.filter((tr) => tr.date === today)
    if (todays.length === 1 && todays[0]) navigate(`/trip/${todays[0].id}?sheet=sale`, { replace: true })
  }, [params, open, today, navigate])

  return (
    <>
      <PageHeader
        title={t.tabs.trip}
        action={
          canStart ? (
            <Button variant="secondary" icon="plus" onClick={() => setParams({ start: '1' }, { replace: true })}>
              {t.today.startTrip}
            </Button>
          ) : undefined
        }
      />
      {open.length === 0 ? (
        <Card className="mt-2">
          <EmptyState
            icon="trip"
            message={t.trip.noTrip}
            action={
              canStart ? (
                <Button block onClick={() => setParams({ start: '1' }, { replace: true })}>
                  {t.today.startTrip}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Section header={t.trip.open}>
          {open.map((tr) => {
            const sum = tripSummaryOf(s, tr)
            return (
              <Row
                key={tr.id}
                icon="trip"
                to={`/trip/${tr.id}`}
                title={tr.vehicleNumber}
                subtitle={`${formatIndianDate(tr.date)} · ${tr.driverName ?? ''}`}
                value={`${t.today.left} ${formatKg(sum.remainingGrams)}`}
              />
            )
          })}
        </Section>
      )}
      {closed.length > 0 && (
        <Section header={t.trip.recent}>
          {closed.map((tr) => {
            const profit = tripProfitOf(s, tr)
            return (
              <Row
                key={tr.id}
                to={`/trip/${tr.id}`}
                title={`${formatIndianDate(tr.date)} · ${tr.vehicleNumber}`}
                subtitle={tr.driverName}
                value={showProfit ? <Amount paise={profit.option2.profit} tone={profit.option2.profit >= 0 ? 'received' : 'danger'} /> : formatKg(tr.closeSummary?.soldGrams ?? 0)}
              />
            )
          })}
        </Section>
      )}
      {starting && <StartTripSheet onClose={() => setParams({}, { replace: true })} />}
    </>
  )
}

type SheetKind = 'fuel' | 'load' | 'order' | 'sale' | 'expense' | 'wastage' | 'shop' | 'rate'
type Reversal = { title: string; lines: string[]; run: (reason: string) => ReturnType<typeof dispatch<void>> }

export function TripDetailPage() {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const online = useOnline()
  const toast = useToast()
  const { tripId } = useParams()
  const [params, setParams] = useSearchParams()
  const [reversal, setReversal] = useState<Reversal>()
  const [closeError, setCloseError] = useState<string>()
  const trip = tripById(s, tripId)

  if (!trip) {
    return (
      <>
        <PageHeader title={t.tabs.trip} back={{ to: '/trip', label: t.tabs.trip }} />
        <Card>
          <EmptyState icon="trip" message={t.trip.notFound} />
        </Card>
      </>
    )
  }

  const sheet = params.get('sheet') as SheetKind | null
  const openSheet = (kind: SheetKind) => setParams({ sheet: kind }, { replace: true })
  const closeSheet = () => setParams({}, { replace: true })

  const summary = tripSummaryOf(s, trip)
  const profit = tripProfitOf(s, trip)
  const isOpen = trip.status === 'OPEN'
  const can = (c: Parameters<typeof allowed>[1]) => isOpen && allowed(s, c)
  const showMoney = allowed(s, 'profit.view')
  const showPurchase = allowed(s, 'purchase.view')
  const mayReverse = can('entry.reverse')
  const reversedEvents = reversedTripEventIds(s)
  const reversedEntries = reversedIds(s)
  const name = (id: string) => customerById(s, id)?.shopName ?? id
  const payments = s.ledger.filter((e): e is Extract<LedgerEntry, { type: 'PAYMENT' }> => e.type === 'PAYMENT' && e.tripId === trip.id)
  const ownEvents = s.tripEvents.filter((e) => e.tripId === trip.id && e.type !== 'REVERSAL')

  const reverseEvent = (e: TripEvent, line: string) =>
    mayReverse && !reversedEvents.has(e.id)
      ? () => setReversal({ title: t.trip.reverse, lines: [line], run: (reason) => dispatch(reverseTripEvent(e.id, reason, today)) })
      : undefined
  const reverseEntry = (e: LedgerEntry, line: string) =>
    mayReverse && !reversedEntries.has(e.id)
      ? () => setReversal({ title: t.customers.reverseEntry, lines: [line], run: (reason) => dispatch(reverseLedgerEntry(e.id, reason, today)) })
      : undefined

  const steps: Step[] = [
    { key: 'start', label: t.trip.steps.start, total: summary.fuelPaise ? formatRupees(summary.fuelPaise) : undefined, state: summary.fuel.length ? 'done' : 'todo' },
    { key: 'load', label: t.trip.steps.load, total: summary.loadedGrams ? formatKg(summary.loadedGrams) : undefined, state: summary.loadedGrams ? 'done' : 'todo' },
    { key: 'orders', label: t.trip.steps.orders, total: summary.orders.length ? String(summary.orders.length) : undefined, state: summary.orders.length ? 'done' : 'todo' },
    { key: 'deliver', label: t.trip.steps.deliver, total: summary.soldGrams ? formatKg(summary.soldGrams) : undefined, state: summary.sales.length ? 'done' : 'todo' },
    { key: 'expenses', label: t.trip.steps.expenses, total: summary.operatingPaise ? formatRupees(summary.operatingPaise) : undefined, state: summary.expenses.length ? 'done' : 'todo' },
    { key: 'close', label: t.trip.steps.close, total: isOpen ? undefined : showMoney ? formatRupees(profit.option2.profit) : t.trip.closed, state: isOpen ? 'todo' : 'done' },
  ]
  const firstTodo = steps.findIndex((st) => st.state === 'todo')
  if (isOpen && firstTodo >= 0) steps[firstTodo] = { ...(steps[firstTodo] as Step), state: 'current' }

  // The one primary action: the next thing to do on this trip.
  let primary: { label: string; onClick: () => void } | undefined
  if (isOpen) {
    if (!summary.fuel.length && allowed(s, 'trip.record')) primary = { label: t.trip.addFuel, onClick: () => openSheet('fuel') }
    else if (!summary.loadedGrams && allowed(s, 'purchase.record')) primary = { label: t.trip.addLoading, onClick: () => openSheet('load') }
    else if (summary.remainingGrams > 0 && allowed(s, 'sale.record')) primary = { label: t.trip.recordSale, onClick: () => openSheet('sale') }
    else if (summary.remainingGrams === 0 && summary.loadedGrams > 0 && allowed(s, 'trip.close'))
      primary = {
        label: t.trip.closeTrip,
        onClick: () => {
          const r = dispatch(finishTrip(trip.id, today, online))
          if (r.ok) toast(t.common.saved)
          else setCloseError(errorText(t, r.error))
        },
      }
  }

  const addButton = (label: string, kind: SheetKind, capability: Parameters<typeof allowed>[1]) =>
    can(capability) ? (
      <Button variant="plain" icon="plus" onClick={() => openSheet(kind)}>
        {label}
      </Button>
    ) : undefined

  return (
    <>
      <PageHeader
        title={trip.vehicleNumber}
        subtitle={`${formatIndianDate(trip.date)}${trip.driverName ? ` · ${trip.driverName}` : ''}`}
        back={{ to: '/trip', label: t.tabs.trip }}
        action={<Pill tone={isOpen ? 'accent' : 'muted'}>{isOpen ? t.trip.open : t.trip.closed}</Pill>}
      />
      {!isOpen && <p className="mb-2 text-sub text-ink-2">{t.trip.viewOnly}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t.today.loaded}>{formatKg(summary.loadedGrams)}</StatTile>
        <StatTile label={t.today.sold}>{formatKg(summary.soldGrams)}</StatTile>
        <StatTile label={t.today.left} tone={summary.remainingGrams < 0 ? 'danger' : 'neutral'}>
          {formatKg(summary.remainingGrams)}
        </StatTile>
        <StatTile label={t.today.wastage}>{formatKg(summary.wastageGrams)}</StatTile>
        {showMoney && (
          <>
            <StatTile label={t.today.expenses}>{formatRupees(summary.operatingPaise)}</StatTile>
            <StatTile label={isOpen ? `${t.today.profit} · ${t.status.provisional}` : t.today.profit} tone={profit.option2.profit >= 0 ? 'received' : 'danger'}>
              {formatRupees(profit.option2.profit)}
            </StatTile>
          </>
        )}
      </div>

      <Card className="mt-3 flex items-center justify-between gap-3 py-3">
        <div>
          <p className="text-sub text-ink-2">{t.trip.defaultRate}</p>
          <p className="num text-title font-semibold">{formatRatePerKg(summary.defaultSaleRatePaisePerKg ?? 0)}</p>
        </div>
        {can('trip.setDefaultRate') && (
          <Button variant="secondary" onClick={() => openSheet('rate')}>
            {t.trip.changeRate}
          </Button>
        )}
      </Card>

      <div className="mt-4">
        <Stepper steps={steps} />
      </div>

      <Section header={`1 · ${t.trip.steps.start}`} action={addButton(t.trip.addFuel, 'fuel', 'trip.record')}>
        {summary.fuel.length === 0 && <EmptyLine />}
        {ownEvents
          .filter((e): e is Extract<TripEvent, { type: 'FUEL' }> => e.type === 'FUEL')
          .map((e) => {
            const line = `${formatLitres(e.millilitres)} × ${formatRupees(e.pricePaisePerLitre)}/L`
            return <Row key={e.id} title={t.trip.fuel} subtitle={line} value={formatRupees(e.amount)} struck={reversedEvents.has(e.id)} onClick={reverseEvent(e, `${line} = ${formatRupees(e.amount)}`)} />
          })}
      </Section>

      <Section header={`2 · ${t.trip.steps.load}`} action={addButton(t.trip.addLoading, 'load', 'purchase.record')}>
        {summary.loadings.length === 0 && <EmptyLine />}
        {ownEvents
          .filter((e): e is Extract<TripEvent, { type: 'LOADING' }> => e.type === 'LOADING')
          .map((e) => {
            const line = showPurchase ? `${formatKg(e.grams)} × ${formatRatePerKg(e.ratePaisePerKg)}` : formatKg(e.grams)
            return (
              <Row
                key={e.id}
                title={e.loadingPoint ?? t.trip.loadingPoint}
                subtitle={line}
                value={showPurchase ? formatRupees(e.amount) : undefined}
                struck={reversedEvents.has(e.id)}
                onClick={reverseEvent(e, line)}
              />
            )
          })}
      </Section>

      <Section header={`3 · ${t.trip.steps.orders}`} action={addButton(t.trip.takeOrder, 'order', 'trip.record')}>
        {summary.orders.length === 0 && <EmptyLine />}
        {summary.orders.map((o) => (
          <Row
            key={o.customerId}
            title={name(o.customerId)}
            subtitle={`${t.trip.ordered} ${formatKg(o.orderedGrams)} · ${t.trip.delivered} ${formatKg(o.deliveredGrams)}`}
            value={<Pill tone={o.status === 'DONE' ? 'received' : o.status === 'PART' ? 'due' : 'neutral'}>{t.status[o.status === 'DONE' ? 'done' : o.status === 'PART' ? 'part' : 'open']}</Pill>}
          />
        ))}
      </Section>

      <Section header={`4 · ${t.trip.steps.deliver}`} action={addButton(t.trip.recordSale, 'sale', 'sale.record')}>
        {s.ledger.filter((e) => e.type === 'SALE' && e.tripId === trip.id).length === 0 && <EmptyLine />}
        {s.ledger
          .filter((e): e is Extract<LedgerEntry, { type: 'SALE' }> => e.type === 'SALE' && e.tripId === trip.id)
          .map((e) => {
            const line = `${formatKg(e.grams)} × ${formatRatePerKg(e.ratePaisePerKg)}`
            return (
              <Row
                key={e.id}
                title={name(e.customerId)}
                subtitle={line}
                value={formatRupees(e.amount)}
                struck={reversedEntries.has(e.id)}
                onClick={reverseEntry(e, `${name(e.customerId)} · ${line} = ${formatRupees(e.amount)}`)}
              />
            )
          })}
      </Section>
      {payments.length > 0 && (
        <Section header={t.trip.collected}>
          {payments.map((e) => (
            <Row
              key={e.id}
              title={name(e.customerId)}
              subtitle={t.methods[e.method]}
              value={<Amount paise={e.amount} tone="received" />}
              struck={reversedEntries.has(e.id)}
              onClick={reverseEntry(e, `${name(e.customerId)} · ${t.methods[e.method]} ${formatRupees(e.amount)}`)}
            />
          ))}
        </Section>
      )}

      <Section header={`5 · ${t.trip.steps.expenses}`} action={addButton(t.trip.addExpense, 'expense', 'trip.record')}>
        {summary.fuelPaise > 0 && <Row title={t.trip.fuel} subtitle={t.trip.steps.start} value={formatRupees(summary.fuelPaise)} />}
        {summary.fuelPaise === 0 && summary.expenses.length === 0 && <EmptyLine />}
        {ownEvents
          .filter((e): e is Extract<TripEvent, { type: 'EXPENSE' }> => e.type === 'EXPENSE')
          .map((e) => {
            const title = e.slot ? `${t.trip.slots[e.slot]}${e.workerName ? ` · ${e.workerName}` : ''}` : t.trip.categories[e.category]
            return (
              <Row
                key={e.id}
                title={title}
                subtitle={e.slot ? t.trip.categories.LABOUR : undefined}
                value={formatRupees(e.amount)}
                struck={reversedEvents.has(e.id)}
                onClick={reverseEvent(e, `${title} ${formatRupees(e.amount)}`)}
              />
            )
          })}
      </Section>

      <Section header={`6 · ${t.trip.steps.close}`} footer={isOpen && summary.remainingGrams !== 0 ? t.trip.closeHint : undefined}>
        <Row title={t.trip.leftOnVehicle} value={<span className={summary.remainingGrams < 0 ? 'text-danger' : ''}>{formatKg(summary.remainingGrams)}</span>} />
        {ownEvents
          .filter((e): e is Extract<TripEvent, { type: 'SHOP_SALE' | 'WASTAGE' }> => e.type === 'SHOP_SALE' || e.type === 'WASTAGE')
          .map((e) => {
            const line = e.type === 'SHOP_SALE' ? `${formatKg(e.grams)} × ${formatRatePerKg(e.ratePaisePerKg)}` : formatKg(e.grams)
            return (
              <Row
                key={e.id}
                title={e.type === 'SHOP_SALE' ? t.trip.shopSale : t.trip.wastageLine}
                subtitle={line}
                value={e.type === 'SHOP_SALE' ? formatRupees(e.amount) : undefined}
                struck={reversedEvents.has(e.id)}
                onClick={reverseEvent(e, line)}
              />
            )
          })}
        {isOpen && (can('sale.record') || can('trip.record')) && (
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {can('sale.record') && (
              <Button variant="secondary" onClick={() => openSheet('shop')}>
                {t.trip.sellAtShop}
              </Button>
            )}
            {can('trip.record') && (
              <Button variant="secondary" onClick={() => openSheet('wastage')}>
                {t.trip.recordWastage}
              </Button>
            )}
          </div>
        )}
      </Section>

      {showMoney && <ProfitOptions trip={trip} />}

      {closeError && (
        <p role="alert" className="mt-4 text-sub font-medium text-danger">
          {closeError}
        </p>
      )}
      {primary && (
        <StickyAction>
          <Button block onClick={primary.onClick}>
            {primary.label}
          </Button>
        </StickyAction>
      )}

      {sheet === 'fuel' && <FuelSheet trip={trip} onClose={closeSheet} />}
      {sheet === 'load' && <LoadingSheet trip={trip} onClose={closeSheet} />}
      {sheet === 'order' && <OrderSheet trip={trip} onClose={closeSheet} />}
      {sheet === 'sale' && isOpen && <SaleSheet trips={[trip]} onClose={closeSheet} />}
      {sheet === 'expense' && <ExpenseSheet trip={trip} onClose={closeSheet} />}
      {sheet === 'wastage' && <WastageSheet trip={trip} onClose={closeSheet} />}
      {sheet === 'shop' && <ShopSaleSheet trip={trip} onClose={closeSheet} />}
      {sheet === 'rate' && <RateSheet trip={trip} onClose={closeSheet} />}
      {reversal && <ReverseSheet title={reversal.title} lines={reversal.lines} onReverse={reversal.run} onClose={() => setReversal(undefined)} />}
    </>
  )
}

function EmptyLine() {
  return <p className="px-4 py-3 text-sub text-ink-2">—</p>
}

function MoneyLine({ label, paise, strong = false }: { label: ReactNode; paise: number | undefined; strong?: boolean }) {
  return (
    <p className={`flex justify-between gap-3 py-1 ${strong ? 'mt-1 border-t border-line pt-2 text-body font-semibold' : 'text-sub'}`}>
      <span>{label}</span>
      {paise !== undefined && <span className="num">{formatRupees(paise)}</span>}
    </p>
  )
}

/** Both of the owner's profit methods side by side, every step shown, with the match check (C-TXT L46–57). */
function ProfitOptions({ trip }: { trip: Trip }) {
  const t = useT()
  const s = useAppState()
  const p = tripProfitOf(s, trip)
  const o1 = p.option1
  return (
    <section className="mt-6">
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <h3 className="mb-1 text-caption font-medium uppercase tracking-wide text-ink-2">{t.trip.option1}</h3>
          {o1 ? (
            <>
              <MoneyLine label={fill(t.trip.fullLoadAt, { rate: formatRatePerKg(o1.valuationRatePaisePerKg) })} paise={o1.fullLoadValue} />
              <MoneyLine label={t.trip.lessExpensesWastage} paise={o1.totalExpenses} />
              <MoneyLine label={t.trip.afterExpenses} paise={o1.afterExpenses} />
              <MoneyLine label={t.trip.lessPurchase} paise={o1.purchases} />
              <MoneyLine label={t.today.profit} paise={o1.profit} strong />
            </>
          ) : (
            <p className="text-sub text-ink-2">—</p>
          )}
        </Card>
        <Card>
          <h3 className="mb-1 text-caption font-medium uppercase tracking-wide text-ink-2">{t.trip.option2}</h3>
          <MoneyLine label={t.trip.soldAfterWastage} paise={p.option2.sales} />
          <MoneyLine label={t.trip.lessExpenses} paise={p.option2.operating} />
          <MoneyLine label={t.trip.afterExpenses} paise={p.option2.afterExpenses} />
          <MoneyLine label={t.trip.lessPurchase} paise={p.option2.purchases} />
          <MoneyLine label={t.today.profit} paise={p.option2.profit} strong />
        </Card>
      </div>
      <p className={`mt-2 flex flex-wrap items-center gap-2 px-1 text-sub font-semibold ${p.methodsMatch === false ? 'text-due' : 'text-received'}`}>
        {p.methodsMatch === null ? '' : p.methodsMatch ? t.trip.bothMatch : fill(t.trip.differBy, { amount: formatRupees(p.differencePaise ?? 0) })}
        {p.provisional && <Pill tone="muted">{t.status.provisional}</Pill>}
      </p>
    </section>
  )
}
