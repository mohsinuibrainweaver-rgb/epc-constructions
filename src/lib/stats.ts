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
