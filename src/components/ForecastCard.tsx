import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, ChevronRight, CircleAlert } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { ArrangeBox } from '@/components/ForecastTable'
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

  return (
    <Card className="gap-0 overflow-hidden py-0 transition-colors hover:border-foreground/30">
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

        <dl className="grid grid-cols-2 gap-x-4">
          <div className="grid gap-0.5">
            <dt className="text-sm text-muted-foreground">{t('forecast.next7')}</dt>
            <dd className="tabular text-lg font-extrabold">{money(f.next7)}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-sm text-muted-foreground">{t('forecast.next30')}</dt>
            <dd className="tabular text-lg font-extrabold">{money(f.next30)}</dd>
          </div>
        </dl>

        {f.overdue > 0 && (
          <p className="flex items-start gap-1.5 text-sm font-semibold">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            {t('forecast.includesOverdue', { amount: money(f.overdue) })}
          </p>
        )}

        <ArrangeBox f={f} advice={advice} />

      </Link>

      {f.unscheduled.length > 0 && (
        <Link to="/forecast#unplanned" className="grid gap-1.5 border-t p-4 text-sm hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
          <span className="flex items-center justify-between gap-3 font-semibold">
            {t('forecast.unscheduledHead')}
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
          </span>
          <ul className="grid gap-1">
            {f.unscheduled.slice(0, 2).map(({ contract, amount }) => (
              <li key={contract.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">{contract.title}</span>
                <span className="tabular font-semibold whitespace-nowrap">{money(amount)}</span>
              </li>
            ))}
          </ul>
          {f.unscheduled.length > 2 && <span className="text-muted-foreground">{t('forecast.unscheduledMore', { count: f.unscheduled.length - 2 })}</span>}
        </Link>
      )}
    </Card>
  )
}
