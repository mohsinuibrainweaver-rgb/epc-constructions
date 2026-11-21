import type { Table } from 'dexie'
import { db } from '../db/db'
import type { Attachment, Contract, ProjectFile, Payment, PaymentPlan, Phase, Project, Transfer, Vendor } from '../db/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

const nul = <T>(v: T | undefined): T | null => (v === undefined ? null : v)
const und = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v)

export interface TableDef {
  name: 'projects' | 'phases' | 'vendors' | 'contracts' | 'plans' | 'payments' | 'transfers' | 'files' | 'attachments'
  /** The server table name when it differs from the local one. */
  remote?: string
  /** Added after the first release: a server without the newer schema must not break the rest of the sync. */
  optional?: boolean
  table: Table<any, string>
  /** Newer columns that cannot be NULL on the server, with their default (see fillDefaults in payload.ts). */
  defaults?: Row
  toRemote: (l: any, userId: string) => Row
  fromRemote: (r: Row) => any
}

const stamps = (l: { createdAt: number; updatedAt: number; deletedAt?: number }): Row => ({
  created_at: l.createdAt,
  updated_at: l.updatedAt,
  deleted_at: nul(l.deletedAt),
})

const fromStamps = (r: Row) => ({
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
  deletedAt: r.deleted_at === null ? undefined : Number(r.deleted_at),
  dirty: 0,
})

