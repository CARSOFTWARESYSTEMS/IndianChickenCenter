/** More: Reports · Backup · Business profile · Settings · Help & install (plan addendum I), plus developer pages. */
import { useParams } from 'react-router'
import { InstallCard } from '../app/InstallCard'
import { usePreferences, useT, type ThemeChoice } from '../app/preferences'
import type { Language } from '../domain'
import { Segmented } from '../ui/controls'
import { Card, EmptyState, PageHeader, Row, Section } from '../ui/primitives'

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
  return (
    <>
      <PageHeader title={t.tabs.more} />
      <Section header={t.settings.language}>
        <div className="p-2">
          <LanguageSwitch />
        </div>
      </Section>
      <Section>
        <Row icon="reports" title={t.more.reports} to="/more/reports" />
        <Row icon="backup" title={t.more.backup} to="/more/backup" />
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
    </>
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
  const titles: Record<string, string> = { reports: t.more.reports, backup: t.more.backup, profile: t.more.profile }
  return (
    <>
      <PageHeader title={titles[section ?? ''] ?? t.tabs.more} back={{ to: '/more', label: t.more.back }} />
      <Card className="mt-2">
        <EmptyState icon="settings" message={t.more.comingSoon} />
      </Card>
    </>
  )
}
