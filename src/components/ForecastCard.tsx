import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, ChevronRight, CircleAlert, TrendingUp } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useContracts, usePayments, usePhases, usePlans, useTransfers } from '@/db/hooks'
import { cashAdvice, forecast } from '@/lib/forecast'
import { money, todayISO } from '@/lib/format'
import { computeSettlement } from '@/lib/settlement'

/**
 * Home's short version of the Cash forecast: what the next 7 and 30 days need, what is overdue, what has no day yet, and when the
 * builder's cash will not cover what he is to pay. The whole card opens the forecast. Hidden when nothing is planned at all.
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
  const topUp = useMemo(() => (project ? cashAdvice(computeSettlement(project, payments, transfers, phases, today).builderBalance, f.builderNext30).topUp : 0), [project, payments, transfers, phases, today, f.builderNext30])

  if (!project) return null
  if (f.next30 === 0 && f.later === 0 && f.unscheduledTotal === 0) return null

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
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <div className="grid gap-0.5">
            <dt className="text-sm text-muted-foreground">{t('forecast.next7')}</dt>
            <dd className="tabular text-lg font-extrabold">{money(f.next7)}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-sm text-muted-foreground">{t('forecast.next30')}</dt>
            <dd className="tabular text-lg font-extrabold">{money(f.next30)}</dd>
          </div>
          {f.unscheduledTotal > 0 && (
            <div className="col-span-2 grid gap-0.5 sm:col-span-1">
              <dt className="text-sm text-muted-foreground">{t('forecast.unscheduled')}</dt>
              <dd className="tabular text-lg font-extrabold">{money(f.unscheduledTotal)}</dd>
            </div>
          )}
        </dl>
        {(f.overdue > 0 || topUp > 0) && (
          <span className="flex flex-wrap gap-2">
            {f.overdue > 0 && (
              <Badge variant="warning" className="h-auto w-fit whitespace-normal">
                <CircleAlert aria-hidden="true" />
                {t('forecast.includesOverdue', { amount: money(f.overdue) })}
              </Badge>
            )}
            {topUp > 0 && (
              <Badge variant="warning" className="h-auto w-fit whitespace-normal">
                <TrendingUp aria-hidden="true" />
                {t('forecast.topUp', { amount: money(topUp) })}
              </Badge>
            )}
          </span>
        )}
      </Link>
    </Card>
  )
}
