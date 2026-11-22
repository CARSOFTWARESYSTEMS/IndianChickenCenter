/** Inputs: text/number fields, segmented control, sync status and the trip stepper. */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { useT } from '../app/preferences'
import { Icon, type IconName } from './Icon'
import { Pill } from './primitives'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  /** Keep the label for screen readers only (e.g. a search box with a placeholder). */
  hideLabel?: boolean
  hint?: ReactNode
  error?: string
  suffix?: string
  icon?: IconName
}

/**
 * A labelled input. Use inputMode="decimal" for kg and rupees and inputMode="tel" for phones:
 * the field stays type="text" so there are no spinners and no locale surprises.
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hideLabel = false, hint, error, suffix, icon, className = '', ...input },
  ref,
) {
  const id = useId()
  return (
    <div className={`block ${className}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1.5 block px-1 text-sub text-ink-2'}>
        {label}
      </label>
      <div
        className={`flex min-h-12 items-center gap-2 rounded-xl bg-card px-3 focus-within:ring-2 ${
          error ? 'ring-2 ring-danger' : 'focus-within:ring-accent'
        }`}
      >
        {icon && <Icon name={icon} size={20} className="shrink-0 text-ink-2" />}
        <input
          ref={ref}
          id={id}
          type="text"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          className="num h-12 w-full min-w-0 bg-transparent text-body text-ink outline-none placeholder:text-ink-2/70"
          {...input}
        />
        {suffix && <span className="shrink-0 text-body text-ink-2">{suffix}</span>}
      </div>
      {(error || hint) && <p className={`mt-1 px-1 text-caption ${error ? 'text-danger' : 'text-ink-2'}`}>{error ?? hint}</p>}
    </div>
  )
})

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-fill p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-h-10 flex-1 rounded-[10px] px-3 text-sub font-medium transition-colors ${
              active ? 'bg-segment text-ink shadow-sm' : 'text-ink-2'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Single-choice chips for short lists (vehicles, drivers, categories, labour slots). */
export function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | undefined
  options: readonly { value: T; label: string; disabled?: boolean }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`num min-h-10 rounded-full px-3.5 text-sub font-medium transition-colors disabled:opacity-35 ${
              active ? 'bg-accent text-on-accent' : 'bg-card text-ink ring-1 ring-line'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** iOS-style on/off switch with its label. */
export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
      <span id={id} className="text-body">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${
          checked ? 'bg-received' : 'bg-fill'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-[27px] rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  )
}

export type SyncState = 'local' | 'syncing' | 'cloud' | 'attention'

/** Every money entry shows where it is saved (plan principle 5). */
export function SyncStatus({ state }: { state: SyncState }) {
  const t = useT()
  switch (state) {
    case 'local':
      return <Pill tone="due" icon="phone">{t.status.savedOnPhone}</Pill>
    case 'syncing':
      return <Pill tone="muted" icon="cloud">{t.status.syncing}</Pill>
    case 'cloud':
      return <Pill tone="received" icon="check">{t.status.savedToCloud}</Pill>
    case 'attention':
      return <Pill tone="danger" icon="alert">{t.status.needsAttention}</Pill>
  }
}

export interface Step {
  key: string
  label: string
  total?: ReactNode
  state: 'done' | 'current' | 'todo'
}

/** The trip's six steps in the owner's order, each with its total and a tick when done. */
export function Stepper({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-xl bg-card">
      {steps.map((s, i) => (
        <li key={s.key} className="flex min-h-14 items-center gap-3 px-4 py-3" aria-current={s.state === 'current' ? 'step' : undefined}>
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold ${
              s.state === 'done'
                ? 'bg-accent text-on-accent'
                : s.state === 'current'
                  ? 'text-accent ring-2 ring-accent'
                  : 'bg-fill text-ink-2'
            }`}
          >
            {s.state === 'done' ? <Icon name="check" size={16} /> : i + 1}
          </span>
          <span className={`flex-1 text-body ${s.state === 'todo' ? 'text-ink-2' : ''}`}>{s.label}</span>
          <span className="num text-body text-ink-2">{s.total ?? '—'}</span>
        </li>
      ))}
    </ol>
  )
}
