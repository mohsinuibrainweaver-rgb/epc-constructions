import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarClock, ChartLine, ChevronRight, CircleAlert, FileText, Wallet } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { CardHeading } from '@/components/CardHeading'
import { EmptyState, PageHeader } from '@/components/common'
import { ForecastChart, type ForecastColumn } from '@/components/ForecastChart'
import { Badge } from '@/components/ui/badge'
import { BuilderCash } from '@/components/BuilderCash'
import { ArrangeBox, ForecastTable } from '@/components/ForecastTable'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useContracts, usePayments, usePhases, usePlans, useTransfers, useVendors } from '@/db/hooks'
import { cashAdvice, forecast, type ForecastItem } from '@/lib/forecast'
import { formatDate, formatDayShort, money, todayISO } from '@/lib/format'
import { computeSettlement } from '@/lib/settlement'

/** What the coming weeks will cost: week by week, who pays, and what has no day yet. */
export function Forecast() {
  const { t, lang, project } = useApp()
  const payments = usePayments(project?.id)
  const plans = usePlans(project?.id)
  const contracts = useContracts(project?.id)
  const transfers = useTransfers(project?.id)
  const phases = usePhases(project?.id)
  const vendors = useVendors(project?.id)
  const today = todayISO()
  const [picked, setPicked] = useState<number | null>(null)
  const { hash } = useLocation()

  const f = useMemo(() => forecast({ payments, plans, contracts, today }), [payments, plans, contracts, today])
  const settlement = useMemo(() => (project ? computeSettlement(project, payments, transfers, phases, today) : undefined), [project, payments, transfers, phases, today])
  const advice = settlement ? cashAdvice(settlement.builderBalance, f.builderNext30) : undefined
  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors])

  // The columns: what is overdue (when there is any), then the weeks.
  const columns: ForecastColumn[] = useMemo(
    () => [
      ...(f.overdue > 0 ? [{ key: 'overdue', label: t('forecast.overdue'), scheduled: f.overdue, expected: 0, overdue: true }] : []),
      ...f.weeks.map((w) => ({ key: w.start, label: formatDayShort(w.start, lang), scheduled: w.scheduled, expected: w.expected })),
    ],
    [f, t, lang],
  )
  const hasOverdue = f.overdue > 0
  // Open on the first column that has money in it.
  const firstWithMoney = Math.max(0, columns.findIndex((c) => c.scheduled + c.expected > 0))
  const active = Math.min(picked ?? firstWithMoney, columns.length - 1)
  const weekIndex = active - (hasOverdue ? 1 : 0)
  const isOverdueCol = hasOverdue && active === 0
  const week = isOverdueCol ? undefined : f.weeks[weekIndex]
  const shown: ForecastItem[] = isOverdueCol ? f.items.filter((i) => i.overdue) : week ? f.items.filter((i) => !i.overdue && i.date >= week.start && i.date <= week.end) : []
  const shownTotal = shown.reduce((s, i) => s + i.amount, 0)
  const shownExpected = shown.filter((i) => i.kind === 'expected').reduce((s, i) => s + i.amount, 0)

  // Arriving from Home's "no day set yet" line: scroll to the contracts that still need a planned payment.
  const unplannedCount = f.unscheduled.length
  useEffect(() => {
    if (hash !== '#unplanned' || unplannedCount === 0) return
    const id = window.setTimeout(() => document.getElementById('unplanned')?.scrollIntoView({ block: 'start' }), 80)
    return () => window.clearTimeout(id)
  }, [hash, unplannedCount])

  if (!project) return null

  const nothing = f.items.length === 0 && f.later === 0 && f.unscheduled.length === 0
  if (nothing) {
    return (
      <>
        <PageHeader title={t('forecast.title')} />
        <Card>
          <EmptyState
            icon={CalendarClock}
            title={t('forecast.nothing')}
            body={t('forecast.nothingBody')}
            action={
              <Button variant="secondary" asChild>
                <Link to="/plans">{t('nav.plans')}</Link>
              </Button>
            }
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('forecast.title')} />
      <p className="-mt-3 text-muted-foreground">{t('forecast.intro')}</p>

      <Card className="gap-5 p-5">
        <div className="grid gap-1">
          <p className="text-sm font-medium text-muted-foreground">{t('forecast.heroTitle')}</p>
          <p className="tabular text-4xl leading-none font-extrabold tracking-tight sm:text-5xl">{money(f.next30)}</p>
          {f.overdue > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
              <CircleAlert aria-hidden="true" className="size-4 text-warning" />
              {t('forecast.includesOverdue', { amount: money(f.overdue) })}
            </p>
          )}
        </div>
        <div className="border-t pt-4">
          <ForecastTable f={f} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-4 sm:grid-cols-3">
          {[
            [t('forecast.overdue'), f.overdue],
            [t('forecast.later'), f.later],
            [t('forecast.unscheduled'), f.unscheduledTotal],
          ].map(([label, v]) => (
            <div key={label as string} className="grid gap-0.5">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="tabular text-lg font-extrabold">{money(v as number)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {advice && (
        <Card className="gap-3 p-4">
          <CardHeading icon={Wallet}>{t('forecast.cash')}</CardHeading>
          <p className="text-sm text-muted-foreground">{t('forecast.cashSub')}</p>
          {advice.needs > 0 ? <BuilderCash advice={advice} /> : <p className="text-muted-foreground">{t('forecast.noBuilderPay')}</p>}
          <ArrangeBox f={f} advice={advice} />
        </Card>
      )}

      <Card className="gap-4 p-4">
        <div className="grid gap-1">
          <CardHeading icon={ChartLine}>{t('forecast.chartTitle')}</CardHeading>
          <p className="text-sm text-muted-foreground">{t('forecast.chartSub')}</p>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <li>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 rounded-full bg-viz-b" />
              {t('forecast.legendScheduled')}
            </span>
          </li>
          <li>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 rounded-full border border-dashed border-viz-b bg-viz-b/30" />
              {t('forecast.legendExpected')}
            </span>
          </li>
          {hasOverdue && (
            <li>
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="h-3 w-3 rounded-full bg-viz-up" />
                {t('forecast.overdue')}
              </span>
            </li>
          )}
        </ul>
        <ForecastChart columns={columns} active={active} onPick={setPicked} format={money} />

        <div role="status" aria-live="polite" className="grid gap-3 rounded-xl bg-muted/60 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-semibold">{isOverdueCol ? t('forecast.overdue') : week ? t('forecast.weekOf', { from: formatDayShort(week.start, lang), to: formatDayShort(week.end, lang) }) : ''}</p>
            <p className="tabular font-extrabold">{money(shownTotal)}</p>
          </div>
          {shownExpected > 0 && <p className="text-sm text-muted-foreground">{t('forecast.expectedPart', { amount: money(shownExpected) })}</p>}
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('forecast.nothingDue')}</p>
          ) : (
            <ul className="divide-y">
              {shown.map((i) => {
                const vendor = i.vendorId ? vendorName.get(i.vendorId) : undefined
                const body = (
                  <span className="flex min-w-0 items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold [overflow-wrap:anywhere]">{i.purpose}</span>
                      <span className="block text-sm text-muted-foreground">
                        {[formatDate(i.date, lang), vendor, i.paidBy === 'builder' ? t('forecast.builderTag') : undefined].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="grid shrink-0 justify-items-end gap-1">
                      <span className="tabular font-bold whitespace-nowrap">{money(i.amount)}</span>
                      <Badge variant={i.overdue ? 'warning' : 'neutral'}>{i.kind === 'expected' ? t('forecast.expectedTag') : t('forecast.scheduledTag')}</Badge>
                    </span>
                    {i.paymentId && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />}
                  </span>
                )
                return (
                  <li key={`${i.paymentId ?? i.planId}-${i.date}-${i.kind}`}>
                    {i.paymentId ? (
                      <Link to={`/payments/${i.paymentId}`} className="block rounded-md hover:bg-accent/60">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t('forecast.chartExplain')}</p>
        {f.later > 0 && <p className="text-sm text-muted-foreground">{t('forecast.laterNote', { amount: money(f.later) })}</p>}
      </Card>

      {f.unscheduled.length > 0 && (
        <Card id="unplanned" className="scroll-mt-20 gap-3 p-4">
          <div className="grid gap-1">
            <CardHeading icon={FileText}>{t('forecast.contractsTitle')}</CardHeading>
            <p className="text-sm text-muted-foreground">{t('forecast.contractsNote')}</p>
          </div>
          <ul className="divide-y">
            {f.unscheduled.map(({ contract, amount }) => (
              <li key={contract.id}>
                <Link to={`/contracts/${contract.id}`} className="flex min-h-14 items-center gap-3 py-2.5 hover:bg-accent/60">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold [overflow-wrap:anywhere]">{contract.title}</span>
                    {contract.vendorId && <span className="block text-sm text-muted-foreground">{vendorName.get(contract.vendorId)}</span>}
                  </span>
                  <span className="tabular font-bold whitespace-nowrap">{money(amount)}</span>
                  <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">{t('forecast.note')}</p>
    </>
  )
}
