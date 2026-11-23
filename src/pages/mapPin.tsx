/**
 * The shop's map pin on the Business profile (U-02 shop pin, DV-07): "Use this phone's location", or type or paste
 * the pin when location is blocked or unavailable. The pin is saved with the rest of the profile.
 */
import { useState } from 'react'
import { useT } from '../app/preferences'
import { currentLocation } from '../app/device'
import { fill } from '../i18n/labels'
import { formatPin, mapsLink, parseMapPin, pinProblemOf, type MapPin, type ShopLocation } from '../domain'
import { Button, buttonClass } from '../ui/Button'
import { Field } from '../ui/controls'
import { Icon } from '../ui/Icon'

const pinOf = (loc: ShopLocation): MapPin | undefined =>
  loc.latitude !== undefined && loc.longitude !== undefined ? { latitude: loc.latitude, longitude: loc.longitude } : undefined

export function MapPinField({ value, onChange }: { value: ShopLocation; onChange: (next: ShopLocation) => void }) {
  const t = useT()
  const pin = pinOf(value)
  const [finding, setFinding] = useState(false)
  const [note, setNote] = useState<string>()
  const [problem, setProblem] = useState<string>()
  const [typed, setTyped] = useState('')
  const [typedError, setTypedError] = useState<string>()

  const use = (next: MapPin | undefined) => {
    const { label } = value
    onChange(next ? { label, latitude: next.latitude, longitude: next.longitude } : { label })
  }

  const fromPhone = async () => {
    setFinding(true)
    setProblem(undefined)
    setNote(undefined)
    const r = await currentLocation()
    setFinding(false)
    if (!r.ok) return setProblem(t.profile.locationProblems[r.problem])
    use(r.pin)
    setNote(fill(t.profile.accuracy, { metres: r.accuracyMetres }))
  }

  const fromText = () => {
    const r = parseMapPin(typed)
    if (!r.ok) return setTypedError(t.profile.pinProblems[pinProblemOf(r.error)])
    setTypedError(undefined)
    setProblem(undefined)
    setTyped('')
    use(r.value)
    setNote(undefined)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-xl bg-card p-3">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="store" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sub text-ink-2">{t.profile.mapPin}</p>
            <p className="num text-body">{pin ? formatPin(pin) : t.profile.noPin}</p>
            {note && <p className="text-caption text-ink-2">{note}</p>}
          </div>
        </div>
        {pin && (
          <div className="flex items-center gap-2">
            <a className={buttonClass('secondary', false, 'min-w-0 flex-1 whitespace-nowrap')} href={mapsLink(pin)} target="_blank" rel="noreferrer">
              {t.profile.openMaps}
            </a>
            <Button variant="plain" className="shrink-0" onClick={() => use(undefined)}>
              {t.profile.removePin}
            </Button>
          </div>
        )}
        <Button variant="secondary" block disabled={finding} onClick={() => void fromPhone()}>
          {finding ? t.profile.finding : t.profile.useLocation}
        </Button>
        {problem && (
          <p role="alert" className="px-1 text-sub text-due">
            {problem}
          </p>
        )}
      </div>
      <Field
        label={t.profile.typePin}
        hint={t.profile.typePinHint}
        error={typedError}
        inputMode="text"
        autoCapitalize="none"
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value)
          setTypedError(undefined)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            fromText()
          }
        }}
      />
      {typed.trim() && (
        <Button variant="secondary" block onClick={fromText}>
          {t.profile.setPin}
        </Button>
      )}
    </div>
  )
}
