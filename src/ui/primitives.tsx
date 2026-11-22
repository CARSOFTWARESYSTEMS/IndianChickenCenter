/** Small building blocks: page header, grouped lists, cards, amounts, pills, stat tiles, empty states. */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { formatRupees, type Paise } from '../domain'
import { Icon, type IconName } from './Icon'

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string
  subtitle?: ReactNode
  back?: { to: string; label: string }
  action?: ReactNode
}) {
  return (
    <header className="pt-3 pb-2 md:pt-8">
      {back && (
        <Link to={back.to} className="-ml-2 inline-flex min-h-11 items-center gap-0.5 px-1 text-body text-accent">
          <Icon name="chevronLeft" size={22} />
          {back.label}
        </Link>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-large font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sub text-ink-2">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-card p-4 ${className}`}>{children}</div>
}

/** iOS-style inset grouped list with an optional header and footer. */
export function Section({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      {header && <h2 className="px-4 pb-1.5 text-caption font-medium uppercase tracking-wide text-ink-2">{header}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-xl bg-card">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-caption text-ink-2">{footer}</p>}
    </section>
  )
}

interface RowProps {
  title: ReactNode
  subtitle?: ReactNode
  value?: ReactNode
  icon?: IconName
  to?: string
}

export function Row({ title, subtitle, value, icon, to }: RowProps) {
  const body = (
    <>
      {icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body">{title}</span>
        {subtitle && <span className="block truncate text-sub text-ink-2">{subtitle}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-body text-ink-2">{value}</span>}
      {to && <Icon name="chevronRight" size={18} className="shrink-0 text-ink-2" />}
    </>
  )
  const cls = 'flex min-h-11 items-center gap-3 px-4 py-2.5'
  return to ? (
    <Link to={to} className={`${cls} active:bg-fill`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export type Tone = 'neutral' | 'received' | 'due' | 'danger' | 'muted' | 'accent'

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  received: 'text-received',
  due: 'text-due',
  danger: 'text-danger',
  muted: 'text-ink-2',
  accent: 'text-accent',
}

/** Rupees with Indian grouping and tabular figures. Due = orange, received = green. */
export function Amount({
  paise,
  tone = 'neutral',
  size = 'body',
  className = '',
}: {
  paise: Paise
  tone?: Tone
  size?: 'body' | 'title' | 'key'
  className?: string
}) {
  const sizes = { body: 'text-body', title: 'text-title font-semibold', key: 'text-amount font-semibold tracking-tight' }
  return <span className={`num ${TONE_TEXT[tone]} ${sizes[size]} ${className}`}>{formatRupees(paise)}</span>
}

const PILL: Record<Tone, string> = {
  neutral: 'bg-fill text-ink-2',
  muted: 'bg-fill text-ink-2',
  received: 'bg-received/14 text-received',
  accent: 'bg-accent-soft text-accent',
  due: 'bg-due/14 text-due',
  danger: 'bg-danger/14 text-danger',
}

export function Pill({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium ${PILL[tone]}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}

export function StatTile({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-3">
      <div className="text-caption text-ink-2">{label}</div>
      <div className="num mt-0.5 text-title font-semibold">{children}</div>
    </div>
  )
}

/** One line and at most one button. */
export function EmptyState({ icon, message, action }: { icon: IconName; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-fill text-ink-2">
        <Icon name={icon} size={28} />
      </span>
      <p className="mt-3 text-body text-ink-2">{message}</p>
      {action && <div className="mt-5 w-full max-w-xs">{action}</div>}
    </div>
  )
}
