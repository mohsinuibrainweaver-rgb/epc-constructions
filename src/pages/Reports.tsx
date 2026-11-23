import { useEffect, useMemo, useState } from 'react'
import { ChartColumn } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { EmptyState, PageHeader } from '@/components/common'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ViewTabs } from '@/components/ui/tabs'
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

type View = 'phase' | 'vendor' | 'category' | 'month' | 'mode' | 'materials'

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

  // On a phone the spending graph stays on top and the tabs under it choose which breakdown shows; from `sm` up every report is on the page as before.
  const views: { value: View; label: string }[] = [
    { value: 'phase', label: t('reports.tabPhase') },
    { value: 'vendor', label: t('reports.tabVendor') },
    { value: 'category', label: t('reports.tabCategory') },
    { value: 'month', label: t('reports.tabMonth') },
    { value: 'mode', label: t('reports.tabMode') },
    { value: 'materials', label: t('reports.tabMaterials') },
  ]
  const [view, setView] = useState<View>('phase')
  // The tab highlight moves at once; the report below fades out, then the next one fades in, so the card does not jump in height.
  const [shown, setShown] = useState<View>(view)
  const [fading, setFading] = useState(false)
  useEffect(() => {
    if (view === shown) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(view)
      return
    }
    setFading(true)
    const id = window.setTimeout(() => {
      setShown(view)
      setFading(false)
    }, 110)
    return () => window.clearTimeout(id)
  }, [view, shown])
  const only = (v: View) =>
    cn(
      'min-w-0',
      shown !== v && 'max-sm:hidden',
      shown === v && (fading ? 'max-sm:opacity-0 max-sm:transition-opacity max-sm:duration-100' : 'max-sm:motion-safe:animate-in max-sm:motion-safe:fade-in-0 max-sm:motion-safe:duration-200'),
    )

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
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 md:grid-cols-2 md:gap-6">
            {trend.length > 0 && (
              <div className="min-w-0">
                <TrendChart points={trend} budget={project?.budget} />
              </div>
            )}
            <div className="min-w-0 sm:hidden">
              <ViewTabs oneLine label={t('reports.title')} value={view} onValueChange={(v) => setView(v as View)} tabs={views} />
            </div>
            <div className={only('phase')}>
              <Breakdown title={t('reports.byPhase')} rows={data.phase} />
            </div>
            <div className={only('vendor')}>
              <Breakdown title={t('reports.byVendor')} rows={data.vendor} />
            </div>
            <div className={only('category')}>
              <Breakdown title={t('reports.byCategory')} rows={data.category} />
            </div>
            <div className={only('month')}>
              <Breakdown title={t('reports.byMonth')} rows={data.month} />
            </div>
            <div className={only('mode')}>
              <Breakdown title={t('reports.byMode')} rows={data.mode} />
            </div>
            <div className={cn(only('materials'), 'md:col-span-2')}>
              <MaterialPrices rows={prices} coverage={coverage} className="grid gap-3" />
            </div>
          </div>
        </>
      )}
    </>
  )
}
