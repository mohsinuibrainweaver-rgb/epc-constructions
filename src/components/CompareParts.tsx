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
export const COMPARE_GRID = 'sm:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)_11rem] lg:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1fr)_11rem]'

/** A colour key and a name: the mark beside the text carries the identity, the text stays in ink. */
export function KeyChip({ side, children }: { side: 'a' | 'b'; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className={cn('h-3 w-3 shrink-0 rounded-full', side === 'a' ? SIDE_A.bar : SIDE_B.bar)} />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  )
}

export function Legend({ className }: { className?: string }) {
  const { t } = useApp()
  return (
    <ul className={cn('flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground', className)}>
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
    <Badge variant={variant} className="h-auto w-fit shrink-0 whitespace-nowrap">
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

/** Each subject is one comparison row: the two project values stay in fixed columns, with a shared-scale bar and difference. */
export function CompareBars({ rows, format }: { rows: BarRow[]; format: (n: number) => string }) {
  const { t } = useApp()
  const max = Math.max(1e-9, ...rows.flatMap((r) => [r.a, r.b]))
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className={cn('hidden border-b bg-muted/40 text-sm font-semibold sm:grid', COMPARE_GRID)}>
        <span aria-hidden="true" className="p-3" />
        <span className="border-s p-3"><KeyChip side="a">{t('compare.projectA')}</KeyChip></span>
        <span className="border-s p-3"><KeyChip side="b">{t('compare.projectB')}</KeyChip></span>
        <span className="min-w-28 border-s p-3 text-muted-foreground">{t('compare.difference')}</span>
      </div>
      <ul className="divide-y">
      {rows.map((r) => {
        const d: Delta = { delta: r.b - r.a, pct: r.a > 0 ? Math.round(((r.b - r.a) / r.a) * 100) : undefined }
        return (
          <li key={r.key} className={cn('grid grid-cols-2', COMPARE_GRID)}>
            <div className="col-span-2 flex min-w-0 items-start justify-between gap-3 p-3 pb-2 sm:col-span-1 sm:block sm:p-3">
              <span className="min-w-0">
                <span className="font-semibold">{r.label}</span>
                {r.note && <span className="block text-sm text-muted-foreground">{r.note}</span>}
              </span>
              {(r.a > 0 || r.b > 0) && <span className="sm:hidden"><DeltaBadge d={d} format={format} soFar={r.soFar} /></span>}
            </div>
            {([['a', r.a, t('compare.projectA')], ['b', r.b, t('compare.projectB')]] as const).map(([side, v, name]) => (
              <div key={side} role="img" aria-label={`${name}: ${v > 0 ? format(v) : '0'}`} className="grid min-w-0 gap-2 border-t border-s p-3 sm:border-t-0" dir="ltr">
                <span className="flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
                  <span className={cn('size-2 rounded-full', side === 'a' ? SIDE_A.bar : SIDE_B.bar)} />
                  {name}
                </span>
                <span className="tabular text-sm font-semibold whitespace-nowrap">{v > 0 ? format(v) : '—'}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className={cn('block h-full rounded-full', side === 'a' ? SIDE_A.bar : SIDE_B.bar)} style={{ width: v > 0 ? `${Math.max(2, (v / max) * 100)}%` : '0%' }} />
                </span>
              </div>
            ))}
            <div className="hidden min-w-28 border-s p-3 sm:block">
              {(r.a > 0 || r.b > 0) ? <DeltaBadge d={d} format={format} soFar={r.soFar} /> : <span className="text-muted-foreground">—</span>}
            </div>
          </li>
        )
      })}
      </ul>
    </div>
  )
}

const inRange = (s: number[], i: number): boolean => i >= 0 && i < s.length

/**
 * Paired cumulative bars for every elapsed month. Missing future months stay empty instead of extending a line with no data.
 * Selecting a month writes both values and their difference below the chart.
 */
export function PaceChart({ a, b, format }: { a: number[]; b: number[]; format: (n: number) => string }) {
  const { t } = useApp()
  const n = Math.max(a.length, b.length)
  const endB = b.length - 1
  const [picked, setPicked] = useState<number | null>(null)
  const active = Math.min(picked ?? endB, n - 1)
  const top = Math.max(1, ...a, ...b)

  const va = inRange(a, active) ? a[active] : undefined
  const vb = inRange(b, active) ? b[active] : undefined

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2" dir="ltr">
        <div aria-hidden="true" className="flex h-56 flex-col justify-between pb-7 text-right text-xs text-muted-foreground">
          <span>{compact(top)}</span>
          <span>{compact(top / 2)}</span>
          <span>0</span>
        </div>
        <div
          role="group"
          tabIndex={0}
          aria-label={t('compare.paceAria')}
          className="relative min-w-0 overflow-x-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setPicked(Math.min(n - 1, active + 1))
            else if (e.key === 'ArrowLeft') setPicked(Math.max(0, active - 1))
            else if (e.key === 'Escape') setPicked(null)
            else return
            e.preventDefault()
          }}
        >
          <span aria-hidden="true" className="absolute inset-x-0 top-0 border-t" />
          <span aria-hidden="true" className="absolute inset-x-0 top-[calc(50%-0.875rem)] border-t" />
          <span aria-hidden="true" className="absolute inset-x-0 bottom-7 border-t" />
          <div className="grid h-56 min-w-full grid-flow-col auto-cols-[minmax(4rem,1fr)] items-end gap-2 px-1">
            {Array.from({ length: n }, (_, i) => {
              const av = inRange(a, i) ? a[i] : undefined
              const bv = inRange(b, i) ? b[i] : undefined
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={active === i}
                  aria-label={t('compare.month', { n: i + 1 })}
                  className={cn('grid h-full w-16 grid-rows-[1fr_1.75rem] rounded-md px-1 pt-2 text-xs outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring', active === i && 'bg-muted')}
                  onClick={() => setPicked(i)}
                >
                  <span className="flex items-end justify-center gap-1.5">
                    <span className={cn('w-4 rounded-t-sm', SIDE_A.bar)} style={{ height: av === undefined ? 0 : `${Math.max(2, (av / top) * 100)}%` }} />
                    <span className={cn('w-4 rounded-t-sm', SIDE_B.bar)} style={{ height: bv === undefined ? 0 : `${Math.max(2, (bv / top) * 100)}%` }} />
                  </span>
                  <span className="self-center font-medium text-muted-foreground">{i + 1}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground">{t('compare.paceAxis')}</p>

      <div role="status" aria-live="polite" className={cn('grid grid-cols-2 overflow-hidden rounded-lg border', COMPARE_GRID)}>
        <p className="col-span-2 p-3 font-semibold sm:col-span-1">{t('compare.month', { n: active + 1 })}</p>
        <dl className="contents">
          <div className="grid gap-1 border-t border-s p-3 sm:border-t-0">
            <dt>
              <KeyChip side="a">{t('compare.projectA')}</KeyChip>
            </dt>
            <dd className="tabular font-bold">{va === undefined ? '—' : format(va)}</dd>
          </div>
          <div className="grid gap-1 border-t border-s p-3 sm:border-t-0">
            <dt>
              <KeyChip side="b">{t('compare.projectB')}</KeyChip>
            </dt>
            <dd className="tabular font-bold">{vb === undefined ? '—' : format(vb)}</dd>
          </div>
        </dl>
        <div className="hidden border-s p-3 sm:block">
          {va !== undefined && vb !== undefined && va > 0 ? <DeltaBadge d={{ delta: vb - va, pct: Math.round(((vb - va) / va) * 100) }} format={format} /> : <span className="text-muted-foreground">—</span>}
        </div>
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
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className={cn('hidden border-b bg-muted/40 text-sm font-semibold sm:grid', COMPARE_GRID)}>
        <span className="p-3">{t('compare.materials')}</span>
        <span className="border-s p-3"><KeyChip side="a">{t('compare.projectA')}</KeyChip></span>
        <span className="border-s p-3"><KeyChip side="b">{t('compare.projectB')}</KeyChip></span>
        <span className="border-s p-3 text-muted-foreground">{t('compare.difference')}</span>
      </div>
      <ul className="divide-y">
      {rows.map((r) => {
        const pct = r.pct ?? 0
        const up = pct > 0
        const Icon = pct === 0 ? Minus : up ? TrendingUp : TrendingDown
        const word = pct === 0 ? t('compare.same') : up ? t('compare.more') : t('compare.less')
        return (
          <li key={r.key} className={cn('grid grid-cols-2', COMPARE_GRID)}>
            <div className="col-span-2 p-3 sm:col-span-1">
              <span className="font-semibold">
                {r.label} <span className="text-sm font-normal text-muted-foreground">/ {r.unit}</span>
              </span>
            </div>
            <div className="border-t border-s p-3 text-sm font-semibold sm:border-t-0">{r.from}</div>
            <div className="border-t border-s p-3 text-sm font-semibold sm:border-t-0">{r.to}</div>
            <div role="img" aria-label={r.pct === undefined ? '' : `${word} ${Math.abs(pct)}%`} className="col-span-2 flex items-center gap-1 border-t p-3 text-sm font-semibold sm:col-span-1 sm:border-t-0 sm:border-s">
                <Icon aria-hidden="true" className="size-4" />
                <span>{word}</span>
                <bdi className="tabular">{r.pct === undefined ? '' : `${Math.abs(pct)}%`}</bdi>
            </div>
          </li>
        )
      })}
    </ul>
    </div>
  )
}
