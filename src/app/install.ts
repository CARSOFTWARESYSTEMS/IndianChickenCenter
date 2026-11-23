/**
 * "Install the app" support. Chrome and Edge fire beforeinstallprompt (often before React mounts), so it is
 * captured at module load. iPhones and iPads have no install button: people use Share → Add to Home Screen.
 */
import { useSyncExternalStore } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installedNow = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installedNow = true
    notify()
  })
}

function isStandalone(): boolean {
  return (
    installedNow ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isAppleMobile(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export type InstallState = 'installed' | 'prompt' | 'ios' | 'manual'

function snapshot(): InstallState {
  if (isStandalone()) return 'installed'
  if (deferred) return 'prompt'
  return isAppleMobile() ? 'ios' : 'manual'
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, snapshot, () => 'manual')
}

/** Shows the browser's own install dialog when it is available. */
export async function promptInstall(): Promise<void> {
  if (!deferred) return
  const event = deferred
  deferred = null
  await event.prompt()
  await event.userChoice
  notify()
}
