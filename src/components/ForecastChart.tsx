import { useApp } from '@/app/AppContext'
import { useElementWidth } from '@/components/useElementWidth'
import { axisTicks, compact } from '@/lib/chart'
import { cn } from '@/lib/utils'

export interface ForecastColumn {
  key: string
  /** The label under the column: a short date, or "Overdue". */
  label: string
  scheduled: number
  expected: number
  overdue?: boolean
}

const H = 230
const PAD = { top: 24, right: 12, bottom: 30, left: 46 }
/** The thickest a column gets, so a few weeks never turn into fat blocks. */
const MAX_BAR = 26

/**
 * Money due in each coming week as columns: the planned payments solid, the ones a weekly plan will create as a lighter stack above
 * them, and what is overdue as the first column. Tap a column (or use the arrow keys) to choose it; the chosen one is outlined and the
 * page lists what is due in it. Plain SVG, no chart library.
 */
export function ForecastChart({ columns, active, onPick, format }: { columns: ForecastColumn[]; active: number; onPick: (i: number) => void; format: (n: number) => string }) {
  const { t } = useApp()
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const n = columns.length
  const highest = Math.max(0, ...columns.map((c) => c.scheduled + c.expected))
  const { top, ticks } = axisTicks(highest)
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const slot = innerW / Math.max(1, n)
  const bar = Math.min(MAX_BAR, Math.max(6, slot * 0.62))
  const cx = (i: number): number => PAD.left + slot * i + slot / 2
  const y = (v: number): number => PAD.top + innerH - (v / top) * innerH
  const step = Math.ceil(n / Math.max(2, Math.floor(innerW / 48)))
  // An amount above a column: always on the chosen one, and on the others when each has room for it.
  const roomForLabels = slot >= 38

  return (
    <div ref={ref} dir="ltr" className="w-full">
      <svg
        width={width}
        height={H}
        role="group"
        tabIndex={0}
        aria-label={t('forecast.chartAria')}
        className="block max-w-full touch-pan-y overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onPick(Math.min(n - 1, active + 1))
          else if (e.key === 'ArrowLeft') onPick(Math.max(0, active - 1))
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
        {columns.map((c, i) => {
          const sched = (c.scheduled / top) * innerH
          const exp = (c.expected / top) * innerH
          const x0 = cx(i) - bar / 2
          const total = c.scheduled + c.expected
          return (
            <g key={c.key} className="cursor-pointer" onClick={() => onPick(i)}>
              {/* A wide invisible target, so a thin column is easy to hit. */}
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} fill="transparent" />
              {i === active && <rect x={PAD.left + slot * i + 1} y={PAD.top} width={slot - 2} height={innerH} rx={6} className="fill-muted/70" />}
              {c.scheduled > 0 && (
                <rect x={x0} y={y(0) - sched} width={bar} height={Math.max(2, sched)} rx={c.expected > 0 ? 0 : 4} className={cn(c.overdue ? 'fill-viz-up' : 'fill-viz-b')} />
              )}
              {c.expected > 0 && (
                <rect
                  x={x0 + 0.5}
                  y={y(0) - sched - Math.max(6, exp) - (c.scheduled > 0 ? 2 : 0) + 0.5}
                  width={bar - 1}
                  height={Math.max(6, exp) - 1}
                  rx={4}
                  className="fill-viz-b stroke-viz-b"
                  fillOpacity={0.35}
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                />
              )}
              {total > 0 && (i === active || roomForLabels) && (
                <text x={cx(i)} y={y(0) - sched - (c.expected > 0 ? Math.max(6, exp) + 2 : 0) - 6} textAnchor="middle" className={i === active ? 'fill-foreground' : 'fill-muted-foreground'} fontSize={12} fontWeight={i === active ? 700 : 400}>
                  {compact(total)}
                </text>
              )}
              {total === 0 && <rect x={x0} y={y(0) - 2} width={bar} height={2} className="fill-border" />}
              {i % step === 0 || i === active ? (
                <text x={cx(i)} y={H - 10} textAnchor="middle" className={i === active ? 'fill-foreground' : 'fill-muted-foreground'} fontSize={12} fontWeight={i === active ? 700 : 400}>
                  {c.label}
                </text>
              ) : null}
              <title>{`${c.label}: ${format(total)}`}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
