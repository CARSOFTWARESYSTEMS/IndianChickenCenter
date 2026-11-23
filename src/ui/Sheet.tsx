/**
 * Bottom sheet on phones (with a grabber), centred sheet on tablet and desktop.
 * The footer (Save) stays visible while the body scrolls. Escape and the backdrop close it.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../app/preferences'
import { Icon } from './Icon'

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const t = useT()
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  // Latest onClose without re-running the effect (an inline handler would otherwise steal focus on every render).
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLElement>('input, select, textarea')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="absolute inset-0 animate-fade-in bg-overlay" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92dvh] w-full animate-sheet-up flex-col rounded-t-2xl bg-canvas shadow-2xl md:max-w-lg md:animate-pop-in md:rounded-2xl"
      >
        <div className="mx-auto mt-2 h-1.5 w-9 shrink-0 rounded-full bg-line md:hidden" aria-hidden="true" />
        <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <h2 id={titleId} className="text-title font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex size-11 items-center justify-center rounded-full text-ink-2 active:bg-fill"
          >
            <Icon name="close" size={22} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && (
          <div className="border-t border-line px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
