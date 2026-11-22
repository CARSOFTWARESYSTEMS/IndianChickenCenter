/**
 * Five sections (plan addendum I): Today · Trip · Customers · Ledger · More.
 * Phone: bottom tabs. Tablet (≥768 px): sidebar. Desktop (≥1024 px): wider sidebar with keyboard shortcuts.
 */
import { NavLink, Outlet } from 'react-router'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { DEFAULT_SETTINGS } from '../domain'
import type { Labels } from '../i18n/labels'
import { Button } from '../ui/Button'
import { Icon, type IconName } from '../ui/Icon'
import { useOnline, useShortcuts } from './hooks'
import { useT } from './preferences'

const TABS: readonly { to: string; key: keyof Labels['tabs']; icon: IconName; end?: boolean }[] = [
  { to: '/', key: 'today', icon: 'today', end: true },
  { to: '/trip', key: 'trip', icon: 'trip' },
  { to: '/customers', key: 'customers', icon: 'customers' },
  { to: '/ledger', key: 'ledger', icon: 'ledger' },
  { to: '/more', key: 'more', icon: 'more' },
]

function TabBar() {
  const t = useT()
  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bar backdrop-blur-xl md:hidden">
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.end ?? false}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium leading-tight ${
                  isActive ? 'text-accent' : 'text-ink-2'
                }`
              }
            >
              <Icon name={tab.icon} size={26} />
              <span className="max-w-full truncate">{t.tabs[tab.key]}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  )
}

function Sidebar({ online }: { online: boolean }) {
  const t = useT()
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-card px-3 py-5 md:flex lg:w-72">
      <div className="px-3 pb-5">
        <p className="text-body font-semibold">{DEFAULT_SETTINGS.businessName}</p>
        <p className="text-sub text-ink-2">{DEFAULT_SETTINGS.shopLocation.label}</p>
      </div>
      <nav aria-label="Sections">
        <ul className="space-y-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end ?? false}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-xl px-3 text-body ${
                    isActive ? 'bg-accent-soft font-semibold text-accent' : 'text-ink active:bg-fill'
                  }`
                }
              >
                <Icon name={tab.icon} size={22} />
                {t.tabs[tab.key]}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto space-y-3 px-3">
        <p className={`flex items-center gap-2 text-sub ${online ? 'text-ink-2' : 'text-due'}`}>
          <Icon name={online ? 'cloud' : 'cloudOff'} size={18} />
          {online ? t.status.online : t.status.offline}
        </p>
        <p className="hidden text-caption font-medium uppercase tracking-wide text-ink-2 lg:block">{t.shortcuts.title}</p>
        <dl className="hidden grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption text-ink-2 lg:grid">
          {(
            [
              ['N', t.shortcuts.sale],
              ['P', t.shortcuts.payment],
              ['B', t.shortcuts.bill],
              ['/', t.shortcuts.search],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="contents">
              <dt>
                <kbd className="rounded border border-line px-1.5 font-sans">{key}</kbd>
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  )
}

function OfflineBanner() {
  const t = useT()
  return (
    <div role="status" className="flex items-center gap-2 bg-due/14 px-4 py-2 text-sub text-due md:hidden">
      <Icon name="cloudOff" size={18} />
      {t.status.offline}
    </div>
  )
}

/** A new version waits for the person to tap Update, so it never interrupts an entry. */
function UpdatePrompt() {
  const t = useT()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()
  if (!needRefresh && !offlineReady) return null
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md animate-pop-in items-center gap-3 rounded-2xl bg-card p-3 pl-4 shadow-xl ring-1 ring-line md:bottom-6"
    >
      <p className="flex-1 text-sub">{needRefresh ? t.update.available : t.update.offlineReady}</p>
      {needRefresh ? (
        <Button variant="secondary" onClick={() => void updateServiceWorker(true)}>
          {t.update.reload}
        </Button>
      ) : (
        <Button variant="plain" onClick={() => setOfflineReady(false)}>
          {t.common.close}
        </Button>
      )}
      {needRefresh && (
        <Button variant="plain" onClick={() => setNeedRefresh(false)} aria-label={t.common.close}>
          <Icon name="close" size={20} />
        </Button>
      )}
    </div>
  )
}

export function AppShell() {
  const online = useOnline()
  useShortcuts()
  return (
    <div className="min-h-dvh md:flex">
      <Sidebar online={online} />
      <div className="min-w-0 flex-1">
        {!online && <OfflineBanner />}
        <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(96px+env(safe-area-inset-bottom))] md:px-6 md:pb-12 lg:px-8">
          <Outlet />
        </main>
      </div>
      <TabBar />
      <UpdatePrompt />
    </div>
  )
}
