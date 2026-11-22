/** Living reference for the design system: tokens and every component, in the current language and theme. */
import { useState } from 'react'
import { useT } from '../app/preferences'
import { formatRupees, parseKg, ratePerKg } from '../domain'
import { Button } from '../ui/Button'
import { Field, Segmented, Stepper, SyncStatus } from '../ui/controls'
import { Amount, Card, EmptyState, PageHeader, Pill, Row, Section, StatTile } from '../ui/primitives'
import { Sheet } from '../ui/Sheet'

const SWATCHES = ['canvas', 'card', 'fill', 'ink', 'ink-2', 'line', 'accent', 'accent-soft', 'received', 'due', 'danger'] as const

export function DesignSystemPage() {
  const t = useT()
  const [segment, setSegment] = useState<'a' | 'b' | 'c'>('a')
  const [kgText, setKgText] = useState('63.1')
  const [sheet, setSheet] = useState(false)
  const grams = parseKg(kgText)
  const amount = grams.ok ? Math.round((grams.value * ratePerKg('128')) / 1_000) : null

  return (
    <>
      <PageHeader title={t.more.designSystem} back={{ to: '/more', label: t.more.back }} subtitle="Tokens and components" />

      <Section header="Colour">
        <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4">
          {SWATCHES.map((name) => (
            <div key={name} className="text-caption">
              <div className="h-12 rounded-lg ring-1 ring-line" style={{ background: `var(--ui-${name})` }} />
              <p className="mt-1 text-ink-2">{name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section header="Type">
        <div className="space-y-1 p-4">
          <p className="text-large font-bold">Large title 34</p>
          <p className="text-title font-semibold">Title 22</p>
          <p className="text-body">Body 17 · ಕನ್ನಡ ಪಠ್ಯ</p>
          <p className="text-sub text-ink-2">Secondary 15</p>
          <p className="text-caption text-ink-2">Caption 13</p>
          <Amount paise={6_81_800_00} size="key" />
        </div>
      </Section>

      <Section header="Buttons">
        <div className="space-y-3 p-4">
          <Button block>{t.today.startTrip}</Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon="plus">
              {t.customers.add}
            </Button>
            <Button variant="plain">{t.common.cancel}</Button>
            <Button variant="destructive">Reverse entry</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </div>
        </div>
      </Section>

      <Section header="Amounts and status">
        <Row title="Balance due" value={<Amount paise={10_778_00} tone="due" />} />
        <Row title="Received today" value={<Amount paise={26_000_00} tone="received" />} />
        <div className="flex flex-wrap gap-2 p-4">
          <SyncStatus state="local" />
          <SyncStatus state="syncing" />
          <SyncStatus state="cloud" />
          <SyncStatus state="attention" />
          <Pill tone="muted">{t.status.provisional}</Pill>
          <Pill tone="neutral">{t.status.open}</Pill>
          <Pill tone="due">{t.status.part}</Pill>
          <Pill tone="received">{t.status.done}</Pill>
        </div>
      </Section>

      <Section header="Stat tiles">
        <div className="grid grid-cols-2 gap-3 bg-canvas p-1 sm:grid-cols-3">
          <StatTile label={t.today.loaded}>5,000 kg</StatTile>
          <StatTile label={t.today.sold}>4,870 kg</StatTile>
          <StatTile label={t.today.wastage}>130 kg</StatTile>
          <StatTile label={t.today.expenses}>{formatRupees(14_000_00)}</StatTile>
          <StatTile label={t.today.profit}>{formatRupees(67_800_00)}</StatTile>
          <StatTile label={t.today.toCollect}>{formatRupees(10_778_00)}</StatTile>
        </div>
      </Section>

      <Section header="Stepper">
        <div className="bg-canvas p-1">
          <Stepper
            steps={[
              { key: 'start', label: t.trip.steps.start, state: 'done', total: formatRupees(8_000_00) },
              { key: 'load', label: t.trip.steps.load, state: 'done', total: '5,000 kg' },
              { key: 'orders', label: t.trip.steps.orders, state: 'current' },
              { key: 'deliver', label: t.trip.steps.deliver, state: 'todo' },
            ]}
          />
        </div>
      </Section>

      <Section header="Inputs">
        <div className="space-y-4 bg-canvas p-3">
          <Segmented
            label="Example"
            value={segment}
            onChange={setSegment}
            options={[
              { value: 'a', label: 'English' },
              { value: 'b', label: 'ಕನ್ನಡ' },
              { value: 'c', label: 'Both' },
            ]}
          />
          <Field
            label="Weight × ₹128/kg"
            inputMode="decimal"
            suffix="kg"
            value={kgText}
            onChange={(e) => setKgText(e.target.value)}
            hint={amount === null ? undefined : `= ${formatRupees(amount)}`}
            error={grams.ok || kgText === '' ? undefined : grams.error.message}
          />
          <Field label={t.trip.vehicleNumber} error={t.common.invalidVehicle} defaultValue="ABC" />
        </div>
      </Section>

      <Section header="Empty state and sheet">
        <EmptyState icon="customers" message={t.customers.empty} action={<Button block onClick={() => setSheet(true)}>Open a sheet</Button>} />
      </Section>

      <Card className="mt-6 text-sub text-ink-2">
        Touch targets are at least 44 pt; the main button is 52 pt. Motion is 200–250 ms and turns off with reduced motion.
      </Card>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Example sheet"
        footer={
          <Button block onClick={() => setSheet(false)}>
            {t.common.save}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label={t.customers.shopName} />
          <Field label={t.customers.phone} inputMode="tel" />
        </div>
      </Sheet>
    </>
  )
}
