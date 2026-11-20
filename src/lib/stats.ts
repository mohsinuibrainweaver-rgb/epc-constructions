import type { Payment, Phase, Project, Role } from '../db/types'
import { addDays } from './format'

/**
 * A payment counts as spent when it is Paid or an Advance, is not in the bin, and has not been held back:
 * a builder's entry waits (pending) or is turned down (rejected) until the investor approves it.
 */
export const isSpent = (p: Payment): boolean =>
  !p.deletedAt && (p.status === 'paid' || p.status === 'advance') && p.approval !== 'pending' && p.approval !== 'rejected'

/** Entries the investor still has to approve, and entries that were turned down. */
export const isAwaitingApproval = (p: Payment): boolean => !p.deletedAt && p.approval === 'pending'
export const isRejected = (p: Payment): boolean => !p.deletedAt && p.approval === 'rejected'

export const isPlanned = (p: Payment): boolean => !p.deletedAt && p.status === 'planned'

export const sum = (ps: Payment[]): number => ps.reduce((s, p) => s + p.amount, 0)

export type BudgetLevel = 'none' | 'ok' | 'warning' | 'error'

/** Neutral under 80 percent, warning from 80, error from 100. */
export function budgetLevel(spent: number, budget: number | undefined): BudgetLevel {
  if (!budget || budget <= 0) return 'none'
  const pct = (spent / budget) * 100
  if (pct >= 100) return 'error'
  if (pct >= 80) return 'warning'
  return 'ok'
}

export const percent = (spent: number, budget: number | undefined): number =>
  budget && budget > 0 ? Math.round((spent / budget) * 100) : 0

export interface PhaseBudgetPreview {
  /** Spent on the phase before this payment (the payment itself is left out, so editing it does not count it twice). */
  spent: number
  budget: number
  /** Percent of the budget spent before this payment. */
  pct: number
  /** Whether this payment counts as spent once saved: paid or advance, and not waiting for the investor. */
  counts: boolean
  /** Percent of the budget after this payment. */
  afterPct: number
  /** How far over the budget the phase is after this payment, or 0. */
  over: number
  /** Where the phase stands after this payment (before it, when this payment does not count). */
  level: BudgetLevel
}

/**
 * What saving a payment would do to its phase's budget, shown while the person fills in the form.
 * Undefined when the phase has no budget, so there is nothing to compare with.
 */
export function previewPhaseBudget(
  phase: Pick<Phase, 'id' | 'budget'>,
  payments: Payment[],
  draft: { id?: string; amount: number; status: Payment['status']; waitsForApproval: boolean },
): PhaseBudgetPreview | undefined {
  const budget = phase.budget
  if (!budget || budget <= 0) return undefined
  const spent = sum(payments.filter((p) => p.phaseId === phase.id && p.id !== draft.id && isSpent(p)))
  const counts = (draft.status === 'paid' || draft.status === 'advance') && !draft.waitsForApproval
  const total = spent + (counts ? Math.max(0, draft.amount) : 0)
  return { spent, budget, pct: percent(spent, budget), counts, afterPct: percent(total, budget), over: Math.max(0, total - budget), level: budgetLevel(total, budget) }
}

export interface PhaseProgressRow {
  phase: Phase
  /** Paid and approved payments on the phase. */
  spent: number
  /** Undefined when the phase has no budget (a budget of 0 counts as none). */
  budget: number | undefined
  /** Percent of the budget spent; 0 when there is no budget. */
  pct: number
  level: BudgetLevel
}

export interface PhaseProgress {
  /** The phases worth showing: those with spending or a budget, over-budget first, then nearest the limit, then by spending. */
  rows: PhaseProgressRow[]
  /** Phases with neither spending nor a budget. */
  notStarted: number
  /** Phases that have a budget. */
  budgeted: number
  total: number
}

const LEVEL_RANK: Record<BudgetLevel, number> = { error: 0, warning: 1, ok: 2, none: 2 }

/** What Home's Phase progress card lists, so it shows the phases that matter and only counts the empty ones. */
export function phaseProgress(phases: Phase[], payments: Payment[], limit = 5): PhaseProgress {
  const live = payments.filter((p) => !p.deletedAt)
  const all: PhaseProgressRow[] = phases.map((phase) => {
    const spent = sum(live.filter((p) => p.phaseId === phase.id && isSpent(p)))
    const budget = phase.budget && phase.budget > 0 ? phase.budget : undefined
    return { phase, spent, budget, pct: percent(spent, budget), level: budgetLevel(spent, budget) }
  })
  const active = all.filter((r) => r.spent > 0 || r.budget !== undefined)
  active.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.spent - a.spent)
  return {
    rows: active.slice(0, limit),
    notStarted: all.length - active.length,
    budgeted: all.filter((r) => r.budget !== undefined).length,
    total: all.length,
  }
}

export interface PhaseFigures {
  /** Paid and approved. */
  spent: number
  /** Planned, not paid yet. */
  planned: number
  /** Waiting for the investor, not counted yet. */
  awaiting: number
  /** Budget not yet spent (0 when over, or when there is no budget). */
  left: number
  /** Spent beyond the budget (0 when within it, or when there is no budget). */
  over: number
  /** Entries on the phase that are not removed, whatever their status. */
  count: number
}

