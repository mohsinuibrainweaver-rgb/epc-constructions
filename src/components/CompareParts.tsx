import { useState } from 'react'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Badge } from '@/components/ui/badge'
import { useElementWidth } from '@/components/useElementWidth'
import type { Delta } from '@/lib/compare'
import { axisTicks, compact, noBreak } from '@/lib/chart'
import { meshCard } from '@/lib/mesh'
import { cn } from '@/lib/utils'

/** "+17%" / "-5%" for a percent. */
export const pctText = (pct: number): string => `${pct > 0 ? '+' : ''}${pct}%`

/** The two projects everywhere on the Compare page: the earlier one is orange, this one is blue. Colour marks only; text stays in ink. */
export const SIDE_A = { bar: 'bg-viz-a', stroke: 'stroke-viz-a', fill: 'fill-viz-a' }
export const SIDE_B = { bar: 'bg-viz-b', stroke: 'stroke-viz-b', fill: 'fill-viz-b' }

/** A colour key and a name: the mark beside the text carries the identity, the text stays in ink. */
export function KeyChip({ side, children }: { side: 'a' | 'b'; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className={cn('h-3 w-3 shrink-0 rounded-full', side === 'a' ? SIDE_A.bar : SIDE_B.bar)} />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  )
}

export function Legend() {
  const { t } = useApp()
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
      <li>
        <KeyChip side="a">{t('compare.projectA')}</KeyChip>
      </li>
      <li>
        <KeyChip side="b">{t('compare.projectB')}</KeyChip>
      </li>
    </ul>
  )
}

/**
 * How B stands against A, in words and an icon (never colour alone): more, less or the same. Higher cost is a warning,
 * lower is good news. The word already says the direction, so the numbers have no sign. `format` writes an amount;
 * `showAmount` adds the difference in money to the percent. `soFar`: one of the two is not finished, so the difference is
 * only where things stand now: it is written "so far" and kept neutral instead of calling it good or bad.
 */
export function DeltaBadge({ d, format, showAmount = false, soFar = false }: { d: Delta; format: (n: number) => string; showAmount?: boolean; soFar?: boolean }) {
  const { t } = useApp()
  const same = Math.abs(d.delta) < 0.5
  const up = d.delta > 0
  const Icon = same ? Minus : up ? TrendingUp : TrendingDown
  const variant = same || soFar ? 'neutral' : up ? 'warning' : 'success'
  const word = same ? t('compare.same') : up ? t('compare.more') : t('compare.less')
  return (
    <Badge variant={variant} className="h-auto w-fit whitespace-normal">
      <Icon aria-hidden="true" />
      <span>{soFar && !same ? t('compare.soFar', { word }) : word}</span>
      {!same && (
        <bdi className="tabular">
          {showAmount ? format(Math.abs(d.delta)) : ''}
          {showAmount && d.pct !== undefined ? ' · ' : ''}
          {d.pct !== undefined ? `${Math.abs(d.pct)}%` : ''}
        </bdi>
      )}
    </Badge>
  )
}

