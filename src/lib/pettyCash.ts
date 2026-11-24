import type { Payment, Transfer } from '@/db/types'
import { isAwaitingApproval, isSpent } from '@/lib/stats'

export interface MemberCashPosition {
  memberId: string
  given: number
  spentFromProjectCash: number
  returned: number
  cashHeld: number
  pendingCashUse: number
  availableCash: number
  spentFromOwnFunds: number
  reimbursed: number
  reimbursementDue: number
}

const amountFromProjectCash = (payment: Payment): number =>
  Math.min(payment.amount, Math.max(0, payment.projectCashAmount ?? 0))

/**
 * Calculates one member's project-cash custody and own-pocket reimbursement separately.
 * Legacy payments have no projectCashAmount, so they remain own-pocket payments; legacy
 * aggregate transfers have no memberId and are deliberately not guessed onto a person.
 */
export function memberCashPosition(memberId: string, payments: Payment[], transfers: Transfer[]): MemberCashPosition {
  const memberPayments = payments.filter((payment) => payment.paidBy === memberId)
  const confirmed = memberPayments.filter(isSpent)
  const pending = memberPayments.filter(isAwaitingApproval)
  const memberTransfers = transfers.filter((transfer) => !transfer.deletedAt && transfer.memberId === memberId)

  const given = memberTransfers
    .filter((transfer) => transfer.kind === 'advance' || transfer.kind === 'topup')
    .reduce((total, transfer) => total + transfer.amount, 0)
  const returned = memberTransfers
    .filter((transfer) => transfer.kind === 'return')
    .reduce((total, transfer) => total + transfer.amount, 0)
  const reimbursed = memberTransfers
    .filter((transfer) => transfer.kind === 'reimbursement')
    .reduce((total, transfer) => total + transfer.amount, 0)
  const spentFromProjectCash = confirmed.reduce((total, payment) => total + amountFromProjectCash(payment), 0)
  const spentFromOwnFunds = confirmed.reduce(
    (total, payment) => total + Math.max(0, payment.amount - amountFromProjectCash(payment)),
    0,
  )
  const pendingCashUse = pending.reduce((total, payment) => total + amountFromProjectCash(payment), 0)
  const cashHeld = given - returned - spentFromProjectCash

  return {
    memberId,
    given,
    spentFromProjectCash,
    returned,
    cashHeld,
    pendingCashUse,
    availableCash: cashHeld - pendingCashUse,
    spentFromOwnFunds,
    reimbursed,
    reimbursementDue: spentFromOwnFunds - reimbursed,
  }
}

export const projectCashUsed = amountFromProjectCash

/** Total project cash currently held by members, with legacy aggregate rows kept in their old net calculation. */
export function totalProjectCashHeld(ownerId: string | undefined, payments: Payment[], transfers: Transfer[]): number {
  const explicitIds = new Set<string>()
  for (const transfer of transfers) if (!transfer.deletedAt && transfer.memberId) explicitIds.add(transfer.memberId)
  for (const payment of payments) {
    if (payment.projectCashAmount !== undefined && payment.projectCashAmount !== null && payment.paidBy !== ownerId) explicitIds.add(payment.paidBy)
  }
  const explicitHeld = [...explicitIds].reduce(
    (total, memberId) => total + Math.max(0, memberCashPosition(memberId, payments, transfers).cashHeld),
    0,
  )

  const legacyPayments = payments.filter(
    (payment) => (payment.projectCashAmount === undefined || payment.projectCashAmount === null) && payment.paidBy !== 'investor' && payment.paidBy !== ownerId && isSpent(payment),
  )
  const legacyTransfers = transfers.filter((transfer) => !transfer.deletedAt && !transfer.memberId)
  const legacyPaid = legacyPayments.reduce((total, payment) => total + payment.amount, 0)
  const legacyGiven = legacyTransfers
    .filter((transfer) => transfer.kind === 'advance' || transfer.kind === 'topup')
    .reduce((total, transfer) => total + transfer.amount, 0)
  const legacyReimbursed = legacyTransfers
    .filter((transfer) => transfer.kind === 'reimbursement')
    .reduce((total, transfer) => total + transfer.amount, 0)
  const legacyReturned = legacyTransfers
    .filter((transfer) => transfer.kind === 'return')
    .reduce((total, transfer) => total + transfer.amount, 0)
  const legacyBalance = legacyPaid - legacyGiven - legacyReimbursed + legacyReturned

  return explicitHeld + Math.max(0, -legacyBalance)
}
