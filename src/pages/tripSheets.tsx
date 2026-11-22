/**
 * The trip's entry sheets, one per step: Starting Point, Loading, Orders, Sale, Expenses, Shop sale, Wastage,
 * Change rate, and Reverse. Each makes its id when it opens (plan §5) and saves through the store's commands.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useT } from '../app/preferences'
import { useToast } from '../app/toast'
import { errorText, fill } from '../i18n/labels'
import {
  formatKg,
  formatRupees,
  makeDefaultRate,
  makeExpense,
  makeLoading,
  makeOrder,
  makeWastage,
  multiplyExact,
  normalizeVehicleNumber,
  parseKg,
  parseRatePerKg,
  parseRupees,
  postAmount,
  toExactPaise,
  type DomainError,
  type ExpenseCategory,
  type LabourSlot,
  type PaymentMethod,
  type Result,
  type Trip,
} from '../domain'
import { tripIdFor } from '../data/docs'
import { newId } from '../store/ids'
import { addFuel, addTripEvent, recordSale, shopSale, startTrip } from '../store/commands'
import { allowed, openTripsToday, tripSummaryOf } from '../store/selectors'
import { dispatch, getState, useAppState } from '../store/store'
import { Button } from '../ui/Button'
import { Chips, Field, Segmented } from '../ui/controls'
import { FormSheet } from '../ui/FormSheet'
import { Amount } from '../ui/primitives'
import { CustomerPicker, errorOf, kgText, rupeesText, useFuelFields, useToday, valueOf } from './shared'

type Close = () => void

/** Saves through the store; on success shows "Saved" and closes, otherwise returns the error text for the sheet. */
function useSave(onClose: Close) {
  const t = useT()
  const toast = useToast()
  const [error, setError] = useState<string>()
  const [lastError, setLastError] = useState<DomainError>()
  const save = <T,>(result: Result<T>, message = t.common.saved): boolean => {
    if (!result.ok) {
      setError(errorText(t, result.error))
      setLastError(result.error)
      return false
    }
    toast(message)
    onClose()
    return true
  }
  const clear = () => {
    setError(undefined)
    setLastError(undefined)
  }
  return { error, lastError, save, clear }
}

const PAYMENT_OPTIONS = (t: ReturnType<typeof useT>) =>
  (['CASH', 'UPI', 'BANK_TRANSFER'] as const).map((m) => ({ value: m, label: t.methods[m] }))

// ---------------------------------------------------------------------------

export function StartTripSheet({ onClose }: { onClose: Close }) {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const navigate = useNavigate()
  const { error, save } = useSave(onClose)
  const [fuelId] = useState(() => newId('fuel'))
  const busy = new Set(s.trips.filter((tr) => tr.date === today).map((tr) => tr.vehicleNumber))
  const [vehicle, setVehicle] = useState(() => s.vehicles.find((v) => !busy.has(v)) ?? '')
  const drivers = s.users.filter((u) => u.role === 'driver')
  const [driverId, setDriverId] = useState<string | undefined>(drivers[0]?.id)
  const [driverName, setDriverName] = useState(drivers[0]?.name ?? '')
  const [rate, setRate] = useState(rupeesText(s.settings.defaultSaleRatePaisePerKg))
  const fuel = useFuelFields(s.settings.dieselPricePaisePerLitre)

  const vehicleOk = vehicle.trim() !== '' && normalizeVehicleNumber(vehicle).ok
  const ratePaise = valueOf(rate, parseRatePerKg)
  const fuelInput = fuel.input(fuelId)
  const canSave = vehicleOk && ratePaise !== undefined && (!fuel.filled || fuelInput !== undefined)

  const onSave = () => {
    const normalized = normalizeVehicleNumber(vehicle)
    if (ratePaise === undefined || !normalized.ok) return
    const r = dispatch(
      startTrip({
        // One trip per vehicle per day (U-06): the id says which, so the cloud refuses a second one.
        id: tripIdFor(today, normalized.value),
        date: today,
        vehicleNumber: vehicle,
        defaultSaleRatePaisePerKg: ratePaise,
        ...(driverId ? { driverId } : {}),
        ...(driverName.trim() ? { driverName: driverName.trim() } : {}),
        ...(fuelInput ? { fuel: fuelInput } : {}),
      }),
    )
    if (save(r) && r.ok) navigate(`/trip/${r.value}`)
  }

  return (
    <FormSheet title={t.trip.steps.start} onClose={onClose} onSave={onSave} canSave={canSave} error={error} saveLabel={t.today.startTrip}>
      <div>
        <p className="mb-1.5 px-1 text-sub text-ink-2">{t.trip.vehicleNumber}</p>
        <Chips
          label={t.trip.vehicleNumber}
          value={vehicle}
          onChange={setVehicle}
          options={s.vehicles.map((v) => ({ value: v, label: v, disabled: busy.has(v) }))}
        />
      </div>
      <Field
        label={t.trip.vehicleNumber}
        hideLabel
        autoCapitalize="characters"
        placeholder={t.trip.vehicleHint}
        value={vehicle}
        onChange={(e) => setVehicle(e.target.value)}
        error={vehicle.trim() && !vehicleOk ? t.common.invalidVehicle : undefined}
      />
      <div>
        <p className="mb-1.5 px-1 text-sub text-ink-2">{t.roles.driver}</p>
        <Chips
          label={t.roles.driver}
          value={driverId}
          onChange={(id2) => {
            setDriverId(id2)
            setDriverName(drivers.find((d) => d.id === id2)?.name ?? '')
          }}
          options={drivers.map((d) => ({ value: d.id, label: d.name }))}
        />
      </div>
      <Field
        label={t.trip.driverName}
        value={driverName}
        onChange={(e) => {
          setDriverName(e.target.value)
          setDriverId(undefined)
        }}
      />
      <Field
        label={t.trip.defaultRate}
        inputMode="decimal"
        suffix="₹/kg"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        hint={t.trip.defaultRateHint}
        error={errorOf(rate, parseRatePerKg)}
      />
      {fuel.fields}
    </FormSheet>
  )
}

