import type { PayStatus, Payment, Role } from '../db/types'

/** An entry the builder records as paid (or as an advance) waits for the investor to approve it. */
export const needsApproval = (role: Role, status: PayStatus): boolean => role === 'builder' && (status === 'paid' || status === 'advance')

type ApprovalFields = Pick<Payment, 'approval' | 'approvedBy' | 'approvedAt' | 'rejectReason'>

/**
 * The approval fields a saved payment should carry.
 * A builder's paid entry goes (back) to pending, so any change is checked again. Everyone else keeps what is there.
 */
export function approvalFields(role: Role, status: PayStatus, existing?: Partial<ApprovalFields>): ApprovalFields {
  if (needsApproval(role, status)) return { approval: 'pending', approvedBy: undefined, approvedAt: undefined, rejectReason: undefined }
  return {
    approval: existing?.approval,
    approvedBy: existing?.approvedBy,
    approvedAt: existing?.approvedAt,
    rejectReason: existing?.rejectReason,
  }
}
