import { Children, cloneElement, isValidElement, useId, useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Ban, Bell, CircleArrowRight, CircleCheck, CircleX, Clock, CircleEllipsis, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import type { Payment } from '@/db/types'
import { addDays, todayISO } from '@/lib/format'
import { budgetState, budgetTone, percent } from '@/lib/stats'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Dialog as DialogRoot,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** Status badge: always an icon and a word, so it reads without colour (WCAG 1.4.1). */
export function StatusPill({ payment }: { payment: Pick<Payment, 'status' | 'date'> & Partial<Pick<Payment, 'approval'>> }) {
  const { t } = useApp()
  const today = todayISO()
  // A builder's entry that is not approved yet says so instead of "Paid".
  if (payment.approval === 'pending')
    return (
      <Badge variant="warning">
        <CircleEllipsis aria-hidden="true" data-solid="" />
        {t('approval.pending')}
      </Badge>
    )
  if (payment.approval === 'rejected')
    return (
      <Badge variant="danger">
        <CircleX aria-hidden="true" data-solid="" />
        {t('approval.rejected')}
      </Badge>
    )
  if (payment.status === 'paid')
    return (
      <Badge variant="success">
        <CircleCheck aria-hidden="true" data-solid="" />
        {t('status.paid')}
      </Badge>
    )
  if (payment.status === 'skipped')
    return (
      <Badge variant="neutral">
        <Ban aria-hidden="true" data-solid="" />
        {t('status.skipped')}
      </Badge>
    )
  if (payment.status === 'advance')
    return (
      <Badge variant="info">
        <CircleArrowRight aria-hidden="true" data-solid="" />
        {t('status.advance')}
      </Badge>
    )
  if (payment.date < today)
    return (
      <Badge variant="danger">
        <TriangleAlert aria-hidden="true" data-solid="" />
        {t('status.overdue')}
      </Badge>
    )
  if (payment.date <= addDays(today, 3))
    return (
      <Badge variant="warning">
        <Bell aria-hidden="true" data-solid="" />
        {t('status.due')}
      </Badge>
    )
  return (
    <Badge variant="neutral">
      <Clock aria-hidden="true" data-solid="" />
      {t('status.planned')}
    </Badge>
  )
}

/** Progress bar; neutral under 80 percent, amber from 80, red from 100. The percentage is also printed by callers. */
export function BudgetBar({ spent, budget, label, className }: { spent: number; budget?: number; label?: string; /** Replaces the track colour (a mesh card wants a white one). */ className?: string }) {
  const tone = budgetTone(budgetState(spent, budget))
  const pct = Math.min(percent(spent, budget), 100)
  return (
    <Progress
      value={pct}
      aria-label={label ?? `${percent(spent, budget)}%`}
      className={cn(
        'h-2 bg-muted',
        tone === 'warning' && '[&>[data-slot=progress-indicator]]:bg-warning',
        tone === 'danger' && '[&>[data-slot=progress-indicator]]:bg-danger',
        className,
      )}
    />
  )
}

/**
 * What a list or page shows when there is nothing in it (or nothing matches). One recipe everywhere:
 * a simple icon (decorative), a message that names what to do, one sentence of why, and at most one button.
 * `compact` is for a list inside a card that already has its own title and add button.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  compact,
  asH1,
}: {
  icon?: LucideIcon
  title: string
  body?: string
  action?: ReactNode
  compact?: boolean
  /** The title is the page's only heading (a page with nothing else on it, such as "not found"). */
  asH1?: boolean
}) {
  const Title = asH1 ? 'h1' : 'p'
  return (
    <div className={cn('mx-auto flex w-full max-w-sm flex-col items-center text-center', compact ? 'px-4 py-6' : 'px-4 py-10 md:py-12')}>
      {Icon && (
        <span
          aria-hidden="true"
          className={cn('glass-tile mb-3 grid shrink-0 place-items-center', compact ? 'size-10 rounded-xl' : 'size-14 rounded-2xl')}
        >
          <Icon className={compact ? 'size-5' : 'size-7'} strokeWidth={1.75} />
        </span>
      )}
      <Title className="text-lg leading-snug font-semibold text-balance">{title}</Title>
      {body && <p className="mt-2 text-sm/relaxed text-muted-foreground text-balance">{body}</p>}
      {action && <div className="mt-4 flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </div>
  )
}

/**
 * Modal dialog. Radix handles focus trapping and Escape; it slides up as a sheet on phones. These dialogs are opened by
 * state, not by a Radix trigger, so the element that had focus when one opened is remembered here and given focus back
 * when it closes (WCAG 2.4.3): a keyboard or screen-reader user lands where they were, not at the top of the page.
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const { t } = useApp()
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [open])
  return (
    <DialogRoot open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          const el = opener.current
          if (el && el.isConnected && el !== document.body) {
            e.preventDefault()
            el.focus()
          }
        }}
        showCloseButton={false}
        className="max-h-[calc(100dvh-1rem)] gap-0 overflow-hidden p-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none max-sm:data-[state=open]:slide-in-from-bottom"
      >
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b p-4 text-start">
          <div className="grid gap-1">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={description ? undefined : 'sr-only'}>{description ?? title}</DialogDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close')}>
            <X aria-hidden="true" />
          </Button>
        </DialogHeader>
        <div className="grid max-h-[65dvh] gap-4 overflow-y-auto p-4">{children}</div>
        {footer && <DialogFooter className="flex-row flex-wrap justify-end gap-2 border-t p-4 max-sm:[&>*:not(:only-child)]:grow max-sm:[&>*:not(:only-child)]:basis-[calc(50%-0.25rem)]">{footer}</DialogFooter>}
      </DialogContent>
    </DialogRoot>
  )
}

/**
 * Label + control + hint + error. The control gets the id, aria-invalid and aria-describedby automatically,
 * so every field is announced with its label, hint and error by screen readers (WCAG 1.3.1, 3.3.1, 3.3.2).
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string
  hint?: string
  error?: string
  htmlFor?: string
  className?: string
  children: ReactNode
}) {
  const auto = useId()
  const id = htmlFor ?? auto
  const hintId = `${id}-hint`
  const errId = `${id}-error`
  const describedBy = [hint && !error ? hintId : undefined, error ? errId : undefined].filter(Boolean).join(' ') || undefined
  const only = Children.count(children) === 1 && isValidElement(children) ? (children as ReactElement<Record<string, unknown>>) : null
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      {only
        ? cloneElement(only, {
            id,
            'aria-invalid': error ? true : only.props['aria-invalid'],
            'aria-describedby': describedBy,
          })
        : children}
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/** A group label for radio groups, tied to the group with aria-labelledby. */
export function GroupField({ label, children, className }: { label: string; children: (labelId: string) => ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={cn('grid gap-1.5', className)}>
      <span id={id} className="text-sm font-semibold">
        {label}
      </span>
      {children(id)}
    </div>
  )
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="-ms-3 w-fit">
      <Link to={to}>
        <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
        {label}
      </Link>
    </Button>
  )
}