/** The figures at the top of a phase's page. `payments` are the payments of that phase. */
export function phaseFigures(payments: Payment[], budget: number | undefined): PhaseFigures {
  const live = payments.filter((p) => !p.deletedAt)
  const spent = sum(live.filter(isSpent))
  const b = budget && budget > 0 ? budget : undefined
  return {
    spent,
    planned: sum(live.filter(isPlanned)),
    awaiting: sum(live.filter(isAwaitingApproval)),
    left: b ? Math.max(0, b - spent) : 0,
    over: b ? Math.max(0, spent - b) : 0,
    count: live.length,
  }
}

/** Paid and approved money grouped by a label (largest first), for "where the money went". Equal amounts keep the label order. */
export function spentBy(payments: Payment[], label: (p: Payment) => string): { label: string; amount: number }[] {
  const m = new Map<string, number>()
  for (const p of payments) if (isSpent(p)) m.set(label(p), (m.get(label(p)) ?? 0) + p.amount)
  return [...m].map(([l, amount]) => ({ label: l, amount })).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
}

export interface BudgetPlan {
  /** The project's own budget; undefined when none is set. */
  projectBudget: number | undefined
  /** The phase budgets added together. */
  allocated: number
  /** Project budget not yet given to any phase (0 when there is no project budget or it is all given out). */
  unallocated: number
  /** How much the phase budgets add up to beyond the project budget (0 when they fit or there is no project budget). */
  overAllocated: number
  total: number
  withBudget: number
  done: number
  /** Paid and approved money that belongs to no phase, so no phase bar shows it. */
  outsideSpent: number
}

/** The plan of the money across phases, for the top of the Phases screen. */
export function budgetPlan(phases: Phase[], payments: Payment[], projectBudget: number | undefined): BudgetPlan {
  const live = phases.filter((ph) => !ph.deletedAt)
  const ids = new Set(live.map((ph) => ph.id))
  const budgets = live.map((ph) => (ph.budget && ph.budget > 0 ? ph.budget : 0))
  const allocated = budgets.reduce((s, b) => s + b, 0)
  const pb = projectBudget && projectBudget > 0 ? projectBudget : undefined
  return {
    projectBudget: pb,
    allocated,
    unallocated: pb ? Math.max(0, pb - allocated) : 0,
    overAllocated: pb ? Math.max(0, allocated - pb) : 0,
    total: live.length,
    withBudget: budgets.filter((b) => b > 0).length,
    done: live.filter((ph) => ph.done).length,
    outsideSpent: sum(payments.filter((p) => isSpent(p) && (!p.phaseId || !ids.has(p.phaseId)))),
  }
}

export interface Alert {
  id: string
  kind: 'warning' | 'error'
  key: 'notif.budget80' | 'notif.budget100' | 'notif.overdue' | 'notif.dueSoon' | 'notif.pending' | 'notif.rejected' | 'notif.contractOver'
  vars: Record<string, string | number>
  to: string
}

/** Alerts are derived on the fly from the data, so they are never out of date. */
export function buildAlerts(
  project: Project | undefined,
  phases: Phase[],
  payments: Payment[],
  phaseName: (p: Phase) => string,
  today: string,
  role?: Role,
): Alert[] {
  const out: Alert[] = []
  if (!project) return out
  const live = payments.filter((p) => !p.deletedAt)

  // The investor is told about entries to approve; the builder about entries that came back.
  const waiting = live.filter(isAwaitingApproval).length
  if (role === 'investor' && waiting > 0) out.push({ id: 'approvals', kind: 'warning', key: 'notif.pending', vars: { count: waiting }, to: '/ledger?approval=pending' })
  const turnedDown = live.filter(isRejected).length
  if (role === 'builder' && turnedDown > 0) out.push({ id: 'rejected', kind: 'error', key: 'notif.rejected', vars: { count: turnedDown }, to: '/ledger?approval=rejected' })

  const total = sum(live.filter(isSpent))
  const lvl = budgetLevel(total, project.budget)
  if (lvl === 'error') {
    out.push({ id: 'proj-over', kind: 'error', key: 'notif.budget100', vars: { name: project.name }, to: '/reports' })
  } else if (lvl === 'warning') {
    out.push({
      id: 'proj-80',
      kind: 'warning',
      key: 'notif.budget80',
      vars: { name: project.name, pct: percent(total, project.budget) },
      to: '/reports',
    })
  }

  for (const ph of phases) {
    const spent = sum(live.filter((p) => p.phaseId === ph.id && isSpent(p)))
    const l = budgetLevel(spent, ph.budget)
    if (l === 'error') {
      out.push({ id: `ph-over-${ph.id}`, kind: 'error', key: 'notif.budget100', vars: { name: phaseName(ph) }, to: `/phases/${ph.id}` })
    } else if (l === 'warning') {
      out.push({
        id: `ph-80-${ph.id}`,
        kind: 'warning',
        key: 'notif.budget80',
        vars: { name: phaseName(ph), pct: percent(spent, ph.budget) },
        to: `/phases/${ph.id}`,
      })
    }
  }

  const soon = addDays(today, 3)
  for (const p of live.filter(isPlanned)) {
    if (p.date < today) {
      out.push({ id: `od-${p.id}`, kind: 'error', key: 'notif.overdue', vars: { what: p.purpose }, to: `/payments/${p.id}` })
    } else if (p.date <= soon) {
      out.push({ id: `ds-${p.id}`, kind: 'warning', key: 'notif.dueSoon', vars: { what: p.purpose }, to: `/payments/${p.id}` })
    }
  }
  return out
}
