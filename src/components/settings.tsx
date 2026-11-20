import { useId, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * A titled group of settings: a short heading, one sentence of explanation, then a card of rows.
 * `tone="danger"` is for things that cannot be undone and gets a red edge.
 */
export function SettingsSection({
  title,
  description,
  tone,
  children,
}: {
  title: string
  description?: string
  tone?: 'danger'
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <div className="grid gap-0.5">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <Card className={cn('gap-0 divide-y overflow-hidden py-0', tone === 'danger' && 'border-danger/60')}>{children}</Card>
    </section>
  )
}

/** What a control needs to be announced with its label and help text. */
export interface RowAria {
  /** Put on the control itself, so clicking the label focuses it. */
  id: string
  /** For groups (radio buttons) that name themselves with aria-labelledby. */
  labelId: string
  describedBy?: string
}

/**
 * One setting: its name, a line of help, and the control.
 * Wide screens put the control on the right; narrow ones put it under the label at full width, so a label is never cut.
 * `control` can be a function to receive the ids that tie the control to its label and help (always do this for fields).
 * `inline` keeps the control beside the label at every width: for switches.
 * `below` is full-width content under the row (a status message, a confirmation field, picture choices); like `control` it can
 * be a function to receive the ids.
 */
export function SettingRow({
  label,
  help,
  control,
  inline,
  below,
}: {
  label: ReactNode
  help?: ReactNode
  control?: ReactNode | ((a: RowAria) => ReactNode)
  inline?: boolean
  below?: ReactNode | ((a: RowAria) => ReactNode)
}) {
  const uid = useId()
  const aria: RowAria = { id: `${uid}-c`, labelId: `${uid}-l`, describedBy: help ? `${uid}-h` : undefined }
  const isField = typeof control === 'function'
  const ctrl = typeof control === 'function' ? control(aria) : control
  const under = typeof below === 'function' ? below(aria) : below
  return (
    <div className={cn('grid gap-3 p-4 sm:min-h-16 sm:items-center sm:gap-6', inline ? 'grid-cols-[minmax(0,1fr)_auto] items-center' : 'sm:grid-cols-[minmax(0,1fr)_auto]')}>
      <div className="grid min-w-0 gap-0.5">
        {isField ? (
          <Label id={aria.labelId} htmlFor={aria.id} className="text-base leading-snug font-semibold">
            {label}
          </Label>
        ) : (
          <div id={aria.labelId} className="leading-snug font-semibold">
            {label}
          </div>
        )}
        {help && (
          <div id={aria.describedBy} className="text-sm text-muted-foreground">
            {help}
          </div>
        )}
      </div>
      {ctrl && <div className={cn('min-w-0', !inline && 'sm:justify-self-end')}>{ctrl}</div>}
      {under && <div className={cn(inline ? 'col-span-2' : 'sm:col-span-2')}>{under}</div>}
    </div>
  )
}
