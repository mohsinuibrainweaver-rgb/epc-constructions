import type { Contract, PayStatus, Payment } from '../db/types'
import { money } from './format'
import { isAwaitingApproval, isPlanned, isSpent, sum, type Alert } from './stats'

/** What the contract is worth now: the first amount plus every variation (extra work adds, a deduction subtracts). */
export const contractTotal = (c: Pick<Contract, 'amount' | 'variations'>): number =>
  c.amount + (c.variations ?? []).reduce((s, v) => s + v.amount, 0)

export type ContractState = 'notStarted' | 'inProgress' | 'fullyPaid' | 'overpaid'

export interface ContractSummary {
  total: number
  /** Paid and approved payments counted against this contract. */
  paid: number
  /** Builder entries that wait for the investor, not counted yet. */
  awaiting: number
  /** Planned payments (for example a weekly payment) that will count once paid. */
  planned: number
  /** Total minus paid; negative when more was paid than agreed. */
  remaining: number
  /** Share of the total paid, 0 to 100 (capped for the bar; 100+ is shown by the overpaid state). */
  pct: number
  state: ContractState
  /** How much was paid beyond the agreed total, or 0. */
  over: number
}

/** The payments that belong to a contract (not in the bin). */
export const contractPayments = (c: Pick<Contract, 'id'>, payments: Payment[]): Payment[] =>
  payments.filter((p) => !p.deletedAt && p.contractId === c.id)

export function summarizeContract(c: Contract, payments: Payment[]): ContractSummary {
  const mine = contractPayments(c, payments)
  const total = contractTotal(c)
  const paid = sum(mine.filter(isSpent))
  const remaining = total - paid
  const state: ContractState = paid > total ? 'overpaid' : paid === total && total > 0 ? 'fullyPaid' : paid > 0 ? 'inProgress' : 'notStarted'
  return {
    total,
    paid,
    awaiting: sum(mine.filter(isAwaitingApproval)),
    planned: sum(mine.filter(isPlanned)),
    remaining,
    pct: total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : paid > 0 ? 100 : 0,
    state,
    over: Math.max(0, paid - total),
  }
}

export interface PaymentPreview {
  /** The contract before this payment (the payment itself is left out, so editing it does not count it twice). */
  before: ContractSummary
  /** Which instalment this would be: the payments already paid or waiting for approval, plus one. */
  instalment: number
  /** Whether it counts as paid once saved: paid or advance, and not waiting for the investor. */
  counts: boolean
  /** What is left after this payment; negative when it goes over the agreed total. */
  after: number
  /** How far over the agreed total the contract is after this payment, or 0. */
  over: number
}

/** What saving a payment against a contract would do, shown while the person fills in the form. */
export function previewPayment(
  c: Contract,
  payments: Payment[],
  draft: { id?: string; amount: number; status: PayStatus; waitsForApproval: boolean },
): PaymentPreview {
  const others = contractPayments(c, payments).filter((p) => p.id !== draft.id)
  const before = summarizeContract(c, others)
  const counts = (draft.status === 'paid' || draft.status === 'advance') && !draft.waitsForApproval
  const amount = Math.max(0, draft.amount)
  const after = before.remaining - (counts ? amount : 0)
  return {
    before,
    instalment: others.filter((p) => isSpent(p) || isAwaitingApproval(p)).length + 1,
    counts,
    after,
    over: counts ? Math.max(0, before.paid + amount - before.total) : before.over,
  }
}

/** Contracts that are still open, for choosing one when adding a payment. */
export const openContracts = (contracts: Contract[]): Contract[] => contracts.filter((c) => !c.deletedAt && c.status === 'active')

/** An alert for each open contract that has been paid more than was agreed. */
export function contractAlerts(contracts: Contract[], payments: Payment[]): Alert[] {
  const out: Alert[] = []
  for (const c of contracts.filter((x) => !x.deletedAt && x.status === 'active')) {
    const s = summarizeContract(c, payments)
    if (s.state === 'overpaid') out.push({ id: `co-${c.id}`, kind: 'error', key: 'notif.contractOver', vars: { name: c.title, amount: money(s.over) }, to: `/contracts/${c.id}` })
  }
  return out
}
