import { useState } from 'react'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Card } from '../ui/primitives'
import { promptInstall, useInstallState } from './install'
import { readStored, useT, writeStored } from './preferences'

const DISMISS_KEY = 'icc.installDismissed'

/** "How to install" for this device: an Install button where the browser offers one, the iPhone steps otherwise. */
export function InstallCard({ dismissible = false }: { dismissible?: boolean }) {
  const t = useT()
  const state = useInstallState()
  const [dismissed, setDismissed] = useState(() => dismissible && readStored(DISMISS_KEY) === '1')

  if (state === 'installed') {
    return dismissible ? null : (
      <Card className="mt-4 flex items-center gap-3">
        <Icon name="check" className="text-received" />
        <p className="text-body">{t.install.installed}</p>
      </Card>
    )
  }
  if (dismissed) return null

  return (
    <Card className="mt-4">
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon name="install" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-body font-semibold">{t.install.title}</h2>
          <p className="mt-0.5 text-sub text-ink-2">{t.install.body}</p>
          {state !== 'prompt' && <p className="mt-2 text-sub">{state === 'ios' ? t.install.iosSteps : t.install.manualSteps}</p>}
        </div>
      </div>
      {(dismissible || state === 'prompt') && (
        <div className="mt-3 flex justify-end gap-2">
          {dismissible && (
            <Button
              variant="plain"
              onClick={() => {
                writeStored(DISMISS_KEY, '1')
                setDismissed(true)
              }}
            >
              {t.install.notNow}
            </Button>
          )}
          {state === 'prompt' && (
            <Button variant="secondary" icon="install" onClick={() => void promptInstall()}>
              {t.install.installButton}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
