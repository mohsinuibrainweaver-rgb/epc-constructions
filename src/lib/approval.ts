import type { PayStatus, Payment, Role } from '../db/types'

/** A paid entry made by someone without approval permission waits for a permitted reviewer. */
export const needsApproval = (access: Role | boolean, status: PayStatus): boolean =>
  (typeof access === 'boolean' ? !access : access === 'builder') && (status === 'paid' || status === 'advance')

type ApprovalFields = Pick<Payment, 'approval' | 'approvedBy' | 'approvedAt' | 'rejectReason'>

/**
 * The approval fields a saved payment should carry.
 * A builder's paid entry goes (back) to pending, so any change is checked again. Everyone else keeps what is there.
 */
export function approvalFields(access: Role | boolean, status: PayStatus, existing?: Partial<ApprovalFields>): ApprovalFields {
  if (needsApproval(access, status)) return { approval: 'pending', approvedBy: undefined, approvedAt: undefined, rejectReason: undefined }
  return {
    approval: existing?.approval,
    approvedBy: existing?.approvedBy,
    approvedAt: existing?.approvedAt,
    rejectReason: existing?.rejectReason,
  }
}
