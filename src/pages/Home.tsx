import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarClock, HandCoins, ReceiptText, Target, TriangleAlert, Wallet, type LucideIcon } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '@/app/AppContext'
import { BudgetBar, CardSkeleton, EmptyState, PageHeader, StatusPill } from '@/components/common'
import { ApprovalsCard } from '@/components/ApprovalsCard'
import { AttentionCard } from '@/components/AttentionCard'
import { DueActions } from '@/components/DueActions'
import { ForecastCard } from '@/components/ForecastCard'
import { PaymentsTable } from '@/components/PaymentsTable'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { db } from '@/db/db'
import { useContracts, usePayments, usePhases, useReceiptIds } from '@/db/hooks'
import { attentionItems } from '@/lib/attention'
import { contractAlerts } from '@/lib/contracts'
import { addDays, formatDate, money, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { budgetLevel, buildAlerts, isAwaitingApproval, isPlanned, isSpent, percent, phaseProgress, sum } from '@/lib/stats'

// A 48 px tile per figure: a light background and the 500 shade of the same colour for the icon (400 on dark). The icon is decoration; the label and the
// figure carry the meaning.
const TONES = {
  orange: 'bg-orange-100 text-orange-500 dark:bg-orange-500/15 dark:text-orange-400',
  violet: 'bg-violet-100 text-violet-500 dark:bg-violet-500/15 dark:text-violet-400',
  emerald: 'bg-emerald-100 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-400',
  sky: 'bg-sky-100 text-sky-500 dark:bg-sky-500/15 dark:text-sky-400',
} as const

/**
 * One headline figure. The whole card is a link to the screen that explains it.
 * On a phone the icon is small and sits beside the label, so a tile is about a third shorter; from the `sm` breakpoint up it is the
 * 48 px tile above the text, as before. (The label is written twice, once for each layout; only one is displayed.)
 */
function Kpi({ label, value, icon: Icon, tone, to, children, className }: { label: string; value: string; icon: LucideIcon; tone: keyof typeof TONES; to: string; children?: React.ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'group relative flex flex-col gap-2 rounded-xl border bg-card p-3 text-card-foreground transition-colors duration-150 hover:border-foreground/30 hover:bg-muted/50 sm:gap-3 sm:p-4',
        className,
      )}
    >
      <span className="flex items-center gap-2 sm:contents">
        <span aria-hidden="true" className={cn('grid size-8 shrink-0 place-items-center rounded-lg sm:size-12 sm:rounded-xl', TONES[tone])}>
          <Icon className="size-[1.125rem] sm:size-6" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-muted-foreground sm:hidden">{label}</span>
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="absolute inset-e-3 top-3 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rtl:-scale-x-100 max-sm:hidden sm:inset-e-4 sm:top-4"
      />
      <span className="grid min-w-0 gap-1">
        <span className="text-sm font-medium text-muted-foreground max-sm:hidden">{label}</span>
        <span className="tabular text-[1.0625rem] font-extrabold whitespace-nowrap sm:text-2xl">{value}</span>
        {children}
      </span>
    </Link>
  )
}

