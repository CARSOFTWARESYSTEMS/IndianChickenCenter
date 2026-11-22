import type { ReactNode } from 'react'

/**
 * The screen's main action, kept in reach above the tab bar (phones) or at the bottom of the content (larger screens),
 * on a soft fade so the list scrolling behind it never shows through.
 */
export function StickyAction({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(56px+env(safe-area-inset-bottom))] z-10 -mx-4 mt-4 space-y-2 bg-gradient-to-t from-canvas from-70% to-transparent px-4 pt-6 pb-3 md:bottom-0 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 print:hidden">
      {children}
    </div>
  )
}
