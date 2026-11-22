/** Line icons on a 24-pt grid, drawn for this app. They inherit the text colour. */
import type { ReactNode } from 'react'

const PATHS = {
  today: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <circle cx="12" cy="15.5" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  trip: (
    <>
      <path d="M2.5 6.5h11.5v10H2.5z" />
      <path d="M14 10h4.2l3.3 3.4v3.1H14" />
      <circle cx="6.5" cy="18" r="2" fill="var(--ui-card)" />
      <circle cx="17.5" cy="18" r="2" fill="var(--ui-card)" />
    </>
  ),
  customers: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.8 14c2.7.1 4.7 1.9 4.7 4.8" />
    </>
  ),
  ledger: (
    <>
      <path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z" />
      <path d="M5 20a2 2 0 0 0 2 1h12v-3M9 7.5h6M9 11h4" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  chevronRight: <path d="M9 5.5 15.5 12 9 18.5" />,
  chevronLeft: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  cloudOff: (
    <>
      <path d="M7 18h10.5a3.5 3.5 0 0 0 .4-7A6 6 0 0 0 6.4 9.5 4.3 4.3 0 0 0 7 18z" />
      <path d="M3 3l18 18" />
    </>
  ),
  cloud: <path d="M7 18h10.5a3.5 3.5 0 0 0 .4-7A6 6 0 0 0 6.4 9.5 4.3 4.3 0 0 0 7 18z" />,
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V13" />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  install: <path d="M12 3v12m-4.5-4.5L12 15l4.5-4.5M5 20h14" />,
  reports: <path d="M4 20V11M10 20V5M16 20v-6M3 20h18" />,
  backup: (
    <>
      <path d="M7 18h10.5a3.5 3.5 0 0 0 .4-7A6 6 0 0 0 6.4 9.5 4.3 4.3 0 0 0 7 18z" />
      <path d="M12 16v-5m-2.3 2.2L12 11l2.3 2.2" />
    </>
  ),
  store: (
    <>
      <path d="M4 10v10h16V10" />
      <path d="M3 10 5 4h14l2 6c0 1.4-1.1 2.5-2.5 2.5S16 11.4 16 10c0 1.4-1.1 2.5-2.5 2.5h-3C9.1 12.5 8 11.4 8 10c0 1.4-1.1 2.5-2.5 2.5S3 11.4 3 10z" />
      <path d="M10 20v-4h4v4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.7v.4" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.6 0-1.2-1-1.4-1-2.5 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.3-9-7.3z" />
      <circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="7.8" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  calculator: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 15.5h.01M12 15.5h.01M15 15.5h.01" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  )
}
