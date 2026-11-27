import { useState } from 'react'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Badge } from '@/components/ui/badge'
import type { Delta } from '@/lib/compare'
import { compact, noBreak } from '@/lib/chart'
import { meshCard } from '@/lib/mesh'
import { cn } from '@/lib/utils'

/** "+17%" / "-5%" for a percent. */
export const pctText = (pct: number): string => `${pct > 0 ? '+' : ''}${pct}%`

/** The two projects everywhere on the Compare page: the earlier one is orange, this one is blue. Colour marks only; text stays in ink. */
export const SIDE_A = { bar: 'bg-viz-a', stroke: 'stroke-viz-a', fill: 'fill-viz-a' }
export const SIDE_B = { bar: 'bg-viz-b', stroke: 'stroke-viz-b', fill: 'fill-viz-b' }
export const COMPARE_GRID = 'sm:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)_14rem] lg:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1fr)_14rem]'

/** A colour key and a name: the mark beside the text carries the identity, the text stays in ink. */
export function KeyChip({ side, children }: { side: 'a' | 'b'; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className={cn('h-3 w-3 shrink-0 rounded-full', side === 'a' ? SIDE_A.bar : SIDE_B.bar)} />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  )
}

export function Legend({ nameA, nameB, className }: { nameA?: string; nameB?: string; className?: string }) {
  const { t } = useApp()
  return (
    <ul className={cn('flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground', className)}>
      <li>
        <KeyChip side="a">{nameA ?? t('compare.projectA')}</KeyChip>
      </li>
      <li>
        <KeyChip side="b">{nameB ?? t('compare.projectB')}</KeyChip>
      </li>
    </ul>
  )
}

/**
 * How B stands against A, in words and an icon (never colour alone): more, less or the same. Higher cost is a danger,
 * lower is good news. The word already says the direction, so the numbers have no sign. `format` writes an amount;
 * `showAmount` adds the difference in money to the percent. `soFar`: one of the two is not finished, so the difference is
 * only where things stand now, so the wording remains "so far". Direction still uses the same semantic colour:
 * lower cost is green, higher cost is red, and equal cost is neutral.
 */
export function DeltaBadge({ d, format, showAmount = false, soFar = false }: { d: Delta; format: (n: number) => string; showAmount?: boolean; soFar?: boolean }) {
  const { t } = useApp()
  const same = Math.abs(d.delta) < 0.5
  const up = d.delta > 0
  const Icon = same ? Minus : up ? TrendingUp : TrendingDown
  const variant = same ? 'neutral' : up ? 'danger' : 'success'
  const word = same ? t('compare.same') : up ? t('compare.more') : t('compare.less')
  return (
    <Badge variant={variant} className="h-auto w-fit shrink-0 whitespace-nowrap leading-tight">
      <Icon aria-hidden="true" />
      <span>{t('compare.projectB')}:</span>
      {!same && (
        <bdi className="tabular">
          {showAmount ? format(Math.abs(d.delta)) : ''}
          {showAmount && d.pct !== undefined ? ' · ' : ''}
          {d.pct !== undefined ? `${Math.abs(d.pct)}%` : ''}
        </bdi>
      )}
      <span>{soFar && !same ? t('compare.soFar', { word: word.toLocaleLowerCase() }) : word}</span>
    </Badge>
  )
}

/** A plain-language explanation of B against A. It always names "this project" so the direction is unambiguous. */
export function DeltaSentence({
  a,
  b,
  format,
  nameA,
  nameB,
  soFar = false,
  className,
}: {
  a: number
  b: number
  format: (n: number) => string
  nameA?: string
  nameB?: string
  soFar?: boolean
  className?: string
}) {
  const { t } = useApp()
  const earlier = nameA ?? t('compare.projectA')
  const current = nameB ?? t('compare.projectB')
  const d: Delta = { delta: b - a, pct: a > 0 ? Math.round(((b - a) / a) * 100) : undefined }
  const same = Math.abs(d.delta) < 0.5
  const up = d.delta > 0
  const Icon = same ? Minus : up ? TrendingUp : TrendingDown
  const tone = same ? 'text-muted-foreground' : up ? 'text-danger' : 'text-success'
  const sentence = same
    ? t('compare.deltaSameNamed', { earlier, current })
    : a <= 0
      ? t('compare.deltaOnlyCurrentNamed', { current })
      : b <= 0
        ? t('compare.deltaOnlyEarlierNamed', { earlier })
        : t(
            soFar
              ? up ? 'compare.deltaMoreSoFar' : 'compare.deltaLessSoFar'
              : up ? 'compare.deltaMoreNamed' : 'compare.deltaLessNamed',
            { amount: format(Math.abs(d.delta)), earlier, current },
          )

  return (
    <p className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-semibold', tone, className)}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>{sentence}</span>
      {!same && a > 0 && b > 0 && d.pct !== undefined && <bdi className="tabular">({Math.abs(d.pct)}%)</bdi>}
    </p>
  )
}

