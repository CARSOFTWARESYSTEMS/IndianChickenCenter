/** The five sections. P1 shows their structure and empty states; real data arrives with the P3 prototype. */
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { InstallCard } from '../app/InstallCard'
import { usePreferences, useT } from '../app/preferences'
import {
  DEFAULT_SETTINGS,
  formatRupees,
  multiplyExact,
  normalizeIndianMobile,
  normalizeVehicleNumber,
  parseLitres,
  parsePricePerLitre,
  toExactPaise,
} from '../domain'
import { Button, ButtonLink } from '../ui/Button'
import { Field, Stepper, type Step } from '../ui/controls'
import { Amount, Card, EmptyState, PageHeader, StatTile } from '../ui/primitives'
import { Sheet } from '../ui/Sheet'

function useDateLabel(): string {
  const { language } = usePreferences()
  return new Intl.DateTimeFormat(language === 'kn' ? 'kn-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(new Date())
}

/** Business name and place, shown on phones where there is no sidebar. */
function BrandLine() {
  return (
    <p className="pt-3 text-sub text-ink-2 md:hidden">
      <span className="font-semibold text-ink">{DEFAULT_SETTINGS.businessName}</span> · {DEFAULT_SETTINGS.shopLocation.label}
    </p>
  )
}

export function TodayPage() {
  const t = useT()
  const date = useDateLabel()
  return (
    <>
      <BrandLine />
      <PageHeader title={t.tabs.today} subtitle={date} />
      <InstallCard dismissible />
      <Card className="mt-4">
        <EmptyState
          icon="trip"
          message={t.today.noTrip}
          action={
            <ButtonLink to="/trip?start=1" block>
              {t.today.startTrip}
            </ButtonLink>
          }
        />
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatTile label={t.today.toCollect}>{formatRupees(0)}</StatTile>
        <StatTile label={t.today.receivedToday}>{formatRupees(0)}</StatTile>
      </div>
    </>
  )
}

const STEP_KEYS = ['start', 'load', 'orders', 'deliver', 'expenses', 'close'] as const

export function TripPage() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const open = params.get('start') === '1'
  const setOpen = (value: boolean) => setParams(value ? { start: '1' } : {}, { replace: true })
  const steps: Step[] = STEP_KEYS.map((key, i) => ({ key, label: t.trip.steps[key], state: i === 0 ? 'current' : 'todo' }))
  return (
    <>
      <PageHeader title={t.tabs.trip} subtitle={t.trip.noTrip} />
      <div className="mt-2">
        <Stepper steps={steps} />
      </div>
      <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] mt-6 md:bottom-6">
        <Button block onClick={() => setOpen(true)}>
          {t.today.startTrip}
        </Button>
      </div>
      <StartTripSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** Starting Point (C-TXT L11–15): vehicle, litres and today's diesel price, with the fuel cost worked out live. */
function StartTripSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const [vehicle, setVehicle] = useState('')
  const [vehicleTouched, setVehicleTouched] = useState(false)
  const [litres, setLitres] = useState('')
  const [price, setPrice] = useState('91')

  const vehicleResult = vehicle.trim() ? normalizeVehicleNumber(vehicle) : null
  const ml = parseLitres(litres)
  const perLitre = parsePricePerLitre(price)
  const exact = ml.ok && perLitre.ok ? multiplyExact(ml.value, perLitre.value) : null
  const cost = exact === null ? null : toExactPaise(exact)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.trip.steps.start}
      footer={
        <>
          <Button block disabled>
            {t.common.save}
          </Button>
          <p className="mt-2 text-center text-caption text-ink-2">{t.common.saveLater}</p>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label={t.trip.vehicleNumber}
          autoCapitalize="characters"
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
          onBlur={() => setVehicleTouched(true)}
          hint={vehicleResult?.ok ? vehicleResult.value : t.trip.vehicleHint}
          error={vehicleTouched && vehicleResult && !vehicleResult.ok ? t.common.invalidVehicle : undefined}
        />
        <Field label={t.trip.litres} inputMode="decimal" suffix="L" value={litres} onChange={(e) => setLitres(e.target.value)} />
        <Field
          label={t.trip.pricePerLitre}
          inputMode="decimal"
          suffix="₹/L"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <div className="rounded-xl bg-card p-4 text-center" aria-live="polite">
          <div className="text-sub text-ink-2">{t.trip.fuelCost}</div>
          <Amount paise={cost ?? 0} size="key" tone={cost === null ? 'muted' : 'neutral'} />
        </div>
      </div>
    </Sheet>
  )
}

export function CustomersPage() {
  const t = useT()
  const [params] = useSearchParams()
  const search = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (params.get('focus') === 'search') search.current?.focus()
  }, [params])

  return (
    <>
      <PageHeader
        title={t.tabs.customers}
        action={
          <Button variant="plain" onClick={() => setAdding(true)} aria-label={t.customers.add} icon="plus">
            <span className="sr-only md:not-sr-only">{t.customers.add}</span>
          </Button>
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
      <Card className="mt-4">
        <EmptyState
          icon="customers"
          message={t.customers.empty}
          action={
            <Button block variant="secondary" onClick={() => setAdding(true)}>
              {t.customers.add}
            </Button>
          }
        />
      </Card>
      <AddCustomerSheet open={adding} onClose={() => setAdding(false)} />
    </>
  )
}

/** Customer record (C-TXT L62): shop name, name, contact number. */
function AddCustomerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const [shop, setShop] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)
  const phoneResult = phone.trim() ? normalizeIndianMobile(phone) : null
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.customers.add}
      footer={
        <>
          <Button block disabled>
            {t.common.save}
          </Button>
          <p className="mt-2 text-center text-caption text-ink-2">{t.common.saveLater}</p>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t.customers.shopName} value={shop} onChange={(e) => setShop(e.target.value)} />
        <Field label={t.customers.name} value={name} onChange={(e) => setName(e.target.value)} />
        <Field
          label={t.customers.phone}
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => setPhoneTouched(true)}
          error={phoneTouched && phoneResult && !phoneResult.ok ? phoneResult.error.message : undefined}
        />
      </div>
    </Sheet>
  )
}

export function LedgerPage() {
  const t = useT()
  return (
    <>
      <PageHeader title={t.tabs.ledger} />
      <Card className="mt-2">
        <EmptyState icon="ledger" message={t.ledger.empty} />
      </Card>
    </>
  )
}