export function FuelSheet({ trip, onClose }: { trip: Trip; onClose: Close }) {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const { error, save } = useSave(onClose)
  const [id] = useState(() => newId('fuel'))
  const fuel = useFuelFields(s.settings.dieselPricePaisePerLitre)
  const input = fuel.input(id)
  return (
    <FormSheet title={t.trip.addFuel} onClose={onClose} onSave={() => input && save(dispatch(addFuel(trip.id, today, input)))} canSave={!!input} error={error}>
      {fuel.fields}
    </FormSheet>
  )
}

export function LoadingSheet({ trip, onClose }: { trip: Trip; onClose: Close }) {
  const t = useT()
  const today = useToday()
  const { error, save } = useSave(onClose)
  const [id] = useState(() => newId('load'))
  const [point, setPoint] = useState('')
  const [weight, setWeight] = useState('')
  const [rate, setRate] = useState('')
  const grams = valueOf(weight, parseKg)
  const rateP = valueOf(rate, parseRatePerKg)
  const exact = grams !== undefined && rateP !== undefined ? multiplyExact(grams, rateP) : null
  const onSave = () => {
    if (grams === undefined || rateP === undefined) return
    const event = makeLoading({
      id,
      tripId: trip.id,
      date: today,
      createdBy: getState().actorId,
      grams,
      ratePaisePerKg: rateP,
      ...(point.trim() ? { loadingPoint: point.trim() } : {}),
    })
    save(event.ok ? dispatch(addTripEvent(event.value)) : event)
  }
  return (
    <FormSheet title={t.trip.addLoading} onClose={onClose} onSave={onSave} canSave={exact !== null} error={error}>
      <Field label={t.trip.loadingPoint} value={point} onChange={(e) => setPoint(e.target.value)} />
      <Field label={t.trip.weightKg} inputMode="decimal" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} error={errorOf(weight, parseKg)} />
      <Field label={t.trip.ratePerKg} inputMode="decimal" suffix="₹/kg" value={rate} onChange={(e) => setRate(e.target.value)} error={errorOf(rate, parseRatePerKg)} />
      <LiveAmount paise={exact === null ? undefined : toExactPaise(exact)} />
    </FormSheet>
  )
}

function LiveAmount({ paise, note }: { paise: number | undefined; note?: string | undefined }) {
  const t = useT()
  return (
    <div className="rounded-xl bg-card p-3 text-center" aria-live="polite">
      <div className="text-sub text-ink-2">{t.trip.amount}</div>
      <Amount paise={paise ?? 0} size="key" tone={paise === undefined ? 'muted' : 'neutral'} />
      {note && <div className="text-sub text-ink-2">{note}</div>}
    </div>
  )
}

