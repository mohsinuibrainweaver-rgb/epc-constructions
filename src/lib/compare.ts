import { CATEGORIES, type Category, type MaterialUnit, type Payment, type Phase, type Project } from '../db/types'
import { addDays } from './format'
import { priceRows } from './materials'
import { isSpent } from './stats'

/** One project as the comparison sees it. */
export interface Side {
  project: Pick<Project, 'id' | 'name' | 'startDate' | 'coveredArea' | 'budget'>
  payments: Payment[]
  phases: Phase[]
}

/** Money is shown either as it is, or per square foot of covered area. Both projects use the same basis. */
export interface Basis {
  /** What each project's amounts are divided by: 1 for the totals, the covered area for per sq ft. */
  divA: number
  divB: number
}
export const TOTALS: Basis = { divA: 1, divB: 1 }

/** The basis for "per sq ft", or undefined when either project has no covered area. */
export function perAreaBasis(a: Pick<Project, 'coveredArea'>, b: Pick<Project, 'coveredArea'>): Basis | undefined {
  return a.coveredArea && a.coveredArea > 0 && b.coveredArea && b.coveredArea > 0 ? { divA: a.coveredArea, divB: b.coveredArea } : undefined
}

export interface Delta {
  /** B minus A. */
  delta: number
  /** Percent of A (rounded); undefined when A is 0, so there is nothing to compare with. */
  pct: number | undefined
}
export const delta = (a: number, b: number): Delta => ({ delta: b - a, pct: a > 0 ? Math.round(((b - a) / a) * 100) : undefined })

const spentOf = (payments: Payment[], pick: (p: Payment) => boolean, div: number): number =>
  payments.filter((p) => isSpent(p) && pick(p)).reduce((s, p) => s + p.amount, 0) / div

/** The same phase in two projects: a standard phase by its key, a phase added by hand by its name. */
export const phaseIdentity = (p: Pick<Phase, 'key' | 'name'>): string => (p.key ? p.key : `name:${(p.name ?? '').trim().toLowerCase()}`)

export const NO_PHASE = '_none'

export interface PhaseCompareRow {
  id: string
  /** The phase as found in A, or in B when A has none; undefined for money that belongs to no phase. */
  phase: Phase | undefined
  a: number
  b: number
  /** The phase exists in that project. */
  inA: boolean
  inB: boolean
  /** The phase is marked complete in that project. */
  doneA: boolean
  doneB: boolean
}

/** Paid and approved money per phase in both projects. Phases with no spending in either are left out. */
export function comparePhases(a: Side, b: Side, basis: Basis = TOTALS): PhaseCompareRow[] {
  const liveA = a.phases.filter((p) => !p.deletedAt)
  const liveB = b.phases.filter((p) => !p.deletedAt)
  const byId = new Map<string, { pa?: Phase; pb?: Phase }>()
  for (const p of liveA) byId.set(phaseIdentity(p), { ...byId.get(phaseIdentity(p)), pa: p })
  for (const p of liveB) byId.set(phaseIdentity(p), { ...byId.get(phaseIdentity(p)), pb: p })
  const idsA = new Set(liveA.map((p) => p.id))
  const idsB = new Set(liveB.map((p) => p.id))
  const rows: PhaseCompareRow[] = []
  for (const [id, { pa, pb }] of byId) {
    const av = pa ? spentOf(a.payments, (p) => p.phaseId === pa.id, basis.divA) : 0
    const bv = pb ? spentOf(b.payments, (p) => p.phaseId === pb.id, basis.divB) : 0
    if (av === 0 && bv === 0) continue
    rows.push({ id, phase: pa ?? pb, a: av, b: bv, inA: Boolean(pa), inB: Boolean(pb), doneA: Boolean(pa?.done), doneB: Boolean(pb?.done) })
  }
  // The order of A's phases first, then the ones only B has.
  const order = [...liveA, ...liveB.filter((p) => !liveA.some((q) => phaseIdentity(q) === phaseIdentity(p)))].map(phaseIdentity)
  rows.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id))
  const outA = spentOf(a.payments, (p) => !p.phaseId || !idsA.has(p.phaseId), basis.divA)
  const outB = spentOf(b.payments, (p) => !p.phaseId || !idsB.has(p.phaseId), basis.divB)
  if (outA > 0 || outB > 0) rows.push({ id: NO_PHASE, phase: undefined, a: outA, b: outB, inA: true, inB: true, doneA: false, doneB: false })
  return rows
}

export interface CategoryCompareRow {
  category: Category
  a: number
  b: number
}

export function compareCategories(a: Side, b: Side, basis: Basis = TOTALS): CategoryCompareRow[] {
  return CATEGORIES.map((category) => ({
    category,
    a: spentOf(a.payments, (p) => p.category === category, basis.divA),
    b: spentOf(b.payments, (p) => p.category === category, basis.divB),
  })).filter((r) => r.a > 0 || r.b > 0)
}

export interface SideSummary {
  spent: number
  /** Spent divided by the covered area, or undefined when the area is not known. */
  perArea: number | undefined
  budget: number | undefined
  area: number | undefined
  /** The project's start date, or the day of its first paid payment when it has none. */
  start: string | undefined
  lastPaid: string | undefined
}

