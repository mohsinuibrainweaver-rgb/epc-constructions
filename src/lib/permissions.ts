import type { Payment, Role } from '../db/types'

/**
 * What only an investor may do in a project. Everything else (adding payments, vendors, materials, files and weekly payments,
 * marking a phase done) is open to both. supabase/schema.sql holds the same rules on the server (role_guard); the app uses
 * these to leave out the buttons a builder could not use, so a refused write is the exception and not the way he finds out.
 */
export type Action =
  | 'addPayments'
  | 'editPayments'
  | 'deletePayments'
  | 'approvePayments'
  | 'viewBankDetails'
  | 'manageVendors'
  /** Change the project's name, budget, dates or photo. */
  | 'editProject'
  | 'deleteProject'
  /** Add, rename, reorder or remove phases, and set their budgets and fees. */
  | 'editPhases'
  | 'completePhases'
  | 'editContracts'
  /** Advances, top-ups, returned money and fee payments between investor and builder. */
  | 'editTransfers'
  /** How the builder's fee is worked out. */
  | 'editFee'
  | 'managePlans'
  | 'manageFiles'
  /** Invite people, change their permissions, remove them. */
  | 'managePeople'

export interface PermissionDefinition {
  key: Action
  group: 'payments' | 'project' | 'money' | 'people'
  label: string
  description: string
}

/** Stable keys shared by the UI and supabase/schema.sql. Never rename a key after release. */
export const PERMISSIONS: PermissionDefinition[] = [
  { key: 'addPayments', group: 'payments', label: 'Add payments', description: 'Create paid, planned and advance entries.' },
  { key: 'editPayments', group: 'payments', label: 'Edit payments', description: 'Change payment entries this person is allowed to change.' },
  { key: 'deletePayments', group: 'payments', label: 'Delete payments', description: 'Move payment entries to the bin.' },
  { key: 'approvePayments', group: 'payments', label: 'Approve payments', description: 'Approve or reject entries waiting for review.' },
  { key: 'viewBankDetails', group: 'payments', label: 'View bank details', description: 'See account numbers, IBANs and bank references.' },
  { key: 'manageVendors', group: 'people', label: 'Manage vendors', description: 'Add and edit vendors and suppliers.' },
  { key: 'editProject', group: 'project', label: 'Edit project', description: 'Change project details, budget, dates and photo.' },
  { key: 'deleteProject', group: 'project', label: 'Delete project', description: 'Delete this project and its local records.' },
  { key: 'editPhases', group: 'project', label: 'Manage phases', description: 'Add, rename, reorder and delete phases.' },
  { key: 'completePhases', group: 'project', label: 'Complete phases', description: 'Mark phases complete or reopen them.' },
  { key: 'editContracts', group: 'money', label: 'Manage contracts', description: 'Add, edit and delete contracts and variations.' },
  { key: 'editTransfers', group: 'money', label: 'Manage transfers', description: 'Record advances, reimbursements, returns and fees.' },
  { key: 'editFee', group: 'money', label: 'Set project fee', description: 'Change how the project fee is calculated.' },
  { key: 'managePlans', group: 'money', label: 'Manage payment plans', description: 'Add, edit, pause and delete recurring payments.' },
  { key: 'manageFiles', group: 'project', label: 'Manage files', description: 'Upload, edit and remove project files and receipts.' },
  { key: 'managePeople', group: 'people', label: 'Manage people', description: 'Invite members, change permissions and remove members.' },
]

export type PermissionMap = Partial<Record<Action, boolean>>

/** Defaults reproduce the access rules that existed before configurable permissions. */
export const DEFAULT_PERMISSIONS: Record<Role, Record<Action, boolean>> = {
  investor: Object.fromEntries(PERMISSIONS.map((p) => [p.key, true])) as Record<Action, boolean>,
  builder: {
    addPayments: true, editPayments: true, deletePayments: true, approvePayments: false,
    viewBankDetails: false, manageVendors: true, editProject: false, deleteProject: false,
    editPhases: false, completePhases: true, editContracts: false, editTransfers: false,
    editFee: false, managePlans: true, manageFiles: true, managePeople: false,
  },
}

export const EMPTY_PERMISSIONS = Object.fromEntries(PERMISSIONS.map((p) => [p.key, false])) as Record<Action, boolean>
export const FULL_PERMISSIONS = Object.fromEntries(PERMISSIONS.map((p) => [p.key, true])) as Record<Action, boolean>

/** Permissions now belong to one project member. Missing keys are denied; the project owner bypasses this map. */
export const permissionValue = (_role: Role, action: Action, overrides?: PermissionMap): boolean => overrides?.[action] === true

export const can = (role: Role, action: Action, overrides?: PermissionMap, owner = false): boolean =>
  owner || permissionValue(role, action, overrides)

/**
 * Whether this person may change or delete this payment. An investor may change any. A builder may change a planned entry and
 * his own paid entries that are still waiting or were turned down; not one that is approved, and not a paid entry the investor
 * made himself (it never went through approval).
 */
export function canChangePayment(role: Role, p: Pick<Payment, 'status' | 'approval'>, allowed = true): boolean {
  if (!allowed) return false
  if (role === 'investor') return true
  const paid = p.status === 'paid' || p.status === 'advance'
  return !paid || p.approval === 'pending' || p.approval === 'rejected'
}
