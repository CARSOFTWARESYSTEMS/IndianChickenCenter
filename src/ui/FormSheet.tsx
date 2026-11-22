/** A sheet with a form: fields in the body, the error (if any) and the one Save button in the sticky footer. */
import type { ReactNode } from 'react'
import { useT } from '../app/preferences'
import { Button, type ButtonVariant } from './Button'
import { Sheet } from './Sheet'

export function FormSheet({
  title,
  onClose,
  onSave,
  canSave = true,
  error,
  saveLabel,
  saveVariant = 'primary',
  extraAction,
  children,
}: {
  title: string
  onClose: () => void
  onSave: () => void
  canSave?: boolean
  error?: string | undefined
  saveLabel?: string
  saveVariant?: ButtonVariant
  /** A second action shown above Save (e.g. "Sell more than stock"). */
  extraAction?: ReactNode
  children: ReactNode
}) {
  const t = useT()
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          {error && (
            <p role="alert" className="mb-2 text-sub font-medium text-danger">
              {error}
            </p>
          )}
          {extraAction && <div className="mb-2">{extraAction}</div>}
          <Button block variant={saveVariant} disabled={!canSave} onClick={onSave}>
            {saveLabel ?? t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">{children}</div>
    </Sheet>
  )
}
