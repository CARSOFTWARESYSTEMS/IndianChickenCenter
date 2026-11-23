/** More: demo controls, Reports · Backup · Business profile · Settings · Help & install, and developer pages. */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { InstallCard } from '../app/InstallCard'
import { formatBytes, keepStorage, storageInfo, type StorageInfo } from '../app/device'
import { usePreferences, useT, type ThemeChoice } from '../app/preferences'
import { useToast } from '../app/toast'
import { errorText, fill } from '../i18n/labels'
import { parsePricePerLitre, parseRatePerKg, ROUNDING_POLICIES, type BusinessSettings, type Language, type RoundingPolicyId } from '../domain'
import { saveSettings, setActor } from '../store/commands'
import { useSession } from '../firebase/session'
import { allowed, currentUser } from '../store/selectors'
import { dispatch, resetDemo, useAppState } from '../store/store'
import { StickyAction } from '../ui/StickyAction'
import { Button } from '../ui/Button'
import { Chips, Field, Segmented, Switch } from '../ui/controls'
import { Card, EmptyState, PageHeader, Pill, Row, Section } from '../ui/primitives'
import { MapPinField } from './mapPin'
import { errorOf, rupeesText, valueOf } from './shared'

const LANGUAGE_OPTIONS: readonly { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'kn', label: 'ಕನ್ನಡ' },
]

function LanguageSwitch() {
  const t = useT()
  const { language, setLanguage } = usePreferences()
  return <Segmented label={t.settings.language} value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
}

export function MorePage() {
  const t = useT()
  const s = useAppState()
  const toast = useToast()
  const { session, signOut } = useSession()
  const signedIn = session.status === 'ready' ? session : undefined
  return (
    <>
      <PageHeader title={t.tabs.more} />
      {signedIn && (
        <Section header={t.auth.account} footer={t.auth.cloudNote}>
          <Row
            title={signedIn.user.name}
            subtitle={signedIn.account.email}
            value={<Pill tone="accent">{t.roles[signedIn.user.role]}</Pill>}
          />
          <div className="p-3">
            <Button block variant="secondary" onClick={() => void signOut()}>
              {t.auth.signOut}
            </Button>
          </div>
        </Section>
      )}
      {!signedIn && (
        <Section header={<span className="inline-flex items-center gap-2">{t.demo.badge}</span>} footer={t.demo.note}>
          <div className="space-y-3 p-3">
            <p className="px-1 text-sub text-ink-2">{t.demo.actingAs}</p>
            <Chips
              label={t.demo.actingAs}
              value={s.actorId}
              onChange={(id) => dispatch(setActor(id))}
              options={s.users.map((u) => ({ value: u.id, label: `${t.roles[u.role]} · ${u.name}` }))}
            />
            <Button
              block
              variant="destructive"
              onClick={() => {
                resetDemo()
                toast(t.demo.resetDone)
              }}
            >
              {t.demo.reset}
            </Button>
          </div>
        </Section>
      )}
      <Section header={t.settings.language}>
        <div className="p-2">
          <LanguageSwitch />
        </div>
      </Section>
      <Section>
        <Row icon="reports" title={t.more.reports} to="/more/reports" />
        <Row icon="backup" title={t.more.backup} to="/more/backup" />
        {signedIn?.user.role === 'owner' && <Row icon="customers" title={t.more.people} to="/more/people" />}
        <Row icon="store" title={t.more.profile} to="/more/profile" />
        <Row icon="settings" title={t.more.settings} to="/more/settings" />
        <Row icon="help" title={t.more.help} to="/more/help" />
      </Section>
      <Section header={t.more.developer}>
        <Row icon="palette" title={t.more.designSystem} to="/more/design" />
        <Row icon="calculator" title={t.more.engineCheck} to="/more/engine-check" />
      </Section>
    </>
  )
}

