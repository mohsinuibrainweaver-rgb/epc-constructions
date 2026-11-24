import type { FeeBasis, Payment, Phase, PhaseFeeKind, Project, Transfer } from '@/db/types'
import { todayISO } from './format'
import { isSpent, sum } from './stats'

export interface Settlement {
  /** Everything spent on the build (Paid and Advance payments), whoever paid it. */
  constructionCost: number
  paidByInvestor: number
  paidByBuilder: number
  /** Money the investor gave the builder to spend (advances and top-ups). */
  advances: number
  /** Money the investor repaid the builder for costs the builder paid himself. */
  reimbursed: number
  /** Unspent money the builder gave back. */
  returned: number
  /**
   * Positive: the investor owes the builder for construction costs.
   * Negative: the builder still holds that much of the investor's money.
   */
  builderBalance: number
  feeBasis: FeeBasis
  /** How the fee came about: the per-phase lines or the retainer months. */
  fee: FeeResult
  /** Undefined while the fee is "decided at the end". */
  feeEarned: number | undefined
  feePaid: number
  /** Earned minus paid. Zero while the fee is not decided. */
  feeOutstanding: number
  /** Construction balance plus the fee still owed: what the investor owes the builder (negative: the builder owes). */
  totalDue: number
}

const total = (ts: Transfer[], kinds: Transfer['kind'][]): number =>
  ts.filter((t) => !t.deletedAt && kinds.includes(t.kind)).reduce((s, t) => s + t.amount, 0)

type FeeProject = Pick<Project, 'feeBasis' | 'feeAmount' | 'feePercent'> & Partial<Pick<Project, 'ownerId' | 'retainerAmount' | 'retainerStart' | 'retainerEnd'>>

/** One phase's share of a per-phase fee. */
export interface FeeLine {
  phaseId: string
  kind: PhaseFeeKind
  /** Rupees (fixed) or percent (percent). */
  value: number
  /** Approved cost of the phase so far. */
  cost: number
  earned: number
  /** A fixed fee counts once the phase is complete; a percentage always counts. */
  counted: boolean
}

export interface FeeResult {
  /** Undefined while the fee is "decided at the end". */
  earned: number | undefined
  lines: FeeLine[]
  /** Retainer only: months that have started, each counted in full. */
  months?: number
}

/** Months from the start month to the end (or today), the month of the start included. */
export function retainerMonths(start: string | undefined, end: string | undefined, today: string): number {
  if (!start) return 0
  const last = end && end < today ? end : today
  if (last < start) return 0
  const [sy, sm] = start.split('-').map(Number)
  const [ly, lm] = last.split('-').map(Number)
  return (ly - sy) * 12 + (lm - sm) + 1
}

/** What the builder has earned so far under the chosen way of working out the fee. */
export function computeFee(project: FeeProject, phases: Phase[], payments: Payment[], today: string, constructionCost?: number): FeeResult {
  const basis = project.feeBasis ?? 'tbd'
  const cost = constructionCost ?? sum(payments.filter(isSpent))
  if (basis === 'fixed') return { earned: project.feeAmount ?? 0, lines: [] }
  if (basis === 'percent') return { earned: Math.round((cost * (project.feePercent ?? 0)) / 100), lines: [] }
  if (basis === 'retainer') {
    const months = retainerMonths(project.retainerStart, project.retainerEnd, today)
    return { earned: months * (project.retainerAmount ?? 0), lines: [], months }
  }
  if (basis === 'perPhase') {
    const lines: FeeLine[] = []
    for (const ph of phases.filter((p) => !p.deletedAt && p.feeKind && p.feeValue)) {
      const phaseCost = sum(payments.filter((p) => p.phaseId === ph.id && isSpent(p)))
      const kind = ph.feeKind as PhaseFeeKind
      const value = Number(ph.feeValue)
      const counted = kind === 'percent' || ph.done === true
      const raw = kind === 'percent' ? Math.round((phaseCost * value) / 100) : value
      lines.push({ phaseId: ph.id, kind, value, cost: phaseCost, earned: counted ? raw : 0, counted })
    }
    return { earned: lines.reduce((s, l) => s + l.earned, 0), lines }
  }
  return { earned: undefined, lines: [] }
}

/** The fee for the simple bases (kept for callers that have no phases). */
export function computeFeeEarned(project: FeeProject, constructionCost: number): number | undefined {
  return computeFee(project, [], [], todayISO(), constructionCost).earned
}

export function computeSettlement(
  project: FeeProject,
  payments: Payment[],
  transfers: Transfer[],
  phases: Phase[] = [],
  today: string = todayISO(),
): Settlement {
  const spent = payments.filter(isSpent)
  const constructionCost = sum(spent)
  const paidByBuilder = sum(spent.filter((p) => p.paidBy !== 'investor' && p.paidBy !== project.ownerId))
  const paidByInvestor = constructionCost - paidByBuilder
  const advances = total(transfers, ['advance', 'topup'])
  const reimbursed = total(transfers, ['reimbursement'])
  const returned = total(transfers, ['return'])
  const builderBalance = paidByBuilder - advances - reimbursed + returned

  const fee = computeFee(project, phases, payments, today, constructionCost)
  const feeEarned = fee.earned
  const feePaid = total(transfers, ['fee'])
  const feeOutstanding = feeEarned === undefined ? 0 : feeEarned - feePaid

  return {
    constructionCost,
    paidByInvestor,
    paidByBuilder,
    advances,
    reimbursed,
    returned,
    builderBalance,
    feeBasis: project.feeBasis ?? 'tbd',
    fee,
    feeEarned,
    feePaid,
    feeOutstanding,
    totalDue: builderBalance + feeOutstanding,
  }
}
