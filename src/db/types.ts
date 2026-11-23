// Data model for stage 1 (local-first). Every row has a uuid and timestamps so it can be
// synced to a backend later without changing the shape.
export type Lang = 'en' | 'ur'
export type Role = 'investor' | 'builder'

export type Category = 'material' | 'labour' | 'machinery' | 'fees' | 'misc'
export type MiscType =
  | 'utilities'
  | 'meals'
  | 'carriage'
  | 'rent'
  | 'tools'
  | 'cleaning'
  | 'fees'
  | 'unplanned'
  | 'other'
export type PayStatus = 'paid' | 'planned' | 'advance' | 'skipped'
export type PayMode = 'cash' | 'bank'
export type VendorRole =
  | 'builder'
  | 'foreman'
  | 'carpenter'
  | 'painter'
  | 'plumber'
  | 'electrician'
  | 'tiler'
  | 'welder'
  | 'ceiling'
  | 'supplier'
  | 'machinery'
  | 'other'

export const CATEGORIES: Category[] = ['material', 'labour', 'machinery', 'fees', 'misc']
export const MISC_TYPES: MiscType[] = [
  'utilities',
  'meals',
  'carriage',
  'rent',
  'tools',
  'cleaning',
  'fees',
  'unplanned',
  'other',
]
export const VENDOR_ROLES: VendorRole[] = [
  'builder',
  'foreman',
  'carpenter',
  'painter',
  'plumber',
  'electrician',
  'tiler',
  'welder',
  'ceiling',
  'supplier',
  'machinery',
  'other',
]

interface Stamped {
  id: string
  createdAt: number
  updatedAt: number
  /** Soft delete, so a removal can be synced to the other phone. */
  deletedAt?: number
  /** 1 while the row has local changes the server has not received yet. */
  dirty?: number
}

/** How the builder's fee is worked out. 'tbd' means it is decided at the end. */
export type FeeBasis = 'tbd' | 'fixed' | 'percent' | 'perPhase' | 'retainer'

/** Per-phase fee: a fixed amount (earned when the phase is complete) or a percentage of the phase's cost. */
export type PhaseFeeKind = 'fixed' | 'percent'

export interface Project extends Stamped {
  name: string
  feeBasis?: FeeBasis
  /** Fixed fee in rupees (basis 'fixed'). */
  feeAmount?: number
  /** Percentage of the construction cost (basis 'percent'). */
  feePercent?: number
  /** Monthly retainer in rupees (basis 'retainer'). */
  retainerAmount?: number
  /** First day of the retainer; every month that has started counts in full. */
  retainerStart?: string
  /** Last day of the retainer (optional); without it the retainer runs to today. */
  retainerEnd?: string
  location: string
  ownerId?: string
  thumbnail?: Blob
  thumbnailPath?: string
  plotSize?: string
  coveredArea?: number
  floors?: number
  startDate?: string
  targetFinish?: string
  /** The construction budget: what is planned for building. The plot is not in it (see plotCost). */
  budget?: number
  /** What the plot cost, kept apart from the construction budget. null clears a cost that was synced before. */
  plotCost?: number | null
  currency: 'PKR'
  type: 'house' | 'benchmark'
}

export interface Phase extends Stamped {
  projectId: string
  /** Template key, so the name follows the app language until the user renames it. */
  key?: string
  /** Custom name; when empty the translated template name is shown. */
  name?: string
  order: number
  budget?: number
  /** For the 'perPhase' fee: how this phase's fee is worked out. null means a fee was removed. */
  feeKind?: PhaseFeeKind | null
  /** Rupees (fixed) or percent (percent). */
  feeValue?: number | null
  /** The phase is finished. A fixed per-phase fee is earned only once it is. */
  done?: boolean
}

export interface Vendor extends Stamped {
  projectId: string
  name: string
  role: VendorRole
  phone?: string
  bankAccount?: string
  /** The vendor's bank. null clears a name that was synced before. */
  bankName?: string | null
  notes?: string
}

export type Approval = 'pending' | 'approved' | 'rejected'

export interface Payment extends Stamped {
  projectId: string
  date: string // YYYY-MM-DD
  amount: number // whole rupees
  vendorId?: string
  payeeName?: string
  phaseId?: string
  category: Category
  miscType?: MiscType
  purpose: string
  status: PayStatus
  mode: PayMode
  paidBy: Role
  note?: string
  addedBy: string
  /** Set on a payment that a weekly plan created. */
  planId?: string
  /**
   * A paid entry the builder adds waits for the investor ('pending') and does not count in any total until
   * it is 'approved'. Absent on entries the investor adds, which count at once.
   */
  approval?: Approval
  approvedBy?: string
  approvedAt?: number
  rejectReason?: string
  /** The contract this payment counts against. null clears a link that was synced before. */
  contractId?: string | null
  /** For a bank transfer: the bank, the account number or IBAN, and the transfer's reference. null clears a value that was synced before. */
  bankName?: string | null
  bankAccount?: string | null
  bankRef?: string | null
  /** For a purchase of material: how much was bought, and in what unit. The rate is amount divided by quantity. null clears a value synced before. */
  quantity?: number | null
  unit?: MaterialUnit | null
}

