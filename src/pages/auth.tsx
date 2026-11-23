/**
 * Screens before the app opens (P4): loading, sign-in, "not on the team", waiting for the owner,
 * and the owner's one-time set-up (plan R01: "Update Customer Details – one time while activating", U-03).
 */
import { useState, type ReactNode } from 'react'
import { useOnline } from '../app/hooks'
import { usePreferences, useT } from '../app/preferences'
import { useToast } from '../app/toast'
import { fill, errorText } from '../i18n/labels'
import {
  DEFAULT_SETTINGS,
  parsePricePerLitre,
  parseRatePerKg,
  ROUNDING_POLICIES,
  validateSettings,
  type BusinessSettings,
  type Language,
  type RoundingPolicyId,
} from '../domain'
import { settingsWrites } from '../data/docs'
import { useSession, type Account } from '../firebase/session'
import { Button } from '../ui/Button'
import { Field, Segmented } from '../ui/controls'
import { Card } from '../ui/primitives'
import { errorOf, valueOf } from './shared'

const LANGUAGES: readonly { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'kn', label: 'ಕನ್ನಡ' },
]

/** Centred column with the app icon and a language switch, used by every screen here. */
function GateLayout({ title, children }: { title?: string; children: ReactNode }) {
  const t = useT()
  const { language, setLanguage } = usePreferences()
  return (
    <main className="min-h-dvh bg-canvas px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)] text-ink">
      <div className="mx-auto flex max-w-sm flex-col gap-5">
        <div className="flex justify-end">
          <div className="w-44">
            <Segmented label={t.settings.language} value={language} options={LANGUAGES} onChange={setLanguage} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 pt-4 text-center">
          <img src="/icon.svg" alt="" width={72} height={72} className="rounded-[22px] shadow-sm" />
          <p className="text-sub text-ink-2">{DEFAULT_SETTINGS.businessName}</p>
          {title && <h1 className="text-title font-bold tracking-tight">{title}</h1>}
        </div>
        {children}
      </div>
    </main>
  )
}

export function LoadingScreen() {
  const t = useT()
  const online = useOnline()
  return (
    <GateLayout>
      <p role="status" className="text-center text-body text-ink-2">
        {online ? t.auth.loading : t.auth.loadingOffline}
      </p>
    </GateLayout>
  )
}

export function SignInPage({ error }: { error?: string | undefined }) {
  const t = useT()
  const online = useOnline()
  const { signIn } = useSession()
  const [busy, setBusy] = useState(false)
  return (
    <GateLayout title={t.auth.title}>
      <p className="text-center text-body text-ink-2">{t.auth.subtitle}</p>
      <Button
        block
        disabled={busy || !online}
        onClick={() => {
          setBusy(true)
          void signIn().finally(() => setBusy(false))
        }}
      >
        {t.auth.google}
      </Button>
      {(error || !online) && (
        <p role="alert" className="text-center text-sub font-medium text-danger">
          {online ? t.auth.failed : t.auth.offline}
        </p>
      )}
      <p className="text-center text-caption text-ink-2">{t.auth.onlyTeam}</p>
    </GateLayout>
  )
}

export function NotAuthorisedPage({ account }: { account: Account }) {
  const t = useT()
  const toast = useToast()
  const { checkAgain, signOut } = useSession()
  return (
    <GateLayout title={t.auth.notOnTeamTitle}>
      <p className="text-center text-body text-ink-2">{fill(t.auth.notOnTeamBody, { email: account.email })}</p>
      <div className="space-y-3">
        <Button block onClick={checkAgain}>
          {t.auth.checkAgain}
        </Button>
        <Button block variant="secondary" onClick={() => void signOut()}>
          {t.auth.otherAccount}
        </Button>
      </div>
      <Card className="space-y-2">
        <p className="text-caption text-ink-2">{t.auth.firstSetup}</p>
        <div className="flex items-center gap-2">
          <code className="num min-w-0 flex-1 truncate rounded-lg bg-fill px-2 py-1.5 text-sub">{account.uid}</code>
          <Button
            variant="plain"
            onClick={() => {
              void navigator.clipboard?.writeText(account.uid).then(() => toast(t.auth.copied))
            }}
          >
            {t.auth.copy}
          </Button>
        </div>
      </Card>
    </GateLayout>
  )
}

export function WaitingForOwnerPage() {
  const t = useT()
  const { checkAgain, signOut } = useSession()
  return (
    <GateLayout title={t.auth.waitingTitle}>
      <p className="text-center text-body text-ink-2">{t.auth.waitingBody}</p>
      <Button block onClick={checkAgain}>
        {t.auth.checkAgain}
      </Button>
      <Button block variant="secondary" onClick={() => void signOut()}>
        {t.auth.signOut}
      </Button>
    </GateLayout>
  )
}

const STEPS = ['business', 'contact', 'bills'] as const
type Step = (typeof STEPS)[number]

