import { useEffect, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/** True while the device reports a network connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

/**
 * Desktop shortcuts (plan: N new sale, P payment, B bill, / search). Ignored while typing in a field
 * or with a modifier key held. They open the right screen; the sheets they will open arrive in P3.
 */
export function useShortcuts(): void {
  const navigate = useNavigate()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return // a sheet is open
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      switch (e.key.toLowerCase()) {
        case 'n':
          navigate('/trip?sheet=sale')
          break
        case 'p':
          navigate('/customers?action=payment')
          break
        case 'b':
          navigate('/customers?action=bill')
          break
        case '/':
          e.preventDefault()
          navigate('/customers?focus=search')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
}
