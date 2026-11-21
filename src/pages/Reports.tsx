import { useMemo } from 'react'
import { ChartColumn } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { EmptyState, PageHeader } from '@/components/common'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { usePayments, usePhases, useVendors } from '@/db/hooks'
import type { Key } from '@/i18n/en'
import { formatMonth, money, monthKey, todayISO } from '@/lib/format'
import { isSpent } from '@/lib/stats'
import { spendingTrend } from '@/lib/trend'
import { TrendChart } from '@/components/TrendChart'
import { MaterialPrices } from '@/components/MaterialPrices'
import { priceCoverage, priceRows } from '@/lib/materials'

interface Row {
  label: string
  amount: number
}

function Breakdown({ title, rows }: { title: string; rows: Row[] }) {
  const { t } = useApp()
  const max = Math.max(1, ...rows.map((r) => r.amount))
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <Card className="h-full gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <strong className="tabular">{money(total)}</strong>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t('reports.noData')}</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.label} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold">{r.label}</span>
                <span className="tabular">{money(r.amount)}</span>
              </div>
              <Progress value={(r.amount / max) * 100} aria-label={r.label} className="h-2 bg-muted" />
            </li>
          ))}
        </ul>
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
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
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