/** The owner's first sign-in: business details for bills, saved to the cloud once. */
export function ActivationPage({ account }: { account: Account }) {
  const t = useT()
  const toast = useToast()
  const { write } = useSession()
  const [step, setStep] = useState<Step>('business')
  const [draft, setDraft] = useState<BusinessSettings>(() => ({
    ...DEFAULT_SETTINGS,
    contact: { ...DEFAULT_SETTINGS.contact, ownerName: account.name || DEFAULT_SETTINGS.contact.ownerName, email: account.email },
  }))
  const [phones, setPhones] = useState('')
  const [rate, setRate] = useState('')
  const [diesel, setDiesel] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const set = (patch: Partial<BusinessSettings>) => setDraft((d) => ({ ...d, ...patch }))
  const setContact = (patch: Partial<BusinessSettings['contact']>) => setDraft((d) => ({ ...d, contact: { ...d.contact, ...patch } }))
  const index = STEPS.indexOf(step)
  const labels: Record<Step, string> = { business: t.activation.stepBusiness, contact: t.activation.stepContact, bills: t.activation.stepBills }

  const finish = async () => {
    const contact: BusinessSettings['contact'] = {
      ownerName: draft.contact.ownerName.trim(),
      phones: phones.split(',').map((p) => p.trim()).filter(Boolean),
    }
    for (const key of ['whatsapp', 'email', 'address'] as const) {
      const v = draft.contact[key]?.trim()
      if (v) contact[key] = v
    }
    const next: BusinessSettings = { ...draft, businessName: draft.businessName.trim(), contact }
    const kn = draft.businessNameKn?.trim()
    if (kn) next.businessNameKn = kn
    else delete next.businessNameKn
    const rateP = valueOf(rate, parseRatePerKg)
    const dieselP = valueOf(diesel, parsePricePerLitre)
    if (rateP !== undefined) next.defaultSaleRatePaisePerKg = rateP
    if (dieselP !== undefined) next.dieselPricePaisePerLitre = dieselP
    const valid = validateSettings(next)
    if (!valid.ok) {
      setError(errorText(t, valid.error) + (valid.error.code === 'invalid_input' ? ` (${valid.error.message})` : ''))
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      await write(settingsWrites(valid.value, account.uid))
      toast(t.activation.done)
    } catch {
      setError(t.people.failed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GateLayout title={t.activation.title}>
      <p className="text-center text-sub text-ink-2">{t.activation.intro}</p>
      <ol className="flex justify-center gap-2" aria-label={t.activation.title}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={s === step ? 'step' : undefined}
            className={`rounded-full px-3 py-1 text-caption font-medium ${
              i < index ? 'bg-accent-soft text-accent' : s === step ? 'bg-accent text-on-accent' : 'bg-fill text-ink-2'
            }`}
          >
            {i + 1} · {labels[s]}
          </li>
        ))}
      </ol>

      <div className="space-y-4">
        {step === 'business' && (
          <>
            <Field label={t.profile.businessName} value={draft.businessName} onChange={(e) => set({ businessName: e.target.value })} />
            <Field label={t.profile.businessNameKn} value={draft.businessNameKn ?? ''} onChange={(e) => set({ businessNameKn: e.target.value })} />
            <Field
              label={t.profile.shopLocation}
              value={draft.shopLocation.label}
              onChange={(e) => set({ shopLocation: { ...draft.shopLocation, label: e.target.value } })}
            />
          </>
        )}
        {step === 'contact' && (
          <>
            <Field label={t.profile.ownerName} value={draft.contact.ownerName} onChange={(e) => setContact({ ownerName: e.target.value })} />
            <Field label={t.profile.phones} inputMode="tel" value={phones} onChange={(e) => setPhones(e.target.value)} />
            <Field label={t.profile.whatsapp} inputMode="tel" value={draft.contact.whatsapp ?? ''} onChange={(e) => setContact({ whatsapp: e.target.value })} />
            <Field label={t.profile.email} inputMode="email" value={draft.contact.email ?? ''} onChange={(e) => setContact({ email: e.target.value })} />
            <Field label={t.profile.address} value={draft.contact.address ?? ''} onChange={(e) => setContact({ address: e.target.value })} />
          </>
        )}
        {step === 'bills' && (
          <>
            <div>
              <p className="mb-1.5 px-1 text-sub text-ink-2">{t.profile.rounding}</p>
              <Segmented
                label={t.profile.rounding}
                value={draft.roundingPolicy ?? 'ROUND_HALF_UP_RUPEE'}
                onChange={(v: RoundingPolicyId) => set({ roundingPolicy: v })}
                options={ROUNDING_POLICIES.map((p) => ({ value: p, label: t.profile.roundingOptions[p] }))}
              />
              <p className="mt-1 px-1 text-caption text-ink-2">{t.activation.roundingNote}</p>
            </div>
            <div>
              <p className="mb-1.5 px-1 text-sub text-ink-2">{t.bill.language}</p>
              <Segmented
                label={t.bill.language}
                value={draft.languages.bill}
                options={LANGUAGES}
                onChange={(bill) => set({ languages: { ...draft.languages, bill } })}
              />
            </div>
            <Field label={t.profile.defaultRate} inputMode="decimal" suffix="₹/kg" value={rate} onChange={(e) => setRate(e.target.value)} error={errorOf(rate, parseRatePerKg)} />
            <Field label={t.profile.dieselPrice} inputMode="decimal" suffix="₹/L" value={diesel} onChange={(e) => setDiesel(e.target.value)} error={errorOf(diesel, parsePricePerLitre)} />
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sub font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        {index > 0 && (
          <Button variant="secondary" className="flex-1" onClick={() => setStep(STEPS[index - 1]!)}>
            {t.activation.back}
          </Button>
        )}
        {step !== 'bills' ? (
          <Button className="flex-1" onClick={() => setStep(STEPS[index + 1]!)}>
            {t.activation.next}
          </Button>
        ) : (
          <Button className="flex-1" disabled={saving} onClick={() => void finish()}>
            {t.activation.finish}
          </Button>
        )}
      </div>
    </GateLayout>
  )
}