export function Home() {
  const { t, lang, project, phaseName, settings } = useApp()
  // Due and upcoming starts with the three that are first in line; the rest open on request (up to eight).
  const [dueAll, setDueAll] = useState(false)
  const payments = usePayments(project?.id)
  const phases = usePhases(project?.id)
  const contracts = useContracts(project?.id)
  const receiptIds = useReceiptIds(project?.id)
  const live = payments.filter((p) => !p.deletedAt)
  // undefined until the first read finishes, so the empty "No payments yet" state never flashes.
  const liveCount = useLiveQuery(
    () => (project ? db.payments.where('projectId').equals(project.id).filter((p) => !p.deletedAt).count() : 0),
    [project?.id],
  )
  const spent = sum(live.filter(isSpent))
  const awaiting = sum(live.filter(isAwaitingApproval))
  const planned = live.filter(isPlanned).sort((a, b) => a.date.localeCompare(b.date))
  // Recent payments are the ones made (or turned down); the planned ones are in Due and upcoming.
  const recent = live.filter((p) => !isPlanned(p))
  const budget = project?.budget
  const left = budget ? budget - spent : undefined
  const lvl = budgetLevel(spent, budget)

  // The phases worth a line (spending or a budget; over budget first); the empty ones are only counted.
  const progress = phaseProgress(phases, payments)

  // Budgets over their limit, contracts overpaid, and the tidy-up items; due payments and approvals have their own cards.
  const attention = attentionItems(
    [...buildAlerts(project, phases, payments, phaseName, todayISO(), settings.role), ...contractAlerts(contracts, payments)],
    payments,
    receiptIds,
  ).slice(0, 8)
  // The Planned figure is shown only when something is planned; otherwise it is an empty tile that takes room.
  const showPlanned = planned.length > 0
  // A payment that is overdue or due within three days: on a phone its card moves above the recent payments.
  const urgent = planned.some((p) => p.date <= addDays(todayISO(), 3))

  if (!project) return null

  if (liveCount === undefined)
    return (
      <div className="grid gap-4" role="status" aria-busy="true">
        <span className="sr-only">{t('common.loading')}</span>
        <CardSkeleton className="h-16 max-w-sm" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <CardSkeleton className="h-64" />
      </div>
    )

  const dueCard = (
    <Card className={cn('gap-0 overflow-hidden py-0 md:order-none md:col-span-4 md:col-start-9 md:row-start-1', urgent ? 'max-md:order-3' : 'max-md:order-7')} aria-labelledby="due-title">
      <div className="flex flex-wrap items-center justify-between gap-x-3 p-4">
        <h2 id="due-title" className="text-lg font-semibold">
          {t('home.due')}
        </h2>
        <Link to="/plans" aria-label={t('due.manage')} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
          <span className="sm:hidden">{t('due.manageShort')}</span>
          <span className="max-sm:hidden">{t('due.manage')}</span>
        </Link>
      </div>
      {planned.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">{t('home.dueEmpty')}</p>
      ) : (
        <ul className="divide-y border-t">
          {planned.slice(0, dueAll ? 8 : 3).map((p) => (
            <li key={p.id} className="grid gap-3 p-4">
              <Link to={`/payments/${p.id}`} className="grid min-w-0 gap-1">
                <span className="truncate font-semibold">{p.purpose}</span>
                <span className="text-sm text-muted-foreground">
                  {formatDate(p.date, lang)} · <span className="tabular">{money(p.amount)}</span>
                </span>
                <StatusPill payment={p} />
              </Link>
              <DueActions payment={p} />
            </li>
          ))}
        </ul>
      )}
      {planned.length > 3 && (
        <button
          type="button"
          onClick={() => setDueAll((v) => !v)}
          aria-expanded={dueAll}
          className="min-h-11 border-t px-4 text-start text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          {dueAll ? t('home.dueLess') : t('attn.more', { count: Math.min(planned.length, 8) - 3 })}
        </button>
      )}
    </Card>
  )

  return (
    <>
      <PageHeader title={project.name} subtitle={project.location || undefined} />

      <section aria-label={t('home.budget')} className={cn('order-1 grid grid-cols-2 gap-3 md:order-none md:gap-6', showPlanned ? 'md:grid-cols-4' : 'md:grid-cols-3')}>
        <Kpi label={t('home.spent')} value={money(spent)} icon={HandCoins} tone="orange" to="/ledger">
          {awaiting > 0 && <span className="text-sm text-muted-foreground">{t('home.awaiting', { amount: money(awaiting) })}</span>}
        </Kpi>
        <Kpi label={t('home.budget')} value={budget ? money(budget) : '—'} icon={Target} tone="violet" to={budget ? '/phases' : `/projects/${project.id}/edit`}>
          {!budget && <span className="text-sm text-primary underline underline-offset-4">{t('home.noBudget')}</span>}
        </Kpi>
        <Kpi label={t('home.left')} value={left === undefined ? '—' : money(left)} icon={Wallet} tone="emerald" to="/phases" className={showPlanned ? undefined : 'max-sm:col-span-2'}>
          {budget ? (
            <>
              <BudgetBar spent={spent} budget={budget} label={t('home.budgetUsed', { pct: percent(spent, budget) })} />
              {lvl === 'error' || lvl === 'warning' ? (
                <Badge variant={lvl === 'error' ? 'danger' : 'warning'} className="w-fit">
                  {t('home.budgetUsed', { pct: percent(spent, budget) })}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">{t('home.budgetUsed', { pct: percent(spent, budget) })}</span>
              )}
            </>
          ) : null}
        </Kpi>
        {showPlanned && <Kpi label={t('home.planned')} value={money(sum(planned))} icon={CalendarClock} tone="sky" to="/ledger?status=planned" />}
      </section>

      <div className="order-2 empty:hidden md:order-none">
        <ApprovalsCard payments={live} />
      </div>

      <div className="order-4 empty:hidden md:order-none">
        <AttentionCard items={attention} />
      </div>

      <div className="order-5 empty:hidden md:order-none">
        <ForecastCard />
      </div>

      {/* On a phone this wrapper steps aside, so its cards take their place in the order above. */}
      <div className="grid gap-6 max-md:contents md:grid-cols-12">
        {/* On a phone a payment that is due or overdue comes before the recent payments; on a wide screen the places below hold. */}
        {urgent && dueCard}

        <Card className="gap-0 overflow-hidden py-0 max-md:order-6 md:col-span-8 md:col-start-1 md:row-span-2 md:row-start-1" aria-labelledby="recent-title">
          <div className="flex items-center justify-between gap-3 p-4">
            <h2 id="recent-title" className="text-lg font-semibold">
              {t('home.recent')}
            </h2>
            <Link to="/ledger" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
              {t('home.viewAll')}
            </Link>
          </div>
          {recent.length === 0 ? <EmptyState compact icon={ReceiptText} title={t('home.recentEmpty')} /> : <PaymentsTable payments={recent.slice(0, 6)} />}
        </Card>

        {!urgent && dueCard}

        <Card className="gap-0 overflow-hidden py-0 max-md:order-8 md:col-span-4 md:col-start-9 md:row-start-2" aria-labelledby="ph-title">
          <div className="flex flex-wrap items-center justify-between gap-x-3 p-4">
            <h2 id="ph-title" className="text-lg font-semibold">
              {t('home.phaseProgress')}
            </h2>
            <Link to="/phases" className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
              {t('home.viewAll')}
            </Link>
          </div>
          <div className="grid gap-4 border-t p-4">
            {progress.rows.map(({ phase: ph, spent: s, budget: b, pct, level }) => (
              <Link key={ph.id} to={`/phases/${ph.id}`} className="grid gap-1.5 rounded-md">
                <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-semibold">{phaseName(ph)}</span>
                  <span className="tabular ms-auto whitespace-nowrap text-muted-foreground">{b ? t('home.phaseOf', { spent: money(s), budget: money(b) }) : money(s)}</span>
                </span>
                {b ? (
                  <>
                    <BudgetBar spent={s} budget={b} label={phaseName(ph)} />
                    {level === 'error' || level === 'warning' ? (
                      <Badge variant={level === 'error' ? 'danger' : 'warning'} className="w-fit">
                        <TriangleAlert aria-hidden="true" />
                        {level === 'error' ? t(s > b ? 'home.phaseOver' : 'home.phaseReached') : t('phases.used', { pct })}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t('phases.used', { pct })}</span>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">{t('home.phaseNoBudget')}</span>
                )}
              </Link>
            ))}
            {progress.notStarted > 0 && <p className="text-sm text-muted-foreground">{t('home.phasesNotStarted', { count: progress.notStarted })}</p>}
            {progress.total > 0 && progress.budgeted * 2 < progress.total && (
              <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                <span>{t('home.phasesBudgeted', { budgeted: progress.budgeted, total: progress.total })}</span>
                <Link to="/phases" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
                  {t('home.phasesSetBudgets')}
                </Link>
              </p>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
