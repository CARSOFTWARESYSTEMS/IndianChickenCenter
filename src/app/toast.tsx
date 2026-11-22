/** A short confirmation ("Saved") above the tab bar, with a light haptic tap where the phone supports it. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

const ToastContext = createContext<(message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)

  const show = useCallback((message: string) => {
    setToast({ id: Date.now(), message })
    navigator.vibrate?.(10)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+12px)] z-[60] mx-auto max-w-sm animate-pop-in rounded-2xl bg-ink px-4 py-3 text-center text-sub font-medium text-canvas shadow-xl md:top-auto md:bottom-6 print:hidden"
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): (message: string) => void {
  return useContext(ToastContext)
}
