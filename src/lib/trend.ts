import type { Payment } from '../db/types'
import { isPlanned, isSpent } from './stats'

export interface TrendPoint {
  /** YYYY-MM */
  month: string
  /** Everything paid and approved up to the end of this month. */
  spent: number
  /** The same plus the planned payments dated up to the end of this month (a forecast). */
  withPlanned: number
  /** The month is after the current one: only the forecast is meaningful. */
  future: boolean
}

const next = (m: string): string => {
  const y = Number(m.slice(0, 4))
  const mo = Number(m.slice(5, 7))
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}

/**
 * Month by month, how much has been spent in total and how much it will be if the planned payments are made. The range runs from the
 * first payment (or the current month, if that is earlier) to the current month, or to the last planned payment when that is later.
 * Empty when there is nothing to show.
 * `thisMonth` is YYYY-MM (passed in, so the result does not depend on the clock).
 */
export function spendingTrend(payments: Payment[], thisMonth: string): TrendPoint[] {
  const paid = payments.filter(isSpent)
  const planned = payments.filter(isPlanned)
  const months = [...paid, ...planned].map((p) => p.date.slice(0, 7))
  if (months.length === 0) return []
  const earliest = months.reduce((a, b) => (a < b ? a : b))
  const last = months.reduce((a, b) => (a > b ? a : b))
  const first = earliest < thisMonth ? earliest : thisMonth
  const end = last > thisMonth ? last : thisMonth
  const out: TrendPoint[] = []
  let spent = 0
  let withPlanned = 0
  for (let m = first; m <= end; m = next(m)) {
    for (const p of paid) if (p.date.slice(0, 7) === m) spent += p.amount
    for (const p of paid) if (p.date.slice(0, 7) === m) withPlanned += p.amount
    for (const p of planned) if (p.date.slice(0, 7) === m) withPlanned += p.amount
    out.push({ month: m, spent, withPlanned, future: m > thisMonth })
  }
  return out
}