/** One headline number with both projects' values under it: a label, the two values with their colour keys, and how they differ. */
export function StatTile({ label, a, b, d, format, soFar, note, mesh }: { label: string; a: string; b: string; d?: Delta; format: (n: number) => string; soFar?: boolean; note?: string; /** Position in the row: picks the tile's mesh gradient (lib/mesh.ts). */ mesh: number }) {
  const { t } = useApp()
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border p-4', meshCard(mesh))}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <dl className="grid gap-1.5">
        {([['a', a], ['b', b]] as const).map(([side, v]) => (
          <div key={side} className="flex items-center justify-between gap-3">
            <dt>
              <span aria-hidden="true" className={cn('inline-block h-3 w-3 rounded-full', side === 'a' ? SIDE_A.bar : SIDE_B.bar)} />
              <span className="sr-only">{side === 'a' ? t('compare.projectA') : t('compare.projectB')}</span>
            </dt>
            <dd className="tabular min-w-0 text-lg font-extrabold break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {d && <DeltaBadge d={d} format={format} soFar={soFar} />}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  )
}

export interface BarRow {
  key: string
  label: string
  a: number
  b: number
  /** A short note under the label: "only in …", "not complete yet". */
  note?: string
  /** Not finished in one of the projects: the difference is "so far". */
  soFar?: boolean
}

/**
 * Two bars per row, one for each project, on one shared scale, the value at the tip of each bar, and how they differ at the
 * top right of the row. Bars are 12px thick and square where they start, rounded where the value ends.
 */
export function CompareBars({ rows, format, labelWidth }: { rows: BarRow[]; format: (n: number) => string; labelWidth: string }) {
  const { t } = useApp()
  const max = Math.max(1e-9, ...rows.flatMap((r) => [r.a, r.b]))
  return (
    <ul className="grid gap-6">
      {rows.map((r) => {
        const d: Delta = { delta: r.b - r.a, pct: r.a > 0 ? Math.round(((r.b - r.a) / r.a) * 100) : undefined }
        return (
          <li key={r.key} className="grid gap-2">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <span className="min-w-0">
                <span className="font-semibold">{r.label}</span>
                {r.note && <span className="block text-sm text-muted-foreground">{r.note}</span>}
              </span>
              {(r.a > 0 || r.b > 0) && <DeltaBadge d={d} format={format} soFar={r.soFar} />}
            </div>
            {([['a', r.a, t('compare.projectA')], ['b', r.b, t('compare.projectB')]] as const).map(([side, v, name]) => (
              <div key={side} role="img" aria-label={`${name}: ${v > 0 ? format(v) : '0'}`} className="flex items-center gap-2" dir="ltr">
                <div
                  className={cn('h-3 rounded-e-[4px]', side === 'a' ? SIDE_A.bar : SIDE_B.bar)}
                  style={{ width: v > 0 ? `max(3px, calc((100% - ${labelWidth}) * ${v / max}))` : '0px' }}
                />
                <span className="tabular shrink-0 text-sm whitespace-nowrap">{v > 0 ? format(v) : '—'}</span>
              </div>
            ))}
          </li>
        )
      })}
    </ul>
  )
}

const H = 240
const PAD = { top: 16, right: 18, bottom: 28, left: 46 }

const inRange = (s: number[], i: number): boolean => i >= 0 && i < s.length

/**
 * Total spent by the end of each month since the start, one line for each project. Move over the chart, touch it, or use the
 * arrow keys to read any month: the two values and their difference are written under the chart. It opens on the month where
 * this project stands now, so the first thing read is the fair comparison at the same stage.
 */
export function PaceChart({ a, b, format }: { a: number[]; b: number[]; format: (n: number) => string }) {
  const { t } = useApp()
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const n = Math.max(a.length, b.length)
  const endB = b.length - 1
  const endA = a.length - 1
  const [picked, setPicked] = useState<number | null>(null)
  const active = Math.min(picked ?? endB, n - 1)
  const { top, ticks } = axisTicks(Math.max(0, ...a, ...b))
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number): number => PAD.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1))
  const y = (v: number): number => PAD.top + innerH - (v / top) * innerH
  const path = (s: number[]): string => s.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const step = Math.ceil(n / Math.max(2, Math.floor(innerW / 44)))

  // A finished project stays at its final total after its last month.
  const va = a.length === 0 ? undefined : a[Math.min(active, a.length - 1)]
  const vb = inRange(b, active) ? b[active] : undefined

  const pick = (clientX: number, el: SVGSVGElement) => {
    const box = el.getBoundingClientRect()
    const i = n <= 1 ? 0 : Math.round(((clientX - box.left - PAD.left) / innerW) * (n - 1))
    setPicked(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div className="grid gap-3">
      <div ref={ref} dir="ltr" className="w-full">
        <svg
          width={width}
          height={H}
          role="group"
          tabIndex={0}
          aria-label={t('compare.paceAria')}
          className="block max-w-full touch-pan-y overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setPicked(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setPicked(Math.min(n - 1, active + 1))
            else if (e.key === 'ArrowLeft') setPicked(Math.max(0, active - 1))
            else if (e.key === 'Escape') setPicked(null)
            else return
            e.preventDefault()
          }}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground" fontSize={12}>
                {compact(v)}
              </text>
            </g>
          ))}
          {/* The chosen month: a guide line, and a dot on each line with a ring in the card colour. */}
          <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="3 3" />
          {a.length > 0 && <path d={path(a)} fill="none" className={SIDE_A.stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
          {b.length > 0 && <path d={path(b)} fill="none" className={SIDE_B.stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
          {endA >= 0 && endA !== active && <circle cx={x(endA)} cy={y(a[endA])} r={4} className={cn(SIDE_A.fill, 'stroke-card')} strokeWidth={2} />}
          {endB >= 0 && endB !== active && <circle cx={x(endB)} cy={y(b[endB])} r={4} className={cn(SIDE_B.fill, 'stroke-card')} strokeWidth={2} />}
          {va !== undefined && <circle cx={x(active)} cy={y(va)} r={5} className={cn(SIDE_A.fill, 'stroke-card')} strokeWidth={2} />}
          {vb !== undefined && <circle cx={x(active)} cy={y(vb)} r={5} className={cn(SIDE_B.fill, 'stroke-card')} strokeWidth={2} />}
          {Array.from({ length: n }, (_, i) =>
            i === active || (i % step === 0 && Math.abs(i - active) > 1) ? (
              <text key={i} x={x(i)} y={H - 10} textAnchor={i === 0 && n > 1 ? 'start' : 'middle'} className={i === active ? 'fill-foreground' : 'fill-muted-foreground'} fontSize={12} fontWeight={i === active ? 700 : 400}>
                {i + 1}
              </text>
            ) : null,
          )}
        </svg>
        <p className="text-center text-sm text-muted-foreground">{t('compare.paceAxis')}</p>
      </div>

      <div role="status" aria-live="polite" className="grid gap-2 rounded-xl bg-muted/60 p-3">
        <p className="font-semibold">{t('compare.month', { n: active + 1 })}</p>
        <dl className="grid gap-1.5 sm:grid-cols-2 sm:gap-x-6">
          <div className="flex items-center justify-between gap-3">
            <dt>
              <KeyChip side="a">{t('compare.projectA')}</KeyChip>
            </dt>
            <dd className="tabular font-bold">{va === undefined ? '—' : format(va)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt>
              <KeyChip side="b">{t('compare.projectB')}</KeyChip>
            </dt>
            <dd className="tabular font-bold">{vb === undefined ? '—' : format(vb)}</dd>
          </div>
        </dl>
        {va !== undefined && vb !== undefined && va > 0 && <DeltaBadge d={{ delta: vb - va, pct: Math.round(((vb - va) / va) * 100) }} format={format} />}
      </div>
      <p className="text-sm text-muted-foreground">{t('compare.paceHint')}</p>

      <div className="sr-only">
        <table>
          <caption>{t('compare.paceTitle')}</caption>
          <thead>
            <tr>
              <th>{t('compare.paceAxis')}</th>
              <th>{t('compare.projectA')}</th>
              <th>{t('compare.projectB')}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{i < a.length ? noBreak(format(a[i])) : ''}</td>
                <td>{i < b.length ? noBreak(format(b[i])) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export interface RateRow {
  key: string
  label: string
  unit: string
  from: string
  to: string
  pct: number | undefined
}

/**
 * How much each material's rate changed, on one scale around zero: a bar to the right for a rise, to the left for a fall.
 * Rises are amber and falls green, always with an arrow and the percent in words, never colour alone.
 */
export function RateChangeBars({ rows }: { rows: RateRow[] }) {
  const { t } = useApp()
  const max = Math.max(5, ...rows.map((r) => Math.abs(r.pct ?? 0)))
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 text-xs text-muted-foreground" dir="ltr" aria-hidden="true">
        <div className="flex min-w-0 flex-1 items-center justify-between">
          <span>← {t('compare.less')}</span>
          <span>0%</span>
          <span>{t('compare.more')} →</span>
        </div>
        <span className="w-24 shrink-0" />
      </div>
      <ul className="grid gap-5">
      {rows.map((r) => {
        const pct = r.pct ?? 0
        const up = pct > 0
        const Icon = pct === 0 ? Minus : up ? TrendingUp : TrendingDown
        const word = pct === 0 ? t('compare.same') : up ? t('compare.more') : t('compare.less')
        return (
          <li key={r.key} className="grid gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold">
                {r.label} <span className="text-sm font-normal text-muted-foreground">/ {r.unit}</span>
              </span>
              <span className="tabular text-sm text-muted-foreground">
                <bdi>
                  {r.from} → {r.to}
                </bdi>
              </span>
            </div>
            <div className="flex items-center gap-3" dir="ltr">
              <div role="img" aria-label={r.pct === undefined ? '' : `${word} ${Math.abs(pct)}%`} className="relative h-3 min-w-0 flex-1">
                <span aria-hidden="true" className="absolute inset-y-[-3px] left-1/2 w-px bg-border" />
                {pct !== 0 && (
                  <span
                    className={cn('absolute inset-y-0', up ? 'left-1/2 rounded-e-[4px] bg-viz-up' : 'right-1/2 rounded-s-[4px] bg-viz-down')}
                    style={{ width: `${(Math.abs(pct) / max) * 50}%` }}
                  />
                )}
              </div>
              <span className="flex w-24 shrink-0 items-center gap-1 text-sm font-semibold">
                <Icon aria-hidden="true" className="size-4" />
                <span>{word}</span>
                <bdi className="tabular">{r.pct === undefined ? '' : `${Math.abs(pct)}%`}</bdi>
              </span>
            </div>
          </li>
        )
      })}
    </ul>
    </div>
  )
}
