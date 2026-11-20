import type { Payment } from '../db/types'
import { isAwaitingApproval, isPlanned, isSpent, sum } from './stats'

export type LedgerSort = 'newest' | 'oldest' | 'largest' | 'smallest'
export const LEDGER_SORTS: LedgerSort[] = ['newest', 'oldest', 'largest', 'smallest']

/** A new array in the chosen order; ties fall back to when the payment was added, so the order is stable. */
export function sortPayments(rows: Payment[], sort: LedgerSort): Payment[] {
  const by: Record<LedgerSort, (a: Payment, b: Payment) => number> = {
    newest: (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
    oldest: (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
    largest: (a, b) => b.amount - a.amount || b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
    smallest: (a, b) => a.amount - b.amount || b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
  }
  return [...rows].sort(by[sort])
}

export interface LedgerTotals {
  /** Paid and approved: what counts as spent. */
  paid: number
  /** Planned payments, not paid yet. */
  planned: number
  /** Entries waiting for the investor, not counted yet. */
  awaiting: number
  count: number
}

/** The figures above the Ledger list, for the rows that are shown. */
export function ledgerTotals(rows: Payment[]): LedgerTotals {
  return { paid: sum(rows.filter(isSpent)), planned: sum(rows.filter(isPlanned)), awaiting: sum(rows.filter(isAwaitingApproval)), count: rows.length }
}
