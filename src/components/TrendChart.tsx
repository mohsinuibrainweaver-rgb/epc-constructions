import { useEffect, useRef, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { CardHeading } from '@/components/CardHeading'
import { Card } from '@/components/ui/card'
import { formatMonth, formatMonthShort, money } from '@/lib/format'
import { compact, niceCeil, noBreak } from '@/lib/chart'
import type { TrendPoint } from '@/lib/trend'

const H = 200
const PAD = { top: 12, right: 12, bottom: 26, left: 44 }


/**
 * Total spent month by month as a line, with the planned payments continuing it as a dashed line, and the project budget as a
 * reference when it is not far above the spending. Plain SVG, no chart library; the figures are also in a hidden table for screen readers.
 */
export function TrendChart({ points, budget }: { points: TrendPoint[]; budget?: number }) {
  const { t, lang } = useApp()
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setWidth(Math.max(240, Math.round(el.clientWidth)))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const last = points[points.length - 1]
  const dataMax = Math.max(1, ...points.map((p) => p.withPlanned))
  const showBudget = budget !== undefined && budget > 0 && budget <= dataMax * 2.5
  const highest = Math.max(dataMax, showBudget ? budget : 0)
  const tickStep = niceCeil(highest / 3) // round steps (25K, 50K, 75K), so the labels read easily
  const top = Math.ceil(highest / tickStep) * tickStep
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const n = points.length
  const x = (i: number): number => PAD.left + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1))
  const y = (v: number): number => PAD.top + innerH - (v / top) * innerH

  const firstFuture = points.findIndex((p) => p.future)
  const pastEnd = firstFuture === -1 ? n - 1 : firstFuture - 1 // index of the current month
  const path = (from: number, to: number, value: (p: TrendPoint) => number): string =>
    points
      .slice(from, to + 1)
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${x(from + k).toFixed(1)},${y(value(p)).toFixed(1)}`)
      .join(' ')
  const spentPath = pastEnd >= 0 ? path(0, pastEnd, (p) => p.spent) : ''
  const area = pastEnd >= 0 ? `${spentPath} L${x(pastEnd).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : ''
  const hasForecast = points.some((p) => p.withPlanned > p.spent)
  const forecastPath = hasForecast ? path(Math.max(0, pastEnd), n - 1, (p) => p.withPlanned) : ''

  const ticks = Array.from({ length: Math.round(top / tickStep) + 1 }, (_, k) => k * tickStep)
  const maxLabels = Math.max(2, Math.floor(innerW / 64))
  const step = Math.ceil(n / maxLabels)
  const labelAt = (i: number): boolean => i % step === 0

  return (
    <Card className="gap-4 p-4 md:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <CardHeading icon={TrendingUp}>{t('reports.trend')}</CardHeading>
        <strong className="tabular">{money(points[Math.max(0, pastEnd)]?.spent ?? 0)}</strong>
      </div>

      <div ref={box} dir="ltr" className="w-full">
        <svg width={width} height={H} role="img" aria-label={t('reports.trendAria', { spent: money(points[Math.max(0, pastEnd)]?.spent ?? 0) })} className="block max-w-full overflow-visible">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground" fontSize={12}>
                {compact(v)}
              </text>
            </g>
          ))}
          {showBudget && (
            <g>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(budget)} y2={y(budget)} className="stroke-warning" strokeWidth={1.5} strokeDasharray="2 4" />
              <text x={width - PAD.right} y={y(budget) - 5} textAnchor="end" className="fill-warning" fontSize={12} fontWeight={600}>
                {t('reports.trendBudget')}
              </text>
            </g>
          )}
          {area && <path d={area} className="fill-primary/10" />}
          {forecastPath && <path d={forecastPath} fill="none" className="stroke-muted-foreground" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />}
          {spentPath && <path d={spentPath} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
          {hasForecast && pastEnd === n - 1 && last.withPlanned > last.spent && (
            <circle cx={x(n - 1)} cy={y(last.withPlanned)} r={4} className="fill-card stroke-muted-foreground" strokeWidth={2} />
          )}
          {pastEnd >= 0 && <circle cx={x(pastEnd)} cy={y(points[pastEnd].spent)} r={4} className="fill-primary stroke-card" strokeWidth={2} />}
          {points.map((p, i) =>
            labelAt(i) ? (
              <text key={p.month} x={x(i)} y={H - 6} textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'} className="fill-muted-foreground" fontSize={12}>
                {formatMonthShort(p.month, lang)}
              </text>
            ) : null,
          )}
        </svg>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-primary" />
          {t('reports.trendSpent')}
        </li>
        {hasForecast && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="w-5 border-t-2 border-dashed border-muted-foreground" />
            {t('reports.trendForecast', { total: noBreak(money(last.withPlanned)) })}
          </li>
        )}
        {showBudget && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="w-5 border-t-2 border-dotted border-warning" />
            {t('reports.trendBudgetLine', { total: noBreak(money(budget)) })}
          </li>
        )}
      </ul>

      <div className="sr-only"><table>
        <caption>{t('reports.trend')}</caption>
        <thead>
          <tr>
            <th>{t('ledger.month')}</th>
            <th>{t('reports.trendSpent')}</th>
            <th>{t('reports.trendForecastCol')}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.month}>
              <td>{formatMonth(p.month, lang)}</td>
              <td>{p.future ? '' : money(p.spent)}</td>
              <td>{money(p.withPlanned)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </Card>
  )
}