export function PageHeader({ title, subtitle, actions, phoneTitleHidden, subtitleClassName, titleClassName, actionsBeside }: { title: string; subtitle?: string; actions?: ReactNode; /** On a phone the app bar already shows this name, so the big heading is kept for screen readers only. */ phoneTitleHidden?: boolean; subtitleClassName?: string; titleClassName?: string; /** On a phone (360 px and wider) keep the buttons on the heading's line (at its end) instead of wrapping under it; a long heading then takes two lines. */ actionsBeside?: boolean }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', actionsBeside && 'max-sm:min-[360px]:flex-nowrap', phoneTitleHidden && !subtitle && !actions && 'max-sm:contents')}>
      <div className={cn('min-w-0', actionsBeside && 'max-sm:min-[360px]:flex-1')}>
        <h1 className={cn('text-2xl font-semibold tracking-tight text-balance sm:text-3xl', phoneTitleHidden && 'max-sm:sr-only', titleClassName)}>{title}</h1>
        {subtitle && <p className={cn('text-muted-foreground', subtitleClassName)}>{subtitle}</p>}
      </div>
      {actions && <div className={cn('flex flex-wrap items-center gap-2', actionsBeside && 'max-sm:min-[360px]:shrink-0 max-sm:min-[360px]:flex-nowrap')}>{actions}</div>}
    </div>
  )
}

/** Shown while the first read from the local database finishes. */
export function CardSkeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('h-24 animate-pulse rounded-xl bg-muted', className)} />
}
