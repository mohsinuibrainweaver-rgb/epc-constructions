import type { Payment } from '../db/types'
import { isAwaitingApproval, isPlanned, isSpent, sum } from './stats'

export type StatementScope = 'all' | 'vendor' | 'phase' | 'contract'

export interface StatementFilter {
  scope: StatementScope
  vendorId?: string
  phaseId?: string
  contractId?: string
  /** YYYY-MM-DD, inclusive; empty means no limit. */
  from?: string
  to?: string
  /** Also list payments that are planned but not paid yet (shown apart, not in the total). */
  includePlanned: boolean
  /** Also list builder entries that wait for approval (shown apart, not in the total). */
  includePending: boolean
}

export interface StatementResult {
  /** Everything listed, oldest first. */
  rows: Payment[]
  /** Paid and advance payments that are approved: the figure the statement stands behind. */
  total: number
  /** Listed but not counted. */
  plannedTotal: number
  pendingTotal: number
  byMode: { cash: number; bank: number }
  byPaidBy: { investor: number; builder: number }
  /** Counted amount per phase id ('' for no phase), largest first. */
  byPhase: { phaseId: string; amount: number }[]
  countedCount: number
}

const inScope = (p: Payment, f: StatementFilter): boolean => {
  if (f.scope === 'vendor') return p.vendorId === f.vendorId
  if (f.scope === 'phase') return p.phaseId === f.phaseId
  if (f.scope === 'contract') return p.contractId === f.contractId
  return true
}

/** Which payments a statement lists and what they add up to. Skipped, rejected and binned entries never appear. */
export function buildStatement(payments: Payment[], f: StatementFilter): StatementResult {
  const candidates = payments.filter((p) => !p.deletedAt && inScope(p, f) && (!f.from || p.date >= f.from) && (!f.to || p.date <= f.to))
  const counted = candidates.filter(isSpent)
  const planned = f.includePlanned ? candidates.filter(isPlanned) : []
  const pending = f.includePending ? candidates.filter(isAwaitingApproval) : []

  const byPhase = new Map<string, number>()
  for (const p of counted) byPhase.set(p.phaseId ?? '', (byPhase.get(p.phaseId ?? '') ?? 0) + p.amount)

  return {
    rows: [...counted, ...planned, ...pending].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt),
    total: sum(counted),
    plannedTotal: sum(planned),
    pendingTotal: sum(pending),
    byMode: { cash: sum(counted.filter((p) => p.mode === 'cash')), bank: sum(counted.filter((p) => p.mode === 'bank')) },
    byPaidBy: { investor: sum(counted.filter((p) => p.paidBy === 'investor')), builder: sum(counted.filter((p) => p.paidBy === 'builder')) },
    byPhase: [...byPhase].map(([phaseId, amount]) => ({ phaseId, amount })).sort((a, b) => b.amount - a.amount),
    countedCount: counted.length,
  }
}