/** Business details printed on bills (U-03, U-04), GST switch (U-08) and money settings (U-01). Owner only. */
export function BusinessProfilePage() {
  const t = useT()
  const s = useAppState()
  const toast = useToast()
  const mayEdit = allowed(s, 'settings.edit')
  const [draft, setDraft] = useState<BusinessSettings>(s.settings)
  const [phones, setPhones] = useState(s.settings.contact.phones.join(', '))
  const [rate, setRate] = useState(rupeesText(s.settings.defaultSaleRatePaisePerKg))
  const [diesel, setDiesel] = useState(rupeesText(s.settings.dieselPricePaisePerLitre))
  const [error, setError] = useState<string>()

  const set = (patch: Partial<BusinessSettings>) => setDraft((d) => ({ ...d, ...patch }))
  const setContact = (patch: Partial<BusinessSettings['contact']>) => setDraft((d) => ({ ...d, contact: { ...d.contact, ...patch } }))
  const setPrint = (patch: Partial<BusinessSettings['print']>) => setDraft((d) => ({ ...d, print: { ...d.print, ...patch } }))
  const setGst = (patch: Partial<BusinessSettings['gst']>) => setDraft((d) => ({ ...d, gst: { ...d.gst, ...patch } }))
  const text = (v: string | undefined) => v ?? ''
  const optional = (v: string) => (v.trim() ? v.trim() : undefined)

  const onSave = () => {
    const contact = { ...draft.contact, phones: phones.split(',').map((p) => p.trim()).filter(Boolean) }
    const next: BusinessSettings = { ...draft, contact }
    const rateP = valueOf(rate, parseRatePerKg)
    const dieselP = valueOf(diesel, parsePricePerLitre)
    if (rateP === undefined) delete next.defaultSaleRatePaisePerKg
    else next.defaultSaleRatePaisePerKg = rateP
    if (dieselP === undefined) delete next.dieselPricePaisePerLitre
    else next.dieselPricePaisePerLitre = dieselP
    for (const key of ['whatsapp', 'email', 'address'] as const) {
      const v = optional(text(contact[key]))
      if (v === undefined) delete next.contact[key]
      else next.contact[key] = v
    }
    const r = dispatch(saveSettings(next))
    if (!r.ok) return setError(errorText(t, r.error) + (r.error.code === 'invalid_input' || r.error.code === 'invalid_phone' ? ` (${r.error.message})` : ''))
    setError(undefined)
    toast(t.profile.saved)
  }

  return (
    <>
      <PageHeader title={t.more.profile} back={{ to: '/more', label: t.more.back }} />
      {!mayEdit && <p className="mb-2 text-sub text-due">{t.profile.ownerOnly}</p>}
      <fieldset disabled={!mayEdit} className="space-y-4">
        <Card className="space-y-4 bg-transparent p-0">
          <Field label={t.profile.businessName} value={draft.businessName} onChange={(e) => set({ businessName: e.target.value })} />
          <Field
            label={t.profile.businessNameKn}
            value={text(draft.businessNameKn)}
            onChange={(e) => {
              const v = optional(e.target.value)
              setDraft((d) => {
                const next = { ...d }
                if (v === undefined) delete next.businessNameKn
                else next.businessNameKn = e.target.value
                return next
              })
            }}
          />
          <Field label={t.profile.ownerName} value={draft.contact.ownerName} onChange={(e) => setContact({ ownerName: e.target.value })} />
          <Field label={t.profile.shopLocation} value={draft.shopLocation.label} onChange={(e) => set({ shopLocation: { ...draft.shopLocation, label: e.target.value } })} />
          <MapPinField value={draft.shopLocation} onChange={(shopLocation) => set({ shopLocation })} />
          <Field label={t.profile.phones} inputMode="tel" value={phones} onChange={(e) => setPhones(e.target.value)} />
          <Field label={t.profile.whatsapp} inputMode="tel" value={text(draft.contact.whatsapp)} onChange={(e) => setContact({ whatsapp: e.target.value })} />
          <Field label={t.profile.email} inputMode="email" value={text(draft.contact.email)} onChange={(e) => setContact({ email: e.target.value })} />
          <Field label={t.profile.address} value={text(draft.contact.address)} onChange={(e) => setContact({ address: e.target.value })} />
        </Card>

        <Section header={t.profile.printOnBill}>
          <Switch label={t.profile.ownerName} checked={draft.print.ownerName} onChange={(v) => setPrint({ ownerName: v })} disabled={!mayEdit} />
          <Switch label={t.profile.phones.replace(/ \(.*\)/, '')} checked={draft.print.phones} onChange={(v) => setPrint({ phones: v })} disabled={!mayEdit} />
          <Switch label={t.profile.whatsapp} checked={draft.print.whatsapp} onChange={(v) => setPrint({ whatsapp: v })} disabled={!mayEdit} />
          <Switch label={t.profile.email} checked={draft.print.email} onChange={(v) => setPrint({ email: v })} disabled={!mayEdit} />
          <Switch label={t.profile.address} checked={draft.print.address} onChange={(v) => setPrint({ address: v })} disabled={!mayEdit} />
        </Section>

        <Section header={t.profile.gst}>
          <Switch label={t.profile.gstEnabled} checked={draft.gst.enabled} onChange={(v) => setGst({ enabled: v })} disabled={!mayEdit} />
          {draft.gst.enabled && (
            <div className="space-y-4 bg-canvas p-3">
              <Field label={t.profile.gstin} autoCapitalize="characters" value={text(draft.gst.gstin)} onChange={(e) => setGst({ gstin: e.target.value })} />
              <Field label={t.profile.legalText} value={text(draft.gst.legalText)} onChange={(e) => setGst({ legalText: e.target.value })} />
            </div>
          )}
        </Section>

        <Section header={t.profile.money}>
          <div className="space-y-4 bg-canvas p-3">
            <div>
              <p className="mb-1.5 px-1 text-sub text-ink-2">{t.profile.rounding}</p>
              <Segmented
                label={t.profile.rounding}
                value={draft.roundingPolicy ?? 'ROUND_HALF_UP_RUPEE'}
                onChange={(v: RoundingPolicyId) => set({ roundingPolicy: v })}
                options={ROUNDING_POLICIES.map((p) => ({ value: p, label: t.profile.roundingOptions[p] }))}
              />
            </div>
            <Field label={t.profile.defaultRate} inputMode="decimal" suffix="₹/kg" value={rate} onChange={(e) => setRate(e.target.value)} error={errorOf(rate, parseRatePerKg)} />
            <Field label={t.profile.dieselPrice} inputMode="decimal" suffix="₹/L" value={diesel} onChange={(e) => setDiesel(e.target.value)} error={errorOf(diesel, parsePricePerLitre)} />
          </div>
        </Section>
      </fieldset>

      {mayEdit && (
        <StickyAction>
          {error && (
            <p role="alert" className="mb-2 rounded-xl bg-card px-4 py-2 text-sub font-medium text-danger">
              {error}
            </p>
          )}
          <Button block onClick={onSave}>
            {t.common.save}
          </Button>
        </StickyAction>
      )}
    </>
  )
}