/** Money moving between the two people. All but 'return' go from the investor to the builder. */
export type TransferKind = 'advance' | 'topup' | 'reimbursement' | 'return' | 'fee'
export const TRANSFER_KINDS: TransferKind[] = ['advance', 'topup', 'reimbursement', 'return', 'fee']

export interface Transfer extends Stamped {
  projectId: string
  date: string
  amount: number
  kind: TransferKind
  note?: string
}

/** A payment that repeats on a weekday, such as the labour foreman on Thursday. */
export interface PaymentPlan extends Stamped {
  projectId: string
  purpose: string
  amount: number
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number
  vendorId?: string
  phaseId?: string
  category: Category
  mode: PayMode
  paidBy: Role
  startDate: string
  /** The last date for which a payment was created, so none is created twice. */
  generatedThrough?: string
  active: boolean
}

export type MaterialUnit = 'bag' | 'kg' | 'ton' | 'piece' | 'cft' | 'sqft' | 'rft' | 'trip' | 'box' | 'litre' | 'other'
export const MATERIAL_UNITS: MaterialUnit[] = ['bag', 'kg', 'ton', 'piece', 'cft', 'sqft', 'rft', 'trip', 'box', 'litre', 'other']

/**
 * The old Materials list (retired): one purchase of a material. Its quantity and unit now live on the payment (see
 * `foldMaterials` in lib/materials.ts). The table is kept so a backup or an older phone can still be read.
 */
export interface MaterialLine extends Stamped {
  projectId: string
  date: string
  item: string
  quantity: number
  unit: MaterialUnit
  /** Rupees per unit; may have decimals (bricks at 16.5). */
  rate: number
  /** Whole rupees: quantity times rate, rounded. */
  amount: number
  supplier?: string
  phaseId?: string
  /** The payment created from this line, if any. */
  paymentId?: string
  note?: string
}

export interface Attachment extends Stamped {
  projectId: string
  paymentId: string
  /** The photo itself; absent on a device that has not downloaded it yet. */
  blob?: Blob
  /** Storage path once uploaded. */
  path?: string
  name: string
}

export type FileKind = 'document' | 'photo'
export type DocType = 'contract' | 'approval' | 'quotation' | 'drawing' | 'bill' | 'other'
export const DOC_TYPES: DocType[] = ['contract', 'approval', 'quotation', 'drawing', 'bill', 'other']

/** A document (contract, approval, drawing, bill) or a progress photo kept with the project. */
export interface ProjectFile extends Stamped {
  projectId: string
  kind: FileKind
  title: string
  docType?: DocType
  phaseId?: string
  /** The day the document is dated or the photo was taken. */
  date: string
  note?: string
  /** Original file name, used when saving it again. */
  name: string
  mime: string
  size: number
  /** The file itself; absent on a device that has not downloaded it yet. */
  blob?: Blob
  /** Storage path once uploaded. */
  path?: string
}

export const MAX_FILE_BYTES = 15 * 1024 * 1024

export type ContractStatus = 'active' | 'completed' | 'cancelled'
export const CONTRACT_STATUSES: ContractStatus[] = ['active', 'completed', 'cancelled']

/** Extra work (positive) or a deduction (negative) agreed after the contract was made. */
export interface ContractVariation {
  id: string
  title: string
  /** Whole rupees; negative for a deduction. */
  amount: number
  date: string
}

/** What was agreed with one vendor or contractor for a piece of work. Payments are linked to it. */
export interface Contract extends Stamped {
  projectId: string
  title: string
  vendorId?: string
  phaseId?: string
  /** The amount first agreed, in whole rupees. Variations change the total. */
  amount: number
  date: string
  status: ContractStatus
  note?: string
  variations: ContractVariation[]
}

/** Synced tables whose edits can be replaced by a newer edit made on another phone. */
export type ConflictTable = 'projects' | 'phases' | 'vendors' | 'contracts' | 'plans' | 'payments' | 'transfers' | 'materials' | 'files'

/**
 * An edit of this device that the server refused because a newer edit of the same row was already there.
 * Kept only on this device (never synced) so the person can see it and put it back.
 */
export interface Conflict {
  /** `${table}:${rowId}`, so one row has at most one open notice. */
  id: string
  table: ConflictTable
  rowId: string
  projectId?: string
  /** This device's version of the row, without photos or files. */
  mine: Record<string, unknown>
  /** When the replacement was noticed. */
  at: number
}

export interface SettingRow {
  key: string
  value: unknown
}

export interface Settings {
  language: Lang
  userName: string
  role: Role
  currentProjectId?: string
  /** How dates, times, numbers and money are written on this device (see lib/region.ts). Missing values use the defaults. */
  region?: Partial<import('../lib/region').Region>
}
