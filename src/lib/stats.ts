import type { Payment, Phase, Project, Role } from '../db/types'
import { addDays, money } from './format'

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

/*
 * A budget here is an estimate, not a promise: prices are found out when things are bought, so a phase may have no estimate at all, and
 * the project's own figure is a starting number that moves up and down. So the states below separate what is worth a look from what is
 * only information, and a finished phase is never an alarm.
 */
export type BudgetState =
  | 'none' //       no estimate to compare with
  | 'ok' //         under 80% of it
  | 'near' //       80% up to the whole estimate, work not finished
  | 'full' //       the whole estimate used (within half a percent), work not finished: no room left, and no sign yet that it is wrong
  | 'overSlight' // over it, but within normal estimating error
  | 'over' //       clearly over it
  | 'onEstimate' // finished, and the cost came to the estimate
  | 'under' //      finished under the estimate

/** Within this share of the estimate counts as "the whole estimate" (0.5%). */
export const ON_TOLERANCE = 0.005
/** Up to this much over an estimate is ordinary estimating error (5%); beyond it the overspend is worth a red flag. */
export const SLIGHT_OVER = 0.05

/** How a cost stands against an estimate. `done` is a finished phase, whose cost is final. */
export function budgetState(spent: number, estimate: number | undefined, done = false): BudgetState {
  if (!estimate || estimate <= 0) return 'none'
  const r = spent / estimate
  const on = Math.abs(r - 1) <= ON_TOLERANCE + 1e-9 // the 1e-9 keeps 99.5% from missing by floating-point dust
  if (done) return on ? 'onEstimate' : r < 1 ? 'under' : r <= 1 + SLIGHT_OVER ? 'overSlight' : 'over'
  if (on) return 'full'
  if (r > 1) return r <= 1 + SLIGHT_OVER ? 'overSlight' : 'over'
  return r >= 0.8 ? 'near' : 'ok'
}

/** What a state asks of the person: red is a clear overspend, amber is worth a look, green is good news, neutral is information. */
export type BudgetTone = 'danger' | 'warning' | 'success' | 'neutral' | 'none'
export function budgetTone(state: BudgetState): BudgetTone {
  switch (state) {
    case 'over':
      return 'danger'
    case 'overSlight':
    case 'near':
      return 'warning'
    case 'onEstimate':
    case 'under':
      return 'success'
    case 'full':
      return 'neutral'
    default:
      return 'none'
  }
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
  state: BudgetState
  /** The phase is marked complete, so its cost is meant to be final. */
  done: boolean
}

/**
 * What saving a payment would do to its phase's budget, shown while the person fills in the form.
 * Undefined when the phase has no budget, so there is nothing to compare with.
 */
export function previewPhaseBudget(
  phase: Pick<Phase, 'id' | 'budget' | 'done'>,
  payments: Payment[],
  draft: { id?: string; amount: number; status: Payment['status']; waitsForApproval: boolean },
): PhaseBudgetPreview | undefined {
  const budget = phase.budget
  if (!budget || budget <= 0) return undefined
  const spent = sum(payments.filter((p) => p.phaseId === phase.id && p.id !== draft.id && isSpent(p)))
  const counts = (draft.status === 'paid' || draft.status === 'advance') && !draft.waitsForApproval
  const total = spent + (counts ? Math.max(0, draft.amount) : 0)
  return { spent, budget, pct: percent(spent, budget), counts, afterPct: percent(total, budget), over: Math.max(0, total - budget), state: budgetState(total, budget, Boolean(phase.done)), done: Boolean(phase.done) }
}

export interface PhaseProgressRow {
  phase: Phase
  /** Paid and approved payments on the phase. */
  spent: number
  /** Undefined when the phase has no budget (a budget of 0 counts as none). */
  budget: number | undefined
  /** Percent of the budget spent; 0 when there is no budget. */
  pct: number
  done: boolean
  state: BudgetState
}

export interface PhaseProgress {
  /** The phases worth showing: those with spending or an estimate, unfinished ones over or near their estimate first, then by spending; finished ones last. */
  rows: PhaseProgressRow[]
  /** Phases with neither spending nor a budget. */
  notStarted: number
  /** Phases that have a budget. */
  budgeted: number
  total: number
}

/** What is listed first: unfinished phases that are over, near or at their estimate, then the rest of the unfinished ones, then finished phases. */
const STATE_RANK: Record<BudgetState, number> = { over: 0, overSlight: 1, near: 2, full: 3, ok: 4, none: 4, onEstimate: 5, under: 5 }
const rankOf = (r: { done: boolean; state: BudgetState }): number => (r.done ? 5 : STATE_RANK[r.state])