export function SettingsPage() {
  const t = useT()
  const { theme, setTheme } = usePreferences()
  const themes: readonly { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: t.settings.automatic },
    { value: 'light', label: t.settings.light },
    { value: 'dark', label: t.settings.dark },
  ]
  return (
    <>
      <PageHeader title={t.more.settings} back={{ to: '/more', label: t.more.back }} />
      <Section header={t.settings.language}>
        <div className="p-2">
          <LanguageSwitch />
        </div>
      </Section>
      <Section header={t.settings.appearance} footer={t.settings.laterNote}>
        <div className="p-2">
          <Segmented label={t.settings.appearance} value={theme} options={themes} onChange={setTheme} />
        </div>
      </Section>
      <PhoneStorage />
    </>
  )
}

/** DV-06: whether the browser keeps the entries saved on this phone, and how much it holds. */
function PhoneStorage() {
  const t = useT()
  const [info, setInfo] = useState<StorageInfo>()
  const [declined, setDeclined] = useState(false)
  useEffect(() => {
    let live = true
    void storageInfo().then((i) => live && setInfo(i))
    return () => {
      live = false
    }
  }, [])
  if (!info) return null
  const ask = async () => {
    const kept = await keepStorage()
    setInfo(await storageInfo())
    // Safari and Chrome answer without asking the person; say so rather than leave the button doing nothing.
    setDeclined(!kept)
  }
  return (
    <Section header={t.settings.device} footer={info.kept ? t.settings.keptNote : t.settings.clearNote}>
      <Row
        title={t.settings.offlineData}
        {...(info.usedBytes !== undefined ? { subtitle: fill(t.settings.storageUsed, { size: formatBytes(info.usedBytes) }) } : {})}
        value={
          <Pill tone={info.kept ? 'received' : info.kept === false ? 'due' : 'neutral'}>
            {info.kept ? t.settings.kept : info.kept === false ? t.settings.mayBeCleared : t.settings.unknown}
          </Pill>
        }
      />
      {info.kept === false &&
        (declined ? (
          <p role="status" className="px-4 pb-3 text-sub text-due">
            {t.settings.declined}
          </p>
        ) : (
          <div className="px-4 pb-3">
            <Button variant="secondary" block onClick={() => void ask()}>
              {t.settings.keep}
            </Button>
          </div>
        ))}
    </Section>
  )
}

export function HelpPage() {
  const t = useT()
  return (
    <>
      <PageHeader title={t.more.help} back={{ to: '/more', label: t.more.back }} />
      <InstallCard />
      <Section header={t.shortcuts.title}>
        <Row title={t.shortcuts.sale} value={<kbd className="font-sans">N</kbd>} />
        <Row title={t.shortcuts.payment} value={<kbd className="font-sans">P</kbd>} />
        <Row title={t.shortcuts.bill} value={<kbd className="font-sans">B</kbd>} />
        <Row title={t.shortcuts.search} value={<kbd className="font-sans">/</kbd>} />
      </Section>
    </>
  )
}

export function ComingSoonPage() {
  const t = useT()
  const { section } = useParams()
  const titles: Record<string, string> = { reports: t.more.reports, backup: t.more.backup }
  return (
    <>
      <PageHeader title={titles[section ?? ''] ?? t.tabs.more} back={{ to: '/more', label: t.more.back }} />
      <Card className="mt-2">
        <EmptyState icon="settings" message={t.more.comingSoon} />
      </Card>
    </>
  )
}

/** Who is acting (demo), shown in the shell so a role switch is never forgotten. */
export function DemoBadge() {
  const t = useT()
  const s = useAppState()
  const user = currentUser(s)
  return (
    <Pill tone="due">
      {t.demo.badge} · {t.roles[user.role]}
    </Pill>
  )
}