export function OrderSheet({ trip, onClose }: { trip: Trip; onClose: Close }) {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const { error, save } = useSave(onClose)
  const [id] = useState(() => newId('order'))
  const summary = tripSummaryOf(s, trip)
  const [customerId, setCustomerId] = useState<string>()
  const [weight, setWeight] = useState('')
  const [rate, setRate] = useState(rupeesText(summary.defaultSaleRatePaisePerKg))
  const grams = valueOf(weight, parseKg)
  const rateP = valueOf(rate, parseRatePerKg)
  const onSave = () => {
    if (!customerId || grams === undefined || rateP === undefined) return
    const event = makeOrder({ id, tripId: trip.id, date: today, createdBy: s.actorId, customerId, grams, ratePaisePerKg: rateP })
    save(event.ok ? dispatch(addTripEvent(event.value)) : event)
  }
  return (
    <FormSheet title={t.trip.takeOrder} onClose={onClose} onSave={onSave} canSave={!!customerId && grams !== undefined && rateP !== undefined} error={error}>
      <CustomerPicker value={customerId} onChange={setCustomerId} />
      <Field label={t.trip.weightKg} inputMode="decimal" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} error={errorOf(weight, parseKg)} />
      <Field label={t.trip.ratePerKg} inputMode="decimal" suffix="₹/kg" value={rate} onChange={(e) => setRate(e.target.value)} error={errorOf(rate, parseRatePerKg)} />
    </FormSheet>
  )
}

/** Record sale: customer, kg, rate (trip default; only owner or manager may change it), live amount, optional paid now. */
export function SaleSheet({ trips, presetCustomerId, onClose }: { trips: Trip[]; presetCustomerId?: string; onClose: Close }) {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const { error, lastError, save, clear } = useSave(onClose)
  const [ids] = useState(() => ({ sale: newId('sale'), pay: newId('pay') }))
  const [tripId, setTripId] = useState(trips[0]?.id)
  const trip = trips.find((tr) => tr.id === tripId) ?? trips[0]
  const summary = trip ? tripSummaryOf(s, trip) : undefined
  const mayChangeRate = allowed(s, 'sale.changeRate')
  const [customerId, setCustomerId] = useState(presetCustomerId)
  const [weight, setWeight] = useState('')
  const [rate, setRate] = useState(rupeesText(summary?.defaultSaleRatePaisePerKg))
  const [paid, setPaid] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [reference, setReference] = useState('')

  const grams = valueOf(weight, parseKg)
  const rateP = valueOf(rate, parseRatePerKg)
  const paidP = valueOf(paid, parseRupees)
  const exact = grams !== undefined && rateP !== undefined ? multiplyExact(grams, rateP) : null
  const policy = s.settings.roundingPolicy
  const amount = exact !== null && policy ? postAmount(exact, policy) : undefined
  const exactNote = exact !== null && amount !== undefined && exact !== amount * 1_000 ? `${formatRupees(toExactPaise(exact))} → ${formatRupees(amount)}` : undefined
  const canSave = !!trip && !!customerId && grams !== undefined && rateP !== undefined && (paid.trim() === '' || paidP !== undefined)

  const submit = (oversellConfirmed: boolean) => {
    if (!trip || !customerId || grams === undefined || rateP === undefined) return
    clear()
    const cmd = {
      id: ids.sale,
      customerId,
      date: today,
      createdBy: s.actorId,
      grams,
      ...(mayChangeRate ? { ratePaisePerKg: rateP } : {}),
      oversellConfirmed,
    }
    const paidNow = paidP ? { id: ids.pay, amount: paidP, method, ...(reference.trim() ? { reference: reference.trim() } : {}) } : undefined
    save(dispatch(recordSale(trip.id, cmd, paidNow)))
  }

  const overStock = lastError?.code === 'exceeds_stock'
  return (
    <FormSheet
      title={t.trip.recordSale}
      onClose={onClose}
      onSave={() => submit(false)}
      canSave={canSave}
      error={overStock && summary ? fill(t.trip.overStock, { kg: formatKg(Math.max(0, summary.remainingGrams)) }) : error}
      extraAction={
        overStock && mayChangeRate ? (
          <Button block variant="destructive" onClick={() => submit(true)}>
            {t.trip.sellMoreThanStock}
          </Button>
        ) : undefined
      }
    >
      {trips.length > 1 && (
        <Chips label={t.tabs.trip} value={tripId} onChange={setTripId} options={trips.map((tr) => ({ value: tr.id, label: tr.vehicleNumber }))} />
      )}
      {summary && (
        <p className="px-1 text-sub text-ink-2">
          {t.trip.leftOnVehicle}: <span className="num font-semibold text-ink">{formatKg(summary.remainingGrams)}</span>
        </p>
      )}
      <CustomerPicker value={customerId} onChange={setCustomerId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.trip.weightKg} inputMode="decimal" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} error={errorOf(weight, parseKg)} />
        <Field
          label={t.trip.ratePerKg}
          inputMode="decimal"
          suffix="₹"
          value={rate}
          readOnly={!mayChangeRate}
          onChange={(e) => setRate(e.target.value)}
          error={errorOf(rate, parseRatePerKg)}
        />
      </div>
      {!mayChangeRate && <p className="-mt-2 px-1 text-caption text-ink-2">{t.trip.rateLocked}</p>}
      <LiveAmount paise={amount} note={exactNote} />
      <Field label={t.trip.paidNow} inputMode="decimal" suffix="₹" value={paid} onChange={(e) => setPaid(e.target.value)} error={errorOf(paid, parseRupees)} />
      {paid.trim() !== '' && (
        <>
          <Segmented label={t.trip.method} value={method} onChange={setMethod} options={PAYMENT_OPTIONS(t)} />
          {method !== 'CASH' && <Field label={t.customers.reference} value={reference} onChange={(e) => setReference(e.target.value)} />}
        </>
      )}
    </FormSheet>
  )
}

