import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, ChevronRight, CircleAlert } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { BuilderCash } from '@/components/BuilderCash'
import { Card } from '@/components/ui/card'
import { useContracts, usePayments, usePhases, usePlans, useTransfers } from '@/db/hooks'
import { cashAdvice, forecast } from '@/lib/forecast'
import { money, todayISO } from '@/lib/format'
import { computeSettlement } from '@/lib/settlement'

/**
 * Home's short version of the Cash forecast: the next 7 and 30 days, each split into what you pay yourself and what the builder pays,
 * then (only when he has payments to make) a box that says what he must pay, what he holds and how much more to send. The whole card
 * opens the forecast. Hidden when nothing is planned at all.
 */
export function ForecastCard() {
  const { t, project } = useApp()
  const payments = usePayments(project?.id)
  const plans = usePlans(project?.id)
  const contracts = useContracts(project?.id)
  const transfers = useTransfers(project?.id)
  const phases = usePhases(project?.id)
  const today = todayISO()

  const f = useMemo(() => forecast({ payments, plans, contracts, today }), [payments, plans, contracts, today])
  const advice = useMemo(() => (project ? cashAdvice(computeSettlement(project, payments, transfers, phases, today).builderBalance, f.builderNext30) : undefined), [project, payments, transfers, phases, today, f.builderNext30])

  if (!project || !advice) return null
  if (f.next30 === 0 && f.later === 0 && f.unscheduledTotal === 0) return null

  const rows = [
    { label: t('forecast.next7'), total: f.next7, you: f.investorNext7, builder: f.builderNext7 },
    { label: t('forecast.next30'), total: f.next30, you: f.investorNext30, builder: f.builderNext30 },
  ]

  return (
    <Card className="gap-0 py-0 transition-colors hover:border-foreground/30">
      <Link to="/forecast" aria-label={t('nav.forecast')} className="grid gap-4 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-lg font-semibold">
            <Banknote aria-hidden="true" className="size-5 text-primary" />
            {t('nav.forecast')}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
            {t('home.viewAll')}
            <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" />
          </span>
        </span>

        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.label} className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:items-baseline sm:gap-4">
              <span className="text-sm text-muted-foreground">{r.label}</span>
              <span className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
                <span className="tabular text-lg font-extrabold">{money(r.total)}</span>
                <span className="text-sm text-muted-foreground">
                  {r.builder > 0 ? t('forecast.split', { you: money(r.you), builder: money(r.builder) }) : t('forecast.splitYou')}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {f.overdue > 0 && (
          <p className="flex items-start gap-1.5 text-sm font-semibold">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            {t('forecast.includesOverdue', { amount: money(f.overdue) })}
          </p>
        )}

        <BuilderCash advice={advice} />

        {f.unscheduledTotal > 0 && (
          <p className="text-sm text-muted-foreground">{t('forecast.unscheduledNote', { amount: money(f.unscheduledTotal) })}</p>
        )}
      </Link>
    </Card>
  )
}
