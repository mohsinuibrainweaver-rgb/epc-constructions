import type { Payment, Role } from '../db/types'

/**
 * What only an investor may do in a project. Everything else (adding payments, vendors, materials, files and weekly payments,
 * marking a phase done) is open to both. supabase/schema.sql holds the same rules on the server (role_guard); the app uses
 * these to leave out the buttons a builder could not use, so a refused write is the exception and not the way he finds out.
 */
export type Action =
  /** Approve or reject the builder's entries. */
  | 'approve'
  /** Change the project's name, budget, dates or photo. */
  | 'editProject'
  | 'deleteProject'
  /** Add, rename, reorder or remove phases, and set their budgets and fees. */
  | 'editPhases'
  | 'editContracts'
  /** Advances, top-ups, returned money and fee payments between investor and builder. */
  | 'editTransfers'
  /** How the builder's fee is worked out. */
  | 'editFee'
  /** Invite people, change their role, remove them. */
  | 'managePeople'

export const can = (role: Role, _action: Action): boolean => role === 'investor'

/**
 * Whether this person may change or delete this payment. An investor may change any. A builder may change a planned entry and
 * his own paid entries that are still waiting or were turned down; not one that is approved, and not a paid entry the investor
 * made himself (it never went through approval).
 */
export function canChangePayment(role: Role, p: Pick<Payment, 'status' | 'approval'>): boolean {
  if (role === 'investor') return true
  const paid = p.status === 'paid' || p.status === 'advance'
  return !paid || p.approval === 'pending' || p.approval === 'rejected'
}
