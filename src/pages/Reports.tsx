import { useMemo, useState } from 'react'
import { ChartColumn } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { EmptyState, PageHeader } from '@/components/common'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { usePayments, usePhases, useVendors } from '@/db/hooks'
import type { Key } from '@/i18n/en'
import { formatMonth, money, monthKey, todayISO } from '@/lib/format'
import { isSpent } from '@/lib/stats'
import { cn } from '@/lib/utils'
import { spendingTrend } from '@/lib/trend'
import { TrendChart } from '@/components/TrendChart'
import { MaterialPrices } from '@/components/MaterialPrices'
import { priceCoverage, priceRows } from '@/lib/materials'

interface Row {
  label: string
  amount: number
}

/** On a phone a long list shows its top rows and a button for the rest (the list is already sorted by amount); from `sm` up every row shows. */
const PHONE_ROWS = 5

function Breakdown({ title, rows }: { title: string; rows: Row[] }) {
  const { t } = useApp()
  const [all, setAll] = useState(false)
  const max = Math.max(1, ...rows.map((r) => r.amount))
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const extra = rows.length - PHONE_ROWS
  const listId = `bd-${title.replace(/\W+/g, '-')}`
  return (
    <Card className="h-full gap-3 p-4 sm:gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
        <strong className="tabular">{money(total)}</strong>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t('reports.noData')}</p>
      ) : (
        <ul id={listId} className="grid gap-2.5 sm:gap-3">
          {rows.map((r, i) => (
            <li key={r.label} className={cn('grid gap-1 sm:gap-1.5', !all && i >= PHONE_ROWS && 'max-sm:hidden')}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{r.label}</span>
                <span className="tabular whitespace-nowrap">{money(r.amount)}</span>
              </div>
              <Progress value={(r.amount / max) * 100} aria-label={r.label} className="h-1.5 bg-muted sm:h-2" />
            </li>
          ))}
        </ul>
      )}
      {extra > 0 && (
        <button
          type="button"
          aria-expanded={all}
          aria-controls={listId}
          onClick={() => setAll((v) => !v)}
          className="-mb-1 min-h-11 w-full rounded-md border-t pt-1 text-start text-sm font-semibold text-primary active:bg-accent sm:hidden"
        >
          {all ? t('attn.less') : t('attn.more', { count: extra })}
        </button>
      )}
    </Card>
  )
}

function group<T>(items: T[], key: (x: T) => string, amount: (x: T) => number): Row[] {
  const m = new Map<string, number>()
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + amount(i))
  return [...m].map(([label, a]) => ({ label, amount: a })).sort((a, b) => b.amount - a.amount)
}

export function Reports() {
  const { t, lang, project, phaseName } = useApp()
  const everything = usePayments(project?.id)
  const payments = everything.filter((p) => isSpent(p))
  const trend = useMemo(() => spendingTrend(everything, todayISO().slice(0, 7)), [everything])
  const phases = usePhases(project?.id)
  const vendors = useVendors(project?.id)
  const prices = useMemo(() => priceRows(everything), [everything])
  const coverage = useMemo(() => priceCoverage(everything), [everything])

  const data = useMemo(() => {
    const phaseMap = new Map(phases.map((p) => [p.id, phaseName(p)]))
    const vendorMap = new Map(vendors.map((v) => [v.id, v.name]))
    return {
      phase: group(payments, (p) => (p.phaseId && phaseMap.get(p.phaseId)) || t('reports.noPhase'), (p) => p.amount),
      vendor: group(payments, (p) => (p.vendorId && vendorMap.get(p.vendorId)) || p.payeeName || t('reports.noVendor'), (p) => p.amount),
      category: group(
        payments,
        (p) => (p.category === 'misc' && p.miscType ? `${t('cat.misc')}: ${t(`misc.${p.miscType}` as Key)}` : t(`cat.${p.category}` as Key)),
        (p) => p.amount,
      ),
      month: group(payments, (p) => monthKey(p.date), (p) => p.amount)
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((r) => ({ ...r, label: formatMonth(r.label, lang) })),
      mode: group(payments, (p) => t(p.mode === 'cash' ? 'mode.cash' : 'mode.bank'), (p) => p.amount),
    }
  }, [payments, phases, vendors, phaseName, t, lang])

  return (
    <>
      <PageHeader title={t('reports.title')} />
      {payments.length === 0 ? (
        <Card>
          <EmptyState icon={ChartColumn} title={t('reports.empty')} body={t('reports.emptyBody')} />
        </Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 md:grid-cols-2 md:gap-6">
          {trend.length > 0 && <TrendChart points={trend} budget={project?.budget} />}
          <Breakdown title={t('reports.byPhase')} rows={data.phase} />
          <Breakdown title={t('reports.byVendor')} rows={data.vendor} />
          <Breakdown title={t('reports.byCategory')} rows={data.category} />
          <Breakdown title={t('reports.byMonth')} rows={data.month} />
          <Breakdown title={t('reports.byMode')} rows={data.mode} />
          <MaterialPrices rows={prices} coverage={coverage} className="grid gap-3 md:col-span-2" />
        </div>
      )}
    </>
  )
}