export function summarizeSide(s: Side): SideSummary {
  const spent = s.payments.filter(isSpent)
  const dates = spent.map((p) => p.date).sort()
  const total = spent.reduce((n, p) => n + p.amount, 0)
  const area = s.project.coveredArea && s.project.coveredArea > 0 ? s.project.coveredArea : undefined
  return {
    spent: total,
    perArea: area ? total / area : undefined,
    budget: s.project.budget && s.project.budget > 0 ? s.project.budget : undefined,
    area,
    start: s.project.startDate || dates[0],
    lastPaid: dates[dates.length - 1],
  }
}

const DAYS_PER_MONTH = 30.4375

/** Whole months from `start` to `date` (0 for the first month); a date before the start counts as month 0. */
export function monthsSince(start: string, date: string): number {
  const days = (new Date(`${date}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86_400_000
  return days <= 0 ? 0 : Math.floor(days / DAYS_PER_MONTH)
}

/** A project that was paid within this many days is still running, so its line goes on to today. */
const ACTIVE_DAYS = 45

/**
 * Total paid and approved money by the end of each month since the project started: element k is the total up to the end of
 * month k (month 0 is the first month). Empty when nothing was paid. `div` divides the amounts; `today` is YYYY-MM-DD.
 */
export function paceSeries(s: Side, today: string, div = 1): number[] {
  const sum = summarizeSide(s)
  if (!sum.start || !sum.lastPaid) return []
  const spent = s.payments.filter(isSpent)
  let end = monthsSince(sum.start, sum.lastPaid)
  if (sum.lastPaid >= addDays(today, -ACTIVE_DAYS)) end = Math.max(end, monthsSince(sum.start, today))
  const perMonth = new Array<number>(end + 1).fill(0)
  for (const p of spent) perMonth[Math.min(end, monthsSince(sum.start, p.date))] += p.amount
  let run = 0
  return perMonth.map((v) => (run += v / div))
}

/** The total at the end of month k; stays at the final total after the series ends, 0 for an empty series. */
export const paceAt = (series: number[], k: number): number => (series.length === 0 ? 0 : series[Math.min(k, series.length - 1)])

export interface PaceCompare {
  /** The month in which B stands now (B's last month). */
  month: number
  a: number
  b: number
}

/** Where B stands against A at the same elapsed time. Undefined unless both have spending. */
export function comparePace(a: number[], b: number[]): PaceCompare | undefined {
  if (a.length === 0 || b.length === 0) return undefined
  const month = b.length - 1
  return { month, a: paceAt(a, month), b: paceAt(b, month) }
}

export interface MaterialCompareRow {
  key: string
  item: string
  unit: MaterialUnit
  /** The average rate paid: total spent divided by total quantity. */
  rateA: number
  rateB: number
  /** Percent change from A to B (rounded), or undefined when A's rate is 0. */
  pct: number | undefined
  spentB: number
}

/** The materials bought in both projects (same item and unit), with the average rate each paid. Largest spend in B first. */
export function compareMaterials(a: Payment[], b: Payment[]): MaterialCompareRow[] {
  const ra = new Map(priceRows(a).map((r) => [r.key, r]))
  const rows: MaterialCompareRow[] = []
  for (const rb of priceRows(b)) {
    const x = ra.get(rb.key)
    if (!x || x.average <= 0 || rb.average <= 0) continue
    rows.push({ key: rb.key, item: rb.item, unit: rb.unit, rateA: x.average, rateB: rb.average, pct: delta(x.average, rb.average).pct, spentB: rb.spent })
  }
  return rows.sort((p, q) => q.spentB - p.spentB)
}

export interface Insight {
  row: PhaseCompareRow
  d: Delta
}

/**
 * The phases that stand out: where B costs the most more than A, and where it costs the most less. Only phases with spending in
 * both projects count. A phase that is not yet complete in B is never called cheaper, as it may simply not be finished.
 */
export function phaseInsights(rows: PhaseCompareRow[], limit = 3): { higher: Insight[]; lower: Insight[] } {
  const both = rows.filter((r) => r.id !== NO_PHASE && r.a > 0 && r.b > 0).map((row) => ({ row, d: delta(row.a, row.b) }))
  const higher = both.filter((x) => x.d.delta > 0).sort((p, q) => q.d.delta - p.d.delta).slice(0, limit)
  const lower = both.filter((x) => x.d.delta < 0 && x.row.doneB).sort((p, q) => p.d.delta - q.d.delta).slice(0, limit)
  return { higher, lower }
}

export type PhaseSort = 'order' | 'difference'

/** The phase rows in construction order (as given), or with the biggest difference between the two projects first; money with no phase stays last. */
export function sortPhaseRows(rows: PhaseCompareRow[], by: PhaseSort): PhaseCompareRow[] {
  if (by === 'order') return rows
  const named = rows.filter((r) => r.id !== NO_PHASE).sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a))
  return [...named, ...rows.filter((r) => r.id === NO_PHASE)]
}

/** One figure for the material prices: how much the rates changed on average, weighted by what was spent in B. Undefined with no rows. */
export function averageRateChange(rows: MaterialCompareRow[]): number | undefined {
  const usable = rows.filter((r) => r.pct !== undefined && r.spentB > 0)
  const weight = usable.reduce((s, r) => s + r.spentB, 0)
  if (usable.length === 0 || weight === 0) return undefined
  return Math.round(usable.reduce((s, r) => s + r.spentB * (r.pct as number), 0) / weight)
}
