/**
 * Where saves are (plan §5), always in view: "Saved to cloud", "Saved on phone" (offline), "Syncing", or
 * "Needs attention". Tapping it lists what is waiting and what the cloud refused, with the reason.
 * In demo mode it shows the demo badge instead.
 */
import { useState } from 'react'
import { errorText } from '../i18n/labels'
import { DemoBadge } from '../pages/more'
import { attentionItems, dismiss, pendingCount, useSync, type SyncItem } from '../store/sync'
import { Button } from '../ui/Button'
import { SyncStatus, type SyncState } from '../ui/controls'
import { Sheet } from '../ui/Sheet'
import { useOnline } from './hooks'
import { useT } from './preferences'

export function StatusBadge() {
  const sync = useSync()
  const online = useOnline()
  const [open, setOpen] = useState(false)
  if (!sync.cloud) return <DemoBadge />
  const attention = attentionItems(sync).length
  const pending = pendingCount(sync)
  const state: SyncState = attention ? 'attention' : pending ? (online ? 'syncing' : 'local') : 'cloud'
  const count = attention || pending
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-full active:opacity-70">
        <SyncStatus state={state} />
        {count > 0 && <span className="num text-caption font-semibold text-ink-2">{count}</span>}
      </button>
      {open && <SyncSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function SyncSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const sync = useSync()
  const attention = attentionItems(sync)
  const pending = sync.items.filter((i) => i.status === 'pending')
  const time = (at: number) => (at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
  const line = (i: SyncItem) => (
    <p className="text-body">
      {t.sync.kinds[i.kind]} · <span className="num">{i.detail}</span>
    </p>
  )
  return (
    <Sheet open onClose={onClose} title={t.sync.title}>
      <div className="space-y-4 pb-2">
        {attention.length === 0 && pending.length === 0 && <p className="text-body text-ink-2">{t.sync.allSaved}</p>}
        {attention.length > 0 && (
          <section className="space-y-2">
            <SyncStatus state="attention" />
            <p className="text-sub text-ink-2">{t.sync.attentionNote}</p>
            <ul className="divide-y divide-line overflow-hidden rounded-xl bg-card">
              {attention.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    {line(i)}
                    <p className="text-sub text-danger">{i.error ? errorText(t, i.error) : t.errors.not_saved}</p>
                    <p className="text-caption text-ink-2">{time(i.at)}</p>
                  </div>
                  <Button variant="plain" onClick={() => dismiss(i.id)}>
                    {t.sync.dismiss}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {pending.length > 0 && (
          <section className="space-y-2">
            <SyncStatus state="local" />
            <p className="text-sub text-ink-2">{t.sync.pendingNote}</p>
            <ul className="divide-y divide-line overflow-hidden rounded-xl bg-card">
              {pending.map((i) => (
                <li key={i.id} className="px-4 py-3">
                  {line(i)}
                  <p className="text-caption text-ink-2">{time(i.at)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  )
}