/** What Home's Phase progress card lists, so it shows the phases that matter and only counts the empty ones. */
export function phaseProgress(phases: Phase[], payments: Payment[], limit = 5): PhaseProgress {
  const live = payments.filter((p) => !p.deletedAt)
  const all: PhaseProgressRow[] = phases.map((phase) => {
    const spent = sum(live.filter((p) => p.phaseId === phase.id && isSpent(p)))
    const budget = phase.budget && phase.budget > 0 ? phase.budget : undefined
    const done = Boolean(phase.done)
    return { phase, spent, budget, pct: percent(spent, budget), done, state: budgetState(spent, budget, done) }
  })
  const active = all.filter((r) => r.spent > 0 || r.budget !== undefined)
  active.sort((a, b) => rankOf(a) - rankOf(b) || b.spent - a.spent)
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

export interface BudgetOutlook {
  /** The project's working budget; undefined when none is set. */
  budget: number | undefined
  /** All paid and approved money, in a phase or not. */
  spent: number
  /** Of it: on finished phases, on unfinished ones, and on no phase. */
  spentDone: number
  spentOpen: number
  outside: number
  /** What the estimates say is still to come: for each unfinished phase that has an estimate, the estimate minus what is spent (never below 0). */
  estimatedLeft: number
  /** Unfinished phases with no estimate: their cost is not known yet. */
  unpriced: number
  /** The budget left after what is spent and what the estimates still expect (negative: short). Undefined with no budget. */
  headroom: number | undefined
  /** The headroom shared evenly among the unpriced phases, when there is some room and some phases to give it to. */
  headroomEach: number | undefined
  /** The lowest the project is likely to cost: what is spent plus what the estimates still expect. Phases with no estimate add nothing yet. */
  projectedLow: number
  state: BudgetState
  done: number
  total: number
}

/**
 * Where the money stands, built from the bottom: what has been paid, split by finished and unfinished phases, what the estimates still
 * expect, and how much of the budget is left for the phases nobody has priced yet. No phase has to have an estimate for this to work.
 */
export function budgetOutlook(phases: Phase[], payments: Payment[], projectBudget: number | undefined): BudgetOutlook {
  const live = phases.filter((ph) => !ph.deletedAt)
  const ids = new Set(live.map((ph) => ph.id))
  const spentPayments = payments.filter(isSpent)
  let spentDone = 0
  let spentOpen = 0
  let estimatedLeft = 0
  let unpriced = 0
  for (const ph of live) {
    const spent = sum(spentPayments.filter((p) => p.phaseId === ph.id))
    const estimate = ph.budget && ph.budget > 0 ? ph.budget : undefined
    if (ph.done) spentDone += spent
    else {
      spentOpen += spent
      if (estimate) estimatedLeft += Math.max(0, estimate - spent)
      else unpriced++
    }
  }
  const outside = sum(spentPayments.filter((p) => !p.phaseId || !ids.has(p.phaseId)))
  const spent = spentDone + spentOpen + outside
  const budget = projectBudget && projectBudget > 0 ? projectBudget : undefined
  const headroom = budget === undefined ? undefined : budget - spent - estimatedLeft
  return {
    budget,
    spent,
    spentDone,
    spentOpen,
    outside,
    estimatedLeft,
    unpriced,
    headroom,
    headroomEach: headroom !== undefined && headroom > 0 && unpriced > 0 ? Math.round(headroom / unpriced) : undefined,
    projectedLow: spent + estimatedLeft,
    state: budgetState(spent, budget),
    done: live.filter((ph) => ph.done).length,
    total: live.length,
  }
}

/** Unfinished phases that have used their whole estimate: no room left, so either the work is finished (mark it complete) or more is coming. */
export function fullPhases(phases: Phase[], payments: Payment[]): Phase[] {
  const spentPayments = payments.filter(isSpent)
  return phases.filter((ph) => !ph.deletedAt && !ph.done && budgetState(sum(spentPayments.filter((p) => p.phaseId === ph.id)), ph.budget) === 'full')
}

export interface Alert {
  id: string
  kind: 'warning' | 'error'
  key: 'notif.budget80' | 'notif.estimate80' | 'notif.phaseOver' | 'notif.projectOver' | 'notif.overdue' | 'notif.dueSoon' | 'notif.pending' | 'notif.rejected' | 'notif.contractOver'
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

  // The project's figure is a working estimate that moves, so passing it asks for a decision (raise it, or look at the spending) and is
  // red only when the overspend is clear. A finished phase is never listed: there is nothing left to do about it.
  const total = sum(live.filter(isSpent))
  const ps = budgetState(total, project.budget)
  if (ps === 'over' || ps === 'overSlight') {
    out.push({ id: 'proj-over', kind: ps === 'over' ? 'error' : 'warning', key: 'notif.projectOver', vars: { name: project.name, amount: money(total - (project.budget ?? 0)) }, to: '/phases' })
  } else if (ps === 'near') {
    out.push({ id: 'proj-80', kind: 'warning', key: 'notif.budget80', vars: { name: project.name, pct: percent(total, project.budget) }, to: '/phases' })
  }

  for (const ph of phases) {
    if (ph.done) continue
    const spent = sum(live.filter((p) => p.phaseId === ph.id && isSpent(p)))
    const st = budgetState(spent, ph.budget)
    if (st === 'over' || st === 'overSlight') {
      out.push({ id: `ph-over-${ph.id}`, kind: st === 'over' ? 'error' : 'warning', key: 'notif.phaseOver', vars: { name: phaseName(ph), amount: money(spent - (ph.budget ?? 0)) }, to: `/phases/${ph.id}` })
    } else if (st === 'near') {
      out.push({ id: `ph-80-${ph.id}`, kind: 'warning', key: 'notif.estimate80', vars: { name: phaseName(ph), pct: percent(spent, ph.budget) }, to: `/phases/${ph.id}` })
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
