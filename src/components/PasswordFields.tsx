import { useState, type ComponentProps } from 'react'
import { Check, Circle, Eye, EyeOff, X } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Key } from '@/i18n/en'
import { STRENGTH_STEPS, type PasswordCheck } from '@/lib/password'
import { cn } from '@/lib/utils'

/**
 * A password field with its own show / hide button. `Field` passes it `id`, `aria-invalid` and `aria-describedby`, and they land on the
 * input itself (so the label focuses it and the hint or error is read with it). `describedBy` adds more ids, such as the rules list.
 */
export function PasswordInput({
  describedBy,
  'aria-describedby': inherited,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'> & { describedBy?: string }) {
  const { t } = useApp()
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        {...props}
        type={show ? 'text' : 'password'}
        className={cn('pe-12', props.className)}
        aria-describedby={[inherited, describedBy].filter(Boolean).join(' ') || undefined}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute inset-y-0 end-0"
        aria-label={show ? t('auth.hide') : t('auth.show')}
        aria-pressed={show}
        onClick={() => setShow((v) => !v)}
      >
        {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  )
}

const BAR: Record<string, string> = { weak: 'bg-destructive', fair: 'bg-warning', good: 'bg-success', strong: 'bg-success' }
const TEXT: Record<string, string> = { weak: 'text-danger', fair: 'text-warning', good: 'text-success', strong: 'text-success' }

/**
 * Shows how strong the password is and which rules it already meets. Colour is never the only signal: the level is written out,
 * and each rule has a tick or an empty circle plus the words "done" / "not yet" for a screen reader. The level sits in a polite
 * live region that changes only when the level changes, so typing does not make it chatter. `id` is for aria-describedby on the field.
 */
export function PasswordStrength({ id, check }: { id: string; check: PasswordCheck }) {
  const { t } = useApp()
  const none = check.strength === 'none'
  return (
    <div id={id} className="grid gap-2 rounded-xl bg-muted/60 p-2.5">
      <div className="grid gap-1">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="font-semibold">{t('auth.strength')}</span>
          <span role="status" className={cn('font-semibold', !none && TEXT[check.strength])}>
            {none ? null : t(`auth.strength.${check.strength}` as Key)}
          </span>
        </div>
        <div aria-hidden="true" className="grid grid-cols-4 gap-1.5">
          {STRENGTH_STEPS.map((s, i) => (
            <span key={s} className={cn('h-1.5 rounded-full transition-colors duration-200 motion-reduce:transition-none', i < check.bars ? BAR[check.strength] : 'bg-foreground/20')} />
          ))}
        </div>
        {check.common && check.ok && <p className="text-sm font-semibold text-warning">{t('auth.common')}</p>}
      </div>

      {/* No visible heading: the four lines say what is needed. The list still has a name for screen readers. */}
      <div className="hidden gap-1.5 sm:grid">
        <ul aria-label={t('auth.rules')} className="grid gap-1 text-xs leading-tight sm:grid-cols-2 sm:gap-x-4">
          {check.rules.map((r) => (
            <li key={r.id} className={cn('flex items-start gap-1.5', r.met ? 'text-success' : 'text-muted-foreground')}>
              {r.met ? <Check aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.5} /> : <Circle aria-hidden="true" className="size-3.5 shrink-0" />}
              <span>
                {t(`auth.rule.${r.id}` as Key)}
                <span className="sr-only">{`: ${r.met ? t('auth.rule.met') : t('auth.rule.unmet')}`}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** "The passwords match" / "do not match", announced politely as the person types. Empty until there is something to compare. */
export function ConfirmStatus({ id, state }: { id: string; state: 'idle' | 'match' | 'mismatch' }) {
  const { t } = useApp()
  return (
    <p id={id} role="status" className={cn('flex min-h-5 items-center gap-1.5 text-sm font-semibold', state === 'match' ? 'text-success' : 'text-danger')}>
      {state === 'match' && (
        <>
          <Check aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.5} />
          {t('auth.confirmMatch')}
        </>
      )}
      {state === 'mismatch' && (
        <>
          <X aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.5} />
          {t('auth.confirmMismatch')}
        </>
      )}
    </p>
  )
}