/** One headline number with both projects' values under it: a label, the two values with their colour keys, and how they differ. */
export function StatTile({ label, a, b, d, format, soFar, note, mesh }: { label: string; a: string; b: string; d?: Delta; format: (n: number) => string; soFar?: boolean; note?: string; /** Position in the row: picks the tile's mesh gradient (lib/mesh.ts). */ mesh: number }) {
  const { t } = useApp()
  return (
    <div className={cn('flex flex-col gap-2 rounded-xl border p-3 sm:gap-3 sm:p-4', meshCard(mesh))}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <dl className="grid gap-1 sm:gap-1.5">
        {([['a', a], ['b', b]] as const).map(([side, v]) => (
          <div key={side} className="flex items-center justify-between gap-3">
            <dt>
              <span aria-hidden="true" className={cn('inline-block h-3 w-3 rounded-full', side === 'a' ? SIDE_A.bar : SIDE_B.bar)} />
              <span className="sr-only">{side === 'a' ? t('compare.projectA') : t('compare.projectB')}</span>
            </dt>
            <dd className="tabular min-w-0 text-base font-extrabold break-words sm:text-lg">{v}</dd>
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

function ValueBar({ side, value, max, format }: { side: 'a' | 'b'; value: number; max: number; format: (n: number) => string }) {
  return (
    <div className="grid min-w-0 gap-1.5" dir="ltr">
      <span className="tabular text-sm font-bold whitespace-nowrap sm:text-base">{value > 0 ? format(value) : '—'}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted/70" aria-hidden="true">
        <span className={cn('block h-full rounded-full', side === 'a' ? SIDE_A.bar : SIDE_B.bar)} style={{ width: value > 0 ? `${Math.max(3, (value / max) * 100)}%` : '0%' }} />
      </span>
    </div>
  )
}

/** A consistent comparison table on desktop and paired compact rows on phones. */
export function CompareBars({ rows, format, nameA, nameB, caption, subjectLabel, flush = false }: { rows: BarRow[]; format: (n: number) => string; nameA: string; nameB: string; caption: string; subjectLabel: string; flush?: boolean }) {
  const { t } = useApp()
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card shadow-sm', flush && 'rounded-none border-x-0 border-b-0 shadow-none')}>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[48rem] table-fixed text-start">
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[22%]" />
            <col className="w-[22%]" />
            <col className="w-[34%]" />
          </colgroup>
          <thead className="border-b bg-muted/55 text-sm">
            <tr>
              <th scope="col" className="bg-muted/35 px-4 py-3 text-start font-semibold text-muted-foreground">{subjectLabel}</th>
              <th scope="col" className="border-s border-border/60 bg-viz-a/5 px-4 py-3 text-start">
                <span className="block text-xs font-medium text-muted-foreground">{t('compare.projectA')}</span>
                <KeyChip side="a">{nameA}</KeyChip>
              </th>
              <th scope="col" className="border-s border-border/60 bg-viz-b/5 px-4 py-3 text-start">
                <span className="block text-xs font-medium text-muted-foreground">{t('compare.projectB')}</span>
                <KeyChip side="b">{nameB}</KeyChip>
              </th>
              <th scope="col" className="border-s border-border/60 bg-muted/35 px-4 py-3 text-start font-semibold text-muted-foreground">{t('compare.whatChanged')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, index) => {
              const rowMax = Math.max(1, r.a, r.b)
              return (
                <tr key={r.key} className={cn('align-top transition-colors hover:bg-muted/20', index % 2 === 1 && 'bg-muted/[0.025]')}>
                  <th scope="row" className="px-4 py-3.5 text-start font-semibold">
                    {r.label}
                    {r.note && <span className="mt-0.5 block text-xs font-normal leading-4 text-muted-foreground">{r.note}</span>}
                  </th>
                  <td className="border-s border-border/60 bg-viz-a/[0.035] px-4 py-3.5"><ValueBar side="a" value={r.a} max={rowMax} format={format} /></td>
                  <td className="border-s border-border/60 bg-viz-b/[0.035] px-4 py-3.5"><ValueBar side="b" value={r.b} max={rowMax} format={format} /></td>
                  <td className={cn('border-s border-border/60 px-4 py-3.5', r.b < r.a ? 'bg-success-soft/20' : r.b > r.a ? 'bg-danger-soft/15' : 'bg-muted/15')}>
                    {(r.a > 0 || r.b > 0) ? <DeltaSentence a={r.a} b={r.b} format={format} nameA={nameA} nameB={nameB} soFar={r.soFar} /> : <span className="text-sm text-muted-foreground">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y lg:hidden">
        {rows.map((r) => {
          const rowMax = Math.max(1, r.a, r.b)
          return (
            <li key={r.key} className="grid gap-2.5 px-3 py-3">
              <div>
                <p className="font-semibold">{r.label}</p>
                {r.note && <p className="text-xs leading-4 text-muted-foreground">{r.note}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([['a', r.a, t('compare.projectA'), nameA], ['b', r.b, t('compare.projectB'), nameB]] as const).map(([side, value, role, projectName]) => (
                  <div key={side} className={cn('grid min-w-0 gap-1.5 rounded-lg border px-2.5 py-2 shadow-sm', side === 'a' ? 'bg-viz-a/5' : 'bg-viz-b/5')}>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn('size-2 shrink-0 rounded-full', side === 'a' ? SIDE_A.bar : SIDE_B.bar)} />
                      <span className="truncate" title={`${role}: ${projectName}`}>{role}</span>
                    </span>
                    <ValueBar side={side} value={value} max={rowMax} format={format} />
                  </div>
                ))}
              </div>
              {(r.a > 0 || r.b > 0) && <DeltaSentence a={r.a} b={r.b} format={format} nameA={nameA} nameB={nameB} soFar={r.soFar} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const inRange = (s: number[], i: number): boolean => i >= 0 && i < s.length

/** Cumulative spending over time. Missing future months stay empty instead of extending a line with no data. */
export function PaceChart({ a, b, format, nameA, nameB }: { a: number[]; b: number[]; format: (n: number) => string; nameA: string; nameB: string }) {
  const { t } = useApp()
  const n = Math.max(1, a.length, b.length)
  const endB = b.length - 1
  const [hovered, setHovered] = useState<{ side: 'a' | 'b'; index: number } | null>(null)
  const active = Math.max(0, Math.min(endB, n - 1))
  const top = Math.max(1, ...a, ...b)
  const plotWidth = 1000
  const plotHeight = 176
  const plotTop = 10
  const plotBottom = plotHeight - 10
  const x = (i: number) => ((i + 0.5) / n) * plotWidth
  const xPct = (i: number) => ((i + 0.5) / n) * 100
  const y = (value: number) => plotTop + (1 - value / top) * (plotBottom - plotTop)
  const yPct = (value: number) => (y(value) / plotHeight) * 100
  // Every cumulative series starts from zero. Including that origin keeps a
  // one-month project visible as progress without inventing future months.
  const points = (series: number[]) => [`0,${plotBottom}`, ...series.map((value, i) => `${x(i)},${y(value)}`)].join(' ')
  const area = (series: number[]) => series.length > 0
    ? `0,${plotBottom} ${points(series)} ${x(series.length - 1)},${plotBottom}`
    : ''
  const labelStep = Math.max(1, Math.ceil(n / 8))

  const va = inRange(a, active) ? a[active] : undefined
  const vb = inRange(b, active) ? b[active] : undefined

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border bg-card p-3 shadow-sm sm:p-4" dir="ltr">
        <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2">
          <div aria-hidden="true" className="flex h-44 flex-col justify-between text-right text-xs text-muted-foreground">
            <span>{compact(top)}</span>
            <span>{compact(top / 2)}</span>
            <span>0</span>
          </div>
          <div
            role="group"
            aria-label={t('compare.paceAria')}
            className="relative h-52 min-w-0"
          >
            <div className="absolute inset-x-0 top-0 h-44 rounded-lg bg-muted/[0.025]">
              <svg aria-hidden="true" viewBox={`0 0 ${plotWidth} ${plotHeight}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                {[plotTop, plotHeight / 2, plotBottom].map((gy) => <line key={gy} x1="0" x2={plotWidth} y1={gy} y2={gy} className="stroke-border" vectorEffect="non-scaling-stroke" />)}
                {area(a) && <polygon points={area(a)} className="fill-viz-a opacity-[0.07]" />}
                {area(b) && <polygon points={area(b)} className="fill-viz-b opacity-[0.08]" />}
                {a.length > 0 && <polyline points={points(a)} className="fill-none stroke-viz-a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
                {b.length > 0 && <polyline points={points(b)} className="fill-none stroke-viz-b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
              </svg>
              {([['a', a, nameA], ['b', b, nameB]] as const).flatMap(([side, series, projectName]) => series.map((value, i) => (
                <button
                  key={`${side}-${i}`}
                  type="button"
                  aria-label={`${t('compare.month', { n: i + 1 })}, ${projectName}: ${format(value)}`}
                  className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none hover:bg-background/70 focus-visible:bg-background/80 focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ left: `${xPct(i)}%`, top: `${yPct(value)}%` }}
                  onMouseEnter={() => setHovered({ side, index: i })}
                  onMouseLeave={() => setHovered((current) => current?.side === side && current.index === i ? null : current)}
                  onFocus={() => setHovered({ side, index: i })}
                  onBlur={() => setHovered(null)}
                >
                  <span className={cn('size-3 rounded-full border-2 border-background shadow-sm', side === 'a' ? SIDE_A.bar : SIDE_B.bar)} />
                </button>
              )))}
              {hovered && (() => {
                const series = hovered.side === 'a' ? a : b
                const projectName = hovered.side === 'a' ? nameA : nameB
                const value = series[hovered.index]
                if (value === undefined) return null
                const below = yPct(value) < 28
                return (
                  <div
                    role="tooltip"
                    className={cn(
                      'pointer-events-none absolute z-20 min-w-max rounded-lg border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-lg',
                      hovered.index === 0 ? 'translate-x-0' : hovered.index === n - 1 ? '-translate-x-full' : '-translate-x-1/2',
                      below ? 'mt-4' : '-mt-3 -translate-y-full',
                    )}
                    style={{ left: `${xPct(hovered.index)}%`, top: `${yPct(value)}%` }}
                  >
                    <p className="font-medium text-muted-foreground">{t('compare.month', { n: hovered.index + 1 })}</p>
                    <p className="mt-0.5 flex items-center gap-1.5">
                      <span aria-hidden="true" className={cn('size-2 rounded-full', hovered.side === 'a' ? SIDE_A.bar : SIDE_B.bar)} />
                      <span>{projectName}</span>
                    </p>
                    <p className="mt-1 tabular text-sm font-bold">{format(value)}</p>
                  </div>
                )
              })()}
            </div>
            <div className="absolute inset-x-0 bottom-0 grid h-7 items-end text-center text-xs font-medium text-muted-foreground" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              {Array.from({ length: n }, (_, i) => <span key={i}>{i % labelStep === 0 || i === n - 1 ? i + 1 : ''}</span>)}
            </div>
          </div>
        </div>
        <p className="mt-1 text-center text-sm text-muted-foreground">{t('compare.paceAxis')}</p>
      </div>

      <div role="status" aria-live="polite" className={cn('grid grid-cols-2 overflow-hidden rounded-xl border bg-card shadow-sm', COMPARE_GRID)}>
        <p className="col-span-2 px-3 py-2 font-semibold sm:col-span-1">{t('compare.month', { n: active + 1 })}</p>
        <dl className="contents">
          <div className="grid gap-1 border-t border-s px-3 py-2 sm:border-t-0">
            <dt>
              <span className="block text-xs text-muted-foreground">{t('compare.projectA')}</span>
              <KeyChip side="a">{nameA}</KeyChip>
            </dt>
            <dd className="tabular font-bold">{va === undefined ? '—' : format(va)}</dd>
          </div>
          <div className="grid gap-1 border-t border-s px-3 py-2 sm:border-t-0">
            <dt>
              <span className="block text-xs text-muted-foreground">{t('compare.projectB')}</span>
              <KeyChip side="b">{nameB}</KeyChip>
            </dt>
            <dd className="tabular font-bold">{vb === undefined ? '—' : format(vb)}</dd>
          </div>
        </dl>
        <div className="hidden border-s px-3 py-2 sm:block">
          {va !== undefined && vb !== undefined && va > 0 ? <DeltaSentence a={va} b={vb} format={format} nameA={nameA} nameB={nameB} /> : <span className="text-muted-foreground">—</span>}
        </div>
      </div>
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

function RateSentence({ row, nameA, nameB }: { row: RateRow; nameA: string; nameB: string }) {
  const { t } = useApp()
  const pct = row.pct ?? 0
  const up = pct > 0
  const Icon = pct === 0 ? Minus : up ? TrendingUp : TrendingDown
  return (
    <p className={cn('flex flex-wrap items-center gap-1.5 text-sm font-semibold', row.pct === undefined || pct === 0 ? 'text-muted-foreground' : up ? 'text-danger' : 'text-success')}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>{row.pct === undefined
        ? t('compare.noRateComparison')
        : pct === 0
          ? t('compare.rateSameNamed', { earlier: nameA, current: nameB })
          : t(up ? 'compare.rateMoreNamed' : 'compare.rateLessNamed', { earlier: nameA, current: nameB })}</span>
      {row.pct !== undefined && pct !== 0 && <bdi className="tabular">({Math.abs(pct)}%)</bdi>}
    </p>
  )
}

/** Material rates use the same columns and wording as the rest of the comparison. */
export function RateChangeBars({ rows, nameA, nameB, caption, subjectLabel, flush = false }: { rows: RateRow[]; nameA: string; nameB: string; caption: string; subjectLabel: string; flush?: boolean }) {
  const { t } = useApp()
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card shadow-sm', flush && 'rounded-none border-x-0 border-b-0 shadow-none')}>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[48rem] table-fixed text-start">
          <caption className="sr-only">{caption}</caption>
          <colgroup><col className="w-[22%]" /><col className="w-[22%]" /><col className="w-[22%]" /><col className="w-[34%]" /></colgroup>
          <thead className="border-b bg-muted/55 text-sm">
            <tr>
              <th scope="col" className="bg-muted/35 px-4 py-3 text-start font-semibold text-muted-foreground">{subjectLabel}</th>
              <th scope="col" className="border-s border-border/60 bg-viz-a/5 px-4 py-3 text-start"><span className="block text-xs font-medium text-muted-foreground">{t('compare.projectA')}</span><KeyChip side="a">{nameA}</KeyChip></th>
              <th scope="col" className="border-s border-border/60 bg-viz-b/5 px-4 py-3 text-start"><span className="block text-xs font-medium text-muted-foreground">{t('compare.projectB')}</span><KeyChip side="b">{nameB}</KeyChip></th>
              <th scope="col" className="border-s border-border/60 bg-muted/35 px-4 py-3 text-start font-semibold text-muted-foreground">{t('compare.whatChanged')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, index) => (
              <tr key={r.key} className={cn('align-top transition-colors hover:bg-muted/20', index % 2 === 1 && 'bg-muted/[0.025]')}>
                <th scope="row" className="px-4 py-3.5 text-start font-semibold">{r.label}<span className="block text-xs font-normal text-muted-foreground">{r.unit}</span></th>
                <td className="tabular border-s border-border/60 bg-viz-a/[0.035] px-4 py-3.5 font-bold">{r.from}</td>
                <td className="tabular border-s border-border/60 bg-viz-b/[0.035] px-4 py-3.5 font-bold">{r.to}</td>
                <td className={cn('border-s border-border/60 px-4 py-3.5', (r.pct ?? 0) < 0 ? 'bg-success-soft/20' : (r.pct ?? 0) > 0 ? 'bg-danger-soft/15' : 'bg-muted/15')}><RateSentence row={r} nameA={nameA} nameB={nameB} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y lg:hidden">
        {rows.map((r) => (
          <li key={r.key} className="grid gap-2.5 px-3 py-3">
            <p className="font-semibold">{r.label} <span className="text-xs font-normal text-muted-foreground">/ {r.unit}</span></p>
            <dl className="grid grid-cols-2 gap-2">
              {([['a', r.from, t('compare.projectA')], ['b', r.to, t('compare.projectB')]] as const).map(([side, value, role]) => (
                <div key={side} className={cn('grid min-w-0 gap-1 rounded-lg border px-2.5 py-2 shadow-sm', side === 'a' ? 'bg-viz-a/5' : 'bg-viz-b/5')}>
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn('size-2 rounded-full', side === 'a' ? SIDE_A.bar : SIDE_B.bar)} />{role}</dt>
                  <dd className="tabular font-bold">{value}</dd>
                </div>
              ))}
            </dl>
            <RateSentence row={r} nameA={nameA} nameB={nameB} />
          </li>
        ))}
      </ul>
    </div>
  )
}
