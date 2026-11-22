import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { updateProject } from '@/db/actions'
import type { Payment, Phase } from '@/db/types'
import { groupDigits, money, parseAmount } from '@/lib/format'
import { budgetOutlook, percent, type BudgetOutlook as Outlook } from '@/lib/stats'
import { cn } from '@/lib/utils'

/** The sentence about the phases nobody has priced yet: how much room the budget leaves for them. */
function roomText(o: Outlook, t: ReturnType<typeof useApp>['t']): string | undefined {
  if (o.headroom === undefined) return undefined
  if (o.headroom >= 0) {
    if (o.unpriced === 0) return t('outlook.leftNone', { amount: money(o.headroom) })
    if (o.unpriced === 1) return t('outlook.roomOne', { amount: money(o.headroom) })
    return t('outlook.roomMany', { count: o.unpriced, amount: money(o.headroom), each: money(o.headroomEach) })
  }
  return o.unpriced > 0 ? t('outlook.shortMany', { count: o.unpriced, amount: money(-o.headroom) }) : t('outlook.shortNone', { amount: money(-o.headroom) })
}

function BudgetDialog({ open, phases, payments, onClose }: { open: boolean; phases: Phase[]; payments: Payment[]; onClose: () => void }) {
  const { t, project } = useApp()
  const toast = useToast()
  const [value, setValue] = useState('')
  const [wasOpen, setWasOpen] = useState(false)
  // Start from the current budget each time the dialog opens.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setValue(project?.budget ? groupDigits(String(project.budget)) : '')
  }
  const typed = parseAmount(value)
  const preview = budgetOutlook(phases, payments, typed || undefined)

  const save = async () => {
    if (!project) return
    await updateProject(project.id, { budget: typed > 0 ? typed : undefined })
    toast.show({ kind: 'success', message: t('pay.updated') })
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={t('outlook.dialogTitle')}
      description={t('outlook.dialogHint')}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label={t('outlook.newBudget')} htmlFor="project-budget">
          <Input className="tabular h-12 text-lg font-bold" inputMode="numeric" autoFocus autoComplete="off" value={value} onChange={(e) => setValue(groupDigits(e.target.value))} />
        </Field>
        {/* What the new figure would mean, as it is typed. */}
        <p role="status" className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{t('outlook.withThis')}</span> {roomText(preview, t) ?? t('outlook.setBudget')}
        </p>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}

/**
 * Where the money stands, built from what has been paid: finished and unfinished phases, what the estimates still expect, and how much
 * of the project budget is left for the phases that have no estimate yet. Nothing has to be estimated in advance for it to be useful, and
 * the budget itself is a working figure that can be changed here at any time.
 */
export function BudgetOutlookCard({ phases, payments }: { phases: Phase[]; payments: Payment[] }) {
  const { t, project, can } = useApp()
  const [dialog, setDialog] = useState(false)
  const o = budgetOutlook(phases, payments, project?.budget)
  const canEdit = Boolean(project && can('editProject'))

  const scale = Math.max(o.budget ?? 0, o.projectedLow, 1)
  const pct = (n: number) => `${Math.max(0, (n / scale) * 100)}%`
  const room = o.headroom && o.headroom > 0 ? o.headroom : 0
  const pastBudget = o.budget !== undefined && o.projectedLow > o.budget
  const segments = [
    { key: 'done', label: t('outlook.finished'), amount: o.spentDone, className: 'bg-success' },
    { key: 'open', label: t('outlook.unfinished'), amount: o.spentOpen, className: 'bg-primary' },
    { key: 'outside', label: t('outlook.noPhase'), amount: o.outside, className: 'bg-primary/50' },
    { key: 'expected', label: t('outlook.expected'), amount: o.estimatedLeft, className: 'bg-primary/20' },
    { key: 'room', label: t('outlook.room'), amount: room, className: 'bg-border' },
  ].filter((s) => s.amount > 0)
  const text = roomText(o, t)

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">{t('outlook.title')}</h2>
        <span className="text-sm text-muted-foreground">{t('outlook.done', { done: o.done, total: o.total })}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base">{o.budget ? t('outlook.spentOf', { spent: money(o.spent), budget: money(o.budget), pct: percent(o.spent, o.budget) }) : t('outlook.spentOnly', { spent: money(o.spent) })}</p>
        {canEdit && (
          <Button type="button" size="sm" variant="outline" onClick={() => setDialog(true)}>
            <Pencil aria-hidden="true" />
            {o.budget ? t('outlook.change') : t('outlook.setBudgetBtn')}
          </Button>
        )}
      </div>

      {segments.length > 0 && (
        <>
          <div
            role="img"
            aria-label={segments.map((s) => `${s.label}: ${money(s.amount)}`).join(', ')}
            className="relative flex h-3 w-full overflow-hidden rounded-full bg-muted"
          >
            {segments.map((s) => (
              <span key={s.key} className={cn('h-full transition-[width] duration-300 motion-reduce:transition-none', s.className)} style={{ width: pct(s.amount) }} />
            ))}
            {pastBudget && o.budget && <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-foreground" style={{ insetInlineStart: pct(o.budget) }} />}
          </div>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {segments.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-start gap-2">
                  <span aria-hidden="true" className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', s.className)} />
                  <span className="leading-snug text-muted-foreground">{s.label}</span>
                </span>
                <span className="tabular shrink-0 font-semibold">{money(s.amount)}</span>
              </li>
            ))}
            {pastBudget && o.budget && (
              <li className="flex items-center justify-between gap-3 font-semibold text-danger sm:col-span-2">
                <span>{t('outlook.over')}</span>
                <span className="tabular">{money(o.projectedLow - o.budget)}</span>
              </li>
            )}
          </ul>
        </>
      )}

      {o.budget ? (
        text && <p className="text-sm font-medium">{text}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t('outlook.setBudget')}</p>
      )}
      {(o.unpriced > 0 || o.estimatedLeft > 0) && o.projectedLow > 0 && <p className="text-sm text-muted-foreground">{t('outlook.atLeast', { amount: money(o.projectedLow) })}</p>}

      <BudgetDialog open={dialog} phases={phases} payments={payments} onClose={() => setDialog(false)} />
    </Card>
  )
}