export function ExpenseSheet({ trip, onClose }: { trip: Trip; onClose: Close }) {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const { error, save } = useSave(onClose)
  const [id] = useState(() => newId('exp'))
  const summary = tripSummaryOf(s, trip)
  const [category, setCategory] = useState<ExpenseCategory>('LABOUR')
  const [labourMode, setLabourMode] = useState<'PER_PERSON' | 'TOTAL'>(summary.labourMode ?? 'PER_PERSON')
  const usedSlots = new Set(summary.expenses.flatMap((e) => (e.slot ? [e.slot] : [])))
  const [slot, setSlot] = useState<LabourSlot | undefined>(
    (['DRIVER', 'LABOUR_1', 'LABOUR_2', 'LABOUR_3', 'LABOUR_4', 'LABOUR_5'] as const).find((sl) => !usedSlots.has(sl)),
  )
  const [worker, setWorker] = useState(slot === 'DRIVER' ? (trip.driverName ?? '') : '')
  const [amount, setAmount] = useState('')
  const paise = valueOf(amount, parseRupees)
  const perPerson = category === 'LABOUR' && labourMode === 'PER_PERSON'

  const onSave = () => {
    if (paise === undefined) return
    const event = makeExpense({
      id,
      tripId: trip.id,
      date: today,
      createdBy: s.actorId,
      category,
      amount: paise,
      ...(perPerson && slot ? { slot } : {}),
      ...(perPerson && worker.trim() ? { workerName: worker.trim() } : {}),
    })
    save(event.ok ? dispatch(addTripEvent(event.value)) : event)
  }

  return (
    <FormSheet title={t.trip.addExpense} onClose={onClose} onSave={onSave} canSave={paise !== undefined && (!perPerson || !!slot)} error={error}>
      <Chips
        label={t.trip.category}
        value={category}
        onChange={setCategory}
        options={(['LABOUR', 'MAINTENANCE', 'FOOD', 'OTHER'] as const).map((c) => ({ value: c, label: t.trip.categories[c] }))}
      />
      {category === 'LABOUR' && (
        <>
          {summary.labourMode === null && (
            <Segmented
              label={t.trip.categories.LABOUR}
              value={labourMode}
              onChange={setLabourMode}
              options={[
                { value: 'PER_PERSON', label: t.trip.perPerson },
                { value: 'TOTAL', label: t.trip.oneTotal },
              ]}
            />
          )}
          {perPerson && (
            <>
              <Chips
                label={t.trip.who}
                value={slot}
                onChange={(sl) => {
                  setSlot(sl)
                  if (sl === 'DRIVER' && !worker) setWorker(trip.driverName ?? '')
                }}
                options={(['DRIVER', 'LABOUR_1', 'LABOUR_2', 'LABOUR_3', 'LABOUR_4', 'LABOUR_5'] as const).map((sl) => ({
                  value: sl,
                  label: t.trip.slots[sl],
                  disabled: usedSlots.has(sl),
                }))}
              />
              <Field label={t.trip.workerName} value={worker} onChange={(e) => setWorker(e.target.value)} />
            </>
          )}
        </>
      )}
      <Field label={t.customers.amountRs} inputMode="decimal" suffix="₹" value={amount} onChange={(e) => setAmount(e.target.value)} error={errorOf(amount, parseRupees)} />
    </FormSheet>
  )
}