/** Order matters on push: a project must exist on the server before its rows are accepted. */
export const TABLES: TableDef[] = [
  {
    name: 'projects',
    table: db.projects,
    defaults: { fee_basis: 'tbd' },
    toRemote: (p: Project, userId) => ({
      id: p.id,
      owner_id: p.ownerId ?? userId,
      name: p.name,
      location: p.location ?? '',
      plot_size: nul(p.plotSize),
      covered_area: nul(p.coveredArea),
      floors: nul(p.floors),
      start_date: nul(p.startDate),
      target_finish: nul(p.targetFinish),
      budget: nul(p.budget),
      currency: p.currency,
      type: p.type,
      thumbnail_path: nul(p.thumbnailPath),
      // Fee columns exist only in the newer schema, so they are sent only once a fee was set.
      ...(p.feeBasis !== undefined
        ? { fee_basis: p.feeBasis, fee_amount: nul(p.feeAmount), fee_percent: nul(p.feePercent) }
        : {}),
      ...(p.retainerAmount !== undefined
        ? { retainer_amount: p.retainerAmount, retainer_start: nul(p.retainerStart), retainer_end: nul(p.retainerEnd) }
        : {}),
      ...stamps(p),
    }),
    fromRemote: (r): Project => ({
      id: r.id,
      ownerId: r.owner_id,
      name: r.name,
      location: r.location ?? '',
      plotSize: und(r.plot_size),
      coveredArea: und(r.covered_area),
      floors: und(r.floors),
      startDate: und(r.start_date),
      targetFinish: und(r.target_finish),
      budget: und(r.budget === null ? null : Number(r.budget)),
      currency: r.currency,
      type: r.type,
      thumbnailPath: und(r.thumbnail_path),
      feeBasis: und(r.fee_basis),
      feeAmount: und(r.fee_amount === null ? null : r.fee_amount === undefined ? undefined : Number(r.fee_amount)),
      feePercent: und(r.fee_percent === null ? null : r.fee_percent === undefined ? undefined : Number(r.fee_percent)),
      retainerAmount: r.retainer_amount === null || r.retainer_amount === undefined ? undefined : Number(r.retainer_amount),
      retainerStart: und(r.retainer_start),
      retainerEnd: und(r.retainer_end),
      ...fromStamps(r),
    }),
  },
  {
    name: 'phases',
    table: db.phases,
    defaults: { done: false },
    toRemote: (p: Phase) => ({
      id: p.id,
      project_id: p.projectId,
      key: nul(p.key),
      name: nul(p.name),
      sort_order: p.order,
      budget: nul(p.budget),
      // Sent only once a fee or completion was set, so a server without these columns keeps syncing.
      ...(p.feeKind !== undefined || p.feeValue !== undefined || p.done !== undefined
        ? { fee_kind: nul(p.feeKind), fee_value: nul(p.feeValue), done: p.done ?? false }
        : {}),
      ...stamps(p),
    }),
    fromRemote: (r): Phase => ({
      id: r.id,
      projectId: r.project_id,
      key: und(r.key),
      name: und(r.name),
      order: Number(r.sort_order),
      budget: und(r.budget === null ? null : Number(r.budget)),
      feeKind: r.fee_kind === undefined ? undefined : r.fee_kind,
      feeValue: r.fee_value === undefined ? undefined : r.fee_value === null ? null : Number(r.fee_value),
      done: r.done === true ? true : r.done === false ? false : undefined,
      ...fromStamps(r),
    }),
  },
  {
    name: 'vendors',
    table: db.vendors,
    toRemote: (v: Vendor) => ({
      id: v.id,
      project_id: v.projectId,
      name: v.name,
      role: v.role,
      phone: nul(v.phone),
      bank_account: nul(v.bankAccount),
      // undefined: never set (column not sent, so a server without it keeps syncing); null: the name was removed.
      ...(v.bankName !== undefined ? { bank_name: v.bankName } : {}),
      notes: nul(v.notes),
      ...stamps(v),
    }),
    fromRemote: (r): Vendor => ({
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      role: r.role,
      phone: und(r.phone),
      bankAccount: und(r.bank_account),
      bankName: und(r.bank_name),
      notes: und(r.notes),
      ...fromStamps(r),
    }),
  },
  {
    name: 'contracts',
    optional: true,
    table: db.contracts,
    toRemote: (c: Contract) => ({
      id: c.id,
      project_id: c.projectId,
      title: c.title,
      vendor_id: nul(c.vendorId),
      phase_id: nul(c.phaseId),
      amount: c.amount,
      date: c.date,
      status: c.status,
      note: nul(c.note),
      variations: c.variations ?? [],
      ...stamps(c),
    }),
    fromRemote: (r): Contract => ({
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      vendorId: und(r.vendor_id),
      phaseId: und(r.phase_id),
      amount: Number(r.amount),
      date: r.date,
      status: r.status,
      note: und(r.note),
      variations: Array.isArray(r.variations) ? r.variations : [],
      ...fromStamps(r),
    }),
  },
  {
    name: 'plans',
    remote: 'payment_plans',
    optional: true,
    table: db.plans,
    toRemote: (p: PaymentPlan) => ({
      id: p.id,
      project_id: p.projectId,
      vendor_id: nul(p.vendorId),
      phase_id: nul(p.phaseId),
      purpose: p.purpose,
      amount: p.amount,
      weekday: p.weekday,
      category: p.category,
      mode: p.mode,
      paid_by: p.paidBy,
      start_date: p.startDate,
      generated_through: nul(p.generatedThrough),
      active: p.active,
      ...stamps(p),
    }),
    fromRemote: (r): PaymentPlan => ({
      id: r.id,
      projectId: r.project_id,
      vendorId: und(r.vendor_id),
      phaseId: und(r.phase_id),
      purpose: r.purpose,
      amount: Number(r.amount),
      weekday: Number(r.weekday),
      category: r.category,
      mode: r.mode,
      paidBy: r.paid_by,
      startDate: r.start_date,
      generatedThrough: und(r.generated_through),
      active: Boolean(r.active),
      ...fromStamps(r),
    }),
  },
  {
    name: 'payments',
    table: db.payments,
    toRemote: (p: Payment) => ({
      id: p.id,
      project_id: p.projectId,
      date: p.date,
      amount: p.amount,
      vendor_id: nul(p.vendorId),
      payee_name: nul(p.payeeName),
      phase_id: nul(p.phaseId),
      category: p.category,
      misc_type: nul(p.miscType),
      purpose: p.purpose,
      status: p.status,
      mode: p.mode,
      paid_by: p.paidBy,
      note: nul(p.note),
      added_by: nul(p.addedBy),
      ...(p.planId ? { plan_id: p.planId } : {}),
      // undefined: never linked (column not sent); null: the link was removed.
      ...(p.contractId !== undefined ? { contract_id: p.contractId } : {}),
      // Bank details of a transfer: sent only once any was set (null: it was removed), so an older server keeps syncing.
      ...(p.bankName !== undefined || p.bankAccount !== undefined || p.bankRef !== undefined
        ? { bank_name: nul(p.bankName), bank_account: nul(p.bankAccount), bank_ref: nul(p.bankRef) }
        : {}),
      // How much was bought (a material purchase): sent only once set (null: it was removed), so an older server keeps syncing.
      ...(p.quantity !== undefined || p.unit !== undefined ? { quantity: nul(p.quantity), unit: nul(p.unit) } : {}),
      // Sent only once an entry has been through approval, so a server without these columns keeps syncing.
      ...(p.approval
        ? { approval: p.approval, approved_by: nul(p.approvedBy), approved_at: nul(p.approvedAt), reject_reason: nul(p.rejectReason) }
        : {}),
      ...stamps(p),
    }),
    fromRemote: (r): Payment => ({
      id: r.id,
      projectId: r.project_id,
      date: r.date,
      amount: Number(r.amount),
      vendorId: und(r.vendor_id),
      payeeName: und(r.payee_name),
      phaseId: und(r.phase_id),
      category: r.category,
      miscType: und(r.misc_type),
      purpose: r.purpose,
      status: r.status,
      mode: r.mode,
      paidBy: r.paid_by,
      note: und(r.note),
      addedBy: r.added_by ?? '',
      planId: und(r.plan_id),
      contractId: und(r.contract_id),
      bankName: und(r.bank_name),
      bankAccount: und(r.bank_account),
      bankRef: und(r.bank_ref),
      quantity: r.quantity === null || r.quantity === undefined ? undefined : Number(r.quantity),
      unit: und(r.unit),
      approval: und(r.approval),
      approvedBy: und(r.approved_by),
      approvedAt: r.approved_at === null || r.approved_at === undefined ? undefined : Number(r.approved_at),
      rejectReason: und(r.reject_reason),
      ...fromStamps(r),
    }),
  },
  {
    name: 'transfers',
    optional: true,
    table: db.transfers,
    toRemote: (t: Transfer) => ({
      id: t.id,
      project_id: t.projectId,
      date: t.date,
      amount: t.amount,
      kind: t.kind,
      note: nul(t.note),
      ...stamps(t),
    }),
    fromRemote: (r): Transfer => ({
      id: r.id,
      projectId: r.project_id,
      date: r.date,
      amount: Number(r.amount),
      kind: r.kind,
      note: und(r.note),
      ...fromStamps(r),
    }),
  },
  {
    name: 'files',
    remote: 'project_files',
    optional: true,
    table: db.files,
    toRemote: (f: ProjectFile) => ({
      id: f.id,
      project_id: f.projectId,
      kind: f.kind,
      title: f.title,
      doc_type: nul(f.docType),
      phase_id: nul(f.phaseId),
      date: f.date,
      note: nul(f.note),
      name: f.name,
      mime: f.mime,
      size: f.size,
      path: nul(f.path),
      ...stamps(f),
    }),
    fromRemote: (r): ProjectFile => ({
      id: r.id,
      projectId: r.project_id,
      kind: r.kind,
      title: r.title,
      docType: und(r.doc_type),
      phaseId: und(r.phase_id),
      date: r.date,
      note: und(r.note),
      name: r.name ?? '',
      mime: r.mime ?? '',
      size: Number(r.size ?? 0),
      path: und(r.path),
      ...fromStamps(r),
    }),
  },
  {
    name: 'attachments',
    table: db.attachments,
    toRemote: (a: Attachment) => ({
      id: a.id,
      project_id: a.projectId,
      payment_id: a.paymentId,
      name: nul(a.name),
      path: nul(a.path),
      ...stamps(a),
    }),
    fromRemote: (r): Attachment => ({
      id: r.id,
      projectId: r.project_id,
      paymentId: r.payment_id,
      name: r.name ?? '',
      path: und(r.path),
      ...fromStamps(r),
    }),
  },
]
