import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarClock, HandCoins, ReceiptText, Target, Wallet, type LucideIcon } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '@/app/AppContext'
import { BudgetBar, CardSkeleton, EmptyState, PageHeader, StatusPill } from '@/components/common'
import { ApprovalsCard } from '@/components/ApprovalsCard'
import { DueActions } from '@/components/DueActions'
import { PaymentsTable } from '@/components/PaymentsTable'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/db/db'
import { usePayments, usePhases } from '@/db/hooks'
import { formatDate, money } from '@/lib/format'
import { cn } from '@/lib/utils'
import { budgetLevel, isAwaitingApproval, isPlanned, isSpent, percent, sum } from '@/lib/stats'

// A 48 px tile per figure: a light background and the 500 shade of the same colour for the icon (400 on dark). The icon is decoration; the label and the
// figure carry the meaning.
const TONES = {
  orange: 'bg-orange-100 text-orange-500 dark:bg-orange-500/15 dark:text-orange-400',
  violet: 'bg-violet-100 text-violet-500 dark:bg-violet-500/15 dark:text-violet-400',
  emerald: 'bg-emerald-100 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-400',
  sky: 'bg-sky-100 text-sky-500 dark:bg-sky-500/15 dark:text-sky-400',
} as const

/** One headline figure. The whole card is a link to the screen that explains it. */
function Kpi({ label, value, icon: Icon, tone, to, children }: { label: string; value: string; icon: LucideIcon; tone: keyof typeof TONES; to: string; children?: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col gap-3 rounded-xl border bg-card p-3 text-card-foreground transition-colors duration-150 hover:border-foreground/30 hover:bg-muted/50 sm:p-4"
    >
      <span aria-hidden="true" className={cn('grid size-12 shrink-0 place-items-center rounded-xl', TONES[tone])}>
        <Icon className="size-6" strokeWidth={1.75} />
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="absolute inset-e-3 top-3 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rtl:-scale-x-100 max-sm:opacity-100 sm:inset-e-4 sm:top-4"
      />
      <span className="grid min-w-0 gap-1">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="tabular text-[1.0625rem] font-extrabold whitespace-nowrap sm:text-2xl">{value}</span>
        {children}
      </span>
    </Link>
  )
}

export function Home() {
  const { t, lang, project, phaseName } = useApp()
  const payments = usePayments(project?.id)
  const phases = usePhases(project?.id)
  const live = payments.filter((p) => !p.deletedAt)
  // undefined until the first read finishes, so the empty "No payments yet" state never flashes.
  const liveCount = useLiveQuery(
    () => (project ? db.payments.where('projectId').equals(project.id).filter((p) => !p.deletedAt).count() : 0),
    [project?.id],
  )
  const spent = sum(live.filter(isSpent))
  const awaiting = sum(live.filter(isAwaitingApproval))
  const planned = live.filter(isPlanned).sort((a, b) => a.date.localeCompare(b.date))
  const budget = project?.budget
  const left = budget ? budget - spent : undefined
  const lvl = budgetLevel(spent, budget)

  const byPhase = phases
    .map((ph) => ({ ph, spent: sum(live.filter((p) => p.phaseId === ph.id && isSpent(p))) }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5)

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

  return (
    <>
      <PageHeader title={project.name} subtitle={project.location || undefined} />

      <section aria-label={t('home.budget')} className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
        <Kpi label={t('home.spent')} value={money(spent)} icon={HandCoins} tone="orange" to="/ledger">
          {awaiting > 0 && <span className="text-sm text-muted-foreground">{t('home.awaiting', { amount: money(awaiting) })}</span>}
        </Kpi>
        <Kpi label={t('home.budget')} value={budget ? money(budget) : '—'} icon={Target} tone="violet" to={budget ? '/phases' : `/projects/${project.id}/edit`}>
          {!budget && <span className="text-sm text-primary underline underline-offset-4">{t('home.noBudget')}</span>}
        </Kpi>
        <Kpi label={t('home.left')} value={left === undefined ? '—' : money(left)} icon={Wallet} tone="emerald" to="/phases">
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
        <Kpi label={t('home.planned')} value={money(sum(planned))} icon={CalendarClock} tone="sky" to="/ledger?status=planned" />
      </section>

      <ApprovalsCard payments={live} />

      <div className="grid gap-6 md:grid-cols-12">
        <Card className="gap-0 overflow-hidden py-0 md:col-span-8" aria-labelledby="recent-title">
          <div className="flex items-center justify-between gap-3 p-4">
            <h2 id="recent-title" className="text-lg font-semibold">
              {t('home.recent')}
            </h2>
            <Link to="/ledger" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
              {t('home.viewAll')}
            </Link>
          </div>
          {live.length === 0 ? <EmptyState compact icon={ReceiptText} title={t('home.recentEmpty')} /> : <PaymentsTable payments={live.slice(0, 6)} />}
        </Card>

        <div className="grid content-start gap-6 md:col-span-4">
          <Card className="gap-0 overflow-hidden py-0" aria-labelledby="due-title">
            <div className="flex items-center justify-between gap-3 p-4">
              <h2 id="due-title" className="text-lg font-semibold">
                {t('home.due')}
              </h2>
              <Link to="/plans" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
                {t('due.manage')}
              </Link>
            </div>
            {planned.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">{t('home.dueEmpty')}</p>
            ) : (
              <ul className="divide-y border-t">
                {planned.slice(0, 5).map((p) => (
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
          </Card>

          <Card aria-labelledby="ph-title">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle id="ph-title" className="text-lg">
                {t('home.phaseProgress')}
              </CardTitle>
              <Link to="/phases" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
                {t('home.viewAll')}
              </Link>
            </CardHeader>
            <CardContent className="grid gap-4">
              {byPhase.map(({ ph, spent: s }) => (
                <Link key={ph.id} to={`/phases/${ph.id}`} className="grid gap-1.5 rounded-md">
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold">{phaseName(ph)}</span>
                    <span className="tabular text-muted-foreground">{money(s)}</span>
                  </span>
                  <BudgetBar spent={s} budget={ph.budget} label={phaseName(ph)} />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