export function WastageSheet({ trip, onClose }: { trip: Trip; onClose: Close }) {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const { error, save } = useSave(onClose)
  const [id] = useState(() => newId('wst'))
  const [weight, setWeight] = useState(kgText(tripSummaryOf(s, trip).remainingGrams))
  const grams = valueOf(weight, parseKg)
  const onSave = () => {
    if (grams === undefined) return
    const event = makeWastage({ id, tripId: trip.id, date: today, createdBy: s.actorId, grams })
    save(event.ok ? dispatch(addTripEvent(event.value)) : event)
  }
  return (
    <FormSheet title={t.trip.recordWastage} onClose={onClose} onSave={onSave} canSave={grams !== undefined} error={error}>
      <Field label={t.trip.weightKg} inputMode="decimal" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} error={errorOf(weight, parseKg)} />
    </FormSheet>
  )
}

export function ShopSaleSheet({ trip, onClose }: { trip: Trip; onClose: Close }) {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const { error, save } = useSave(onClose)
  const [id] = useState(() => newId('shop'))
  const summary = tripSummaryOf(s, trip)
  const mayChangeRate = allowed(s, 'sale.changeRate')
  const [weight, setWeight] = useState(kgText(summary.remainingGrams))
  const [rate, setRate] = useState(rupeesText(summary.defaultSaleRatePaisePerKg))
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const grams = valueOf(weight, parseKg)
  const rateP = valueOf(rate, parseRatePerKg)
  const exact = grams !== undefined && rateP !== undefined ? multiplyExact(grams, rateP) : null
  const policy = s.settings.roundingPolicy
  const onSave = () => {
    if (grams === undefined || rateP === undefined) return
    save(dispatch(shopSale(trip.id, { id, date: today, createdBy: s.actorId, grams, method, ...(mayChangeRate ? { ratePaisePerKg: rateP } : {}) })))
  }
  return (
    <FormSheet title={t.trip.sellAtShop} onClose={onClose} onSave={onSave} canSave={exact !== null} error={error}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.trip.weightKg} inputMode="decimal" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} error={errorOf(weight, parseKg)} />
        <Field label={t.trip.ratePerKg} inputMode="decimal" suffix="₹" value={rate} readOnly={!mayChangeRate} onChange={(e) => setRate(e.target.value)} error={errorOf(rate, parseRatePerKg)} />
      </div>
      <LiveAmount paise={exact !== null && policy ? postAmount(exact, policy) : undefined} />
      <Segmented label={t.trip.method} value={method} onChange={setMethod} options={PAYMENT_OPTIONS(t)} />
    </FormSheet>
  )
}

export function RateSheet({ trip, onClose }: { trip: Trip; onClose: Close }) {
  const t = useT()
  const s = useAppState()
  const today = useToday()
  const { error, save } = useSave(onClose)
  const [id] = useState(() => newId('rate'))
  const [rate, setRate] = useState(rupeesText(tripSummaryOf(s, trip).defaultSaleRatePaisePerKg))
  const rateP = valueOf(rate, parseRatePerKg)
  const onSave = () => {
    if (rateP === undefined) return
    const event = makeDefaultRate({ id, tripId: trip.id, date: today, createdBy: s.actorId, ratePaisePerKg: rateP })
    save(event.ok ? dispatch(addTripEvent(event.value)) : event)
  }
  return (
    <FormSheet title={t.trip.changeRate} onClose={onClose} onSave={onSave} canSave={rateP !== undefined} error={error}>
      <Field label={t.trip.newRate} inputMode="decimal" suffix="₹/kg" value={rate} onChange={(e) => setRate(e.target.value)} hint={t.trip.defaultRateHint} error={errorOf(rate, parseRatePerKg)} />
    </FormSheet>
  )
}

/** Shows what is being reversed and asks for a reason; the original stays in the records. */
export function ReverseSheet({
  title,
  lines,
  onReverse,
  onClose,
}: {
  title: string
  lines: string[]
  onReverse: (reason: string) => Result<void>
  onClose: Close
}) {
  const t = useT()
  const { error, save } = useSave(onClose)
  const [reason, setReason] = useState('')
  return (
    <FormSheet
      title={title}
      onClose={onClose}
      onSave={() => save(onReverse(reason))}
      saveLabel={t.trip.reverse}
      saveVariant="destructive"
      error={error}
    >
      <div className="rounded-xl bg-card p-4">
        {lines.map((line) => (
          <p key={line} className="num text-body">
            {line}
          </p>
        ))}
      </div>
      <Field label={t.trip.reason} value={reason} onChange={(e) => setReason(e.target.value)} />
      <p className="px-1 text-caption text-ink-2">{t.customers.reverseHint}</p>
    </FormSheet>
  )
}

/** Open trips today that this person may sell on (for Record sale outside the trip screen). */
export function useSaleTrips(): Trip[] {
  const s = useAppState()
  return openTripsToday(s, useToday())
}
