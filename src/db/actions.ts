import { db, now, uid } from './db'
import type { Attachment, Category, Contract, ContractVariation, FeeBasis, PhaseFeeKind, PayMode, Payment, ProjectFile, PaymentPlan, Phase, Project, Settings, Transfer, Vendor } from './types'
import { cleanFileName, extForMime, isAudioName, isDocumentName, isVideoType } from '../lib/media'
import { addDays, todayISO } from '../lib/format'
import { approvalFields } from '../lib/approval'
import { foldMaterials } from '../lib/materials'
import { deterministicId, planDueDates } from '../lib/plans'

export const PHASE_KEYS = [
  'planning',
  'site',
  'foundation',
  'grey',
  'services',
  'windows',
  'ceiling',
  'flooring',
  'woodwork',
  'paint',
  'finishing',
  'handover',
] as const

const BIN_DAYS = 30

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  userName: '',
  role: 'investor',
}

export async function setSetting(key: keyof Settings, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

/* Projects */

export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'currency' | 'type'>

/** The phases a new project starts with: the standard twelve, none, or a copy of another project's phase names and order (not its budgets, fees or progress). */
export type PhaseTemplate = 'standard' | 'blank' | { copyFrom: string }

export async function createProject(input: ProjectInput, template: PhaseTemplate): Promise<string> {
  const id = uid()
  const t = now()
  await db.transaction('rw', db.projects, db.phases, db.settings, async () => {
    const accountId = (await db.settings.get('account.userId'))?.value as string | undefined
    await db.projects.add({ ...input, ownerId: input.ownerId ?? accountId, id, currency: 'PKR', type: 'house', createdAt: t, updatedAt: t })
    if (template === 'standard') {
      const phases: Phase[] = PHASE_KEYS.map((key, i) => ({
        id: uid(),
        projectId: id,
        key,
        order: i,
        createdAt: t,
        updatedAt: t,
      }))
      await db.phases.bulkAdd(phases)
    } else if (typeof template === 'object') {
      // The same names (a standard phase keeps following the app language) in the same order; every phase starts fresh.
      const source = (await db.phases.where('projectId').equals(template.copyFrom).toArray()).filter((p) => !p.deletedAt).sort((a, b) => a.order - b.order)
      const phases: Phase[] = source.map((p, i) => ({
        id: uid(),
        projectId: id,
        ...(p.key ? { key: p.key } : {}),
        ...(p.name ? { name: p.name } : {}),
        order: i,
        createdAt: t,
        updatedAt: t,
      }))
      if (phases.length) await db.phases.bulkAdd(phases)
    }
    await db.settings.put({ key: 'currentProjectId', value: id })
  })
  return id
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  await db.projects.update(id, { ...patch, updatedAt: now() })
}

/** Soft delete, so the removal reaches the other phone too. */
export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.settings], async () => {
    await db.projects.update(id, { deletedAt: now() })
    // Only when the open project is the one deleted does another one open; deleting any other leaves the open one alone.
    if ((await db.settings.get('currentProjectId'))?.value !== id) return
    const rest = (await db.projects.orderBy('updatedAt').reverse().toArray()).filter((p) => !p.deletedAt && p.id !== id)
    await db.settings.put({ key: 'currentProjectId', value: rest[0]?.id })
  })
}

/* Phases */

export async function addPhase(projectId: string, name: string, budget?: number): Promise<string> {
  const count = (await db.phases.where('projectId').equals(projectId).toArray()).filter((p) => !p.deletedAt).length
  const id = uid()
  const t = now()
  await db.phases.add({ id, projectId, name, order: count, budget, createdAt: t, updatedAt: t })
  return id
}

export async function updatePhase(id: string, patch: Partial<Phase>): Promise<void> {
  await db.phases.update(id, { ...patch, updatedAt: now() })
}

export async function movePhase(projectId: string, id: string, dir: -1 | 1): Promise<void> {
  const list = (await db.phases.where('projectId').equals(projectId).sortBy('order')).filter((p) => !p.deletedAt)
  const i = list.findIndex((p) => p.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  const a = list[i]
  const b = list[j]
  await db.transaction('rw', db.phases, async () => {
    await db.phases.update(a.id, { order: b.order, updatedAt: now() })
    await db.phases.update(b.id, { order: a.order, updatedAt: now() })
  })
}

/** Save a new phase order (the full list of ids, top to bottom). Only phases whose place changed are touched, so sync stays small. */
export async function reorderPhases(projectId: string, orderedIds: string[]): Promise<void> {
  const list = (await db.phases.where('projectId').equals(projectId).toArray()).filter((p) => !p.deletedAt)
  const byId = new Map(list.map((p) => [p.id, p]))
  await db.transaction('rw', db.phases, async () => {
    for (const [index, id] of orderedIds.entries()) {
      const ph = byId.get(id)
      if (ph && ph.order !== index) await db.phases.update(id, { order: index, updatedAt: now() })
    }
  })
}

export async function deletePhase(id: string): Promise<void> {
  await db.transaction('rw', db.phases, db.payments, async () => {
    await db.payments.where('phaseId').equals(id).modify({ phaseId: undefined, updatedAt: now() })
    await db.phases.update(id, { deletedAt: now() })
  })
}

/* Vendors */

export async function saveVendor(v: Partial<Vendor> & Pick<Vendor, 'name' | 'role' | 'projectId'>): Promise<string> {
  const t = now()
  if (v.id) {
    await db.vendors.update(v.id, { ...v, updatedAt: t })
    return v.id
  }
  const id = uid()
  await db.vendors.add({ ...v, id, createdAt: t, updatedAt: t })
  return id
}

/* Payments */

export type PaymentInput = Omit<Payment, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & { id?: string }

/** The name a document or voice note was chosen with, cleaned; undefined for a photo or video (a File with a known document or sound extension). */
function documentName(blob: Blob): string | undefined {
  const name = blob instanceof File ? blob.name : ''
  return name && (isDocumentName(name) || isAudioName(name)) ? cleanFileName(name) : undefined
}

export async function savePayment(
  input: PaymentInput,
  newFiles: Blob[],
  removeAttachmentIds: string[],
): Promise<string> {
  const t = now()
  const id = input.id ?? uid()
  await db.transaction('rw', db.payments, db.attachments, async () => {
    if (input.id) {
      await db.payments.update(id, { ...input, updatedAt: t })
    } else {
      await db.payments.add({ ...input, id, createdAt: t, updatedAt: t })
    }
    if (removeAttachmentIds.length) {
      await db.attachments.where('id').anyOf(removeAttachmentIds).modify({ deletedAt: t })
    }
    if (newFiles.length) {
      const rows: Attachment[] = newFiles.map((blob, i) => ({
        id: uid(),
        paymentId: id,
        projectId: input.projectId,
        blob,
        // A document keeps the name it came with ("Invoice 114.pdf"); a photo or video gets a plain generated one.
        name: documentName(blob) ?? `${isVideoType(blob.type) ? 'video' : 'receipt'}-${t}-${i + 1}.${extForMime(blob.type)}`,
        createdAt: t,
        updatedAt: t,
      }))
      await db.attachments.bulkAdd(rows)
    }
  })
  return id
}

/** A planned payment becomes Paid. When the builder does it, it waits for the investor like any other builder entry. */
export async function markPaid(id: string, canApprove?: boolean): Promise<void> {
  const p = await db.payments.get(id)
  await db.payments.update(id, {
    status: 'paid',
    ...(canApprove !== undefined && p ? approvalFields(canApprove, 'paid', p) : {}),
    updatedAt: now(),
  })
}

/* Approval of the builder's entries (done by the investor) */

export async function approvePayment(id: string, by: string): Promise<void> {
  const t = now()
  await db.payments.update(id, { approval: 'approved', approvedBy: by, approvedAt: t, rejectReason: undefined, updatedAt: t })
}

export async function approvePayments(ids: string[], by: string): Promise<void> {
  const t = now()
  await db.transaction('rw', db.payments, async () => {
    for (const id of ids) await db.payments.update(id, { approval: 'approved', approvedBy: by, approvedAt: t, rejectReason: undefined, updatedAt: t })
  })
}

export async function rejectPayment(id: string, by: string, reason: string): Promise<void> {
  const t = now()
  await db.payments.update(id, { approval: 'rejected', approvedBy: by, approvedAt: t, rejectReason: reason.trim() || undefined, updatedAt: t })
}

export async function binPayment(id: string): Promise<void> {
  await db.payments.update(id, { deletedAt: now(), updatedAt: now() })
}

export async function restorePayment(id: string): Promise<void> {
  await db.payments.update(id, { deletedAt: undefined, updatedAt: now() })
}

/** Removes payments that have been in the bin for more than 30 days. */
export async function purgeBin(): Promise<void> {
  const cutoff = now() - BIN_DAYS * 24 * 60 * 60 * 1000
  const old = await db.payments.where('deletedAt').below(cutoff).primaryKeys()
  if (!old.length) return
  await db.transaction('rw', db.payments, db.attachments, async () => {
    await db.attachments.where('paymentId').anyOf(old).delete()
    await db.payments.bulkDelete(old)
  })
}

/* Backup */

const toDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

export async function exportBackup(): Promise<string> {
  const [projects, phases, vendors, payments, attachments, settings, transfers, plans, materials, files, contracts] = await Promise.all([
    db.projects.toArray(),
    db.phases.toArray(),
    db.vendors.toArray(),
    db.payments.toArray(),
    db.attachments.toArray(),
    db.settings.toArray(),
    db.transfers.toArray(),
    db.plans.toArray(),
    db.materials.toArray(),
    db.files.toArray(),
    db.contracts.toArray(),
  ])
  const projectsOut = await Promise.all(
    projects.map(async (p) => ({ ...p, thumbnail: p.thumbnail ? await toDataUrl(p.thumbnail) : undefined })),
  )
  const attachmentsOut = await Promise.all(
    attachments.map(async (a) => ({ ...a, blob: a.blob ? await toDataUrl(a.blob) : undefined })),
  )
  const filesOut = await Promise.all(files.map(async (f) => ({ ...f, blob: f.blob ? await toDataUrl(f.blob) : undefined })))
  return JSON.stringify({
    app: 'epc-construction',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: projectsOut,
    phases,
    vendors,
    payments,
    attachments: attachmentsOut,
    transfers,
    plans,
    materials,
    files: filesOut,
    contracts,
    settings,
  })
}

const fromDataUrl = async (url: string): Promise<Blob> => (await fetch(url)).blob()

export async function importBackup(text: string): Promise<void> {
  const data = JSON.parse(text)
  if (data?.app !== 'epc-construction' || !Array.isArray(data.projects)) throw new Error('invalid')
  const projects: Project[] = await Promise.all(
    data.projects.map(async (p: Project & { thumbnail?: string }) => ({
      ...p,
      thumbnail: p.thumbnail ? await fromDataUrl(p.thumbnail) : undefined,
    })),
  )
  const attachments: Attachment[] = await Promise.all(
    (data.attachments ?? []).map(async (a: Attachment & { blob?: string }) => ({
      ...a,
      blob: a.blob ? await fromDataUrl(a.blob) : undefined,
    })),
  )
  const files: ProjectFile[] = await Promise.all(
    (data.files ?? []).map(async (f: ProjectFile & { blob?: string }) => ({ ...f, blob: f.blob ? await fromDataUrl(f.blob) : undefined })),
  )
  // A backup made before material purchases moved onto payments still has the old list: fold it in, as the upgrade does.
  const payments: Payment[] = data.payments ?? []
  const folds = foldMaterials(data.materials ?? [], payments)
  const paymentsIn = payments.map((p) => {
    const f = folds.get(p.id)
    return f ? { ...p, quantity: f.quantity, unit: f.unit } : p
  })
  await db.transaction('rw', [db.projects, db.phases, db.vendors, db.payments, db.attachments, db.settings, db.transfers, db.plans, db.materials, db.files, db.contracts], async () => {
    await Promise.all([
      db.transfers.clear(),
      db.plans.clear(),
      db.materials.clear(),
      db.files.clear(),
      db.contracts.clear(),
      db.projects.clear(),
      db.phases.clear(),
      db.vendors.clear(),
      db.payments.clear(),
      db.attachments.clear(),
      db.settings.clear(),
    ])
    await db.projects.bulkAdd(projects)
    await db.phases.bulkAdd(data.phases ?? [])
    await db.vendors.bulkAdd(data.vendors ?? [])
    await db.payments.bulkAdd(paymentsIn)
    await db.attachments.bulkAdd(attachments)
    await db.transfers.bulkAdd(data.transfers ?? [])
    await db.plans.bulkAdd(data.plans ?? [])
    await db.materials.bulkAdd(data.materials ?? [])
    await db.files.bulkAdd(files)
    await db.contracts.bulkAdd(data.contracts ?? [])
    await db.settings.bulkAdd(data.settings ?? [])
  })
}

/* Money: transfers between the investor and the builder */

export type TransferInput = Omit<Transfer, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'dirty'> & { id?: string }

export async function saveTransfer(input: TransferInput): Promise<string> {
  const t = now()
  if (input.id) {
    await db.transfers.update(input.id, { ...input, updatedAt: t })
    return input.id
  }
  const id = uid()
  await db.transfers.add({ ...input, id, createdAt: t, updatedAt: t })
  return id
}

export async function deleteTransfer(id: string): Promise<void> {
  await db.transfers.update(id, { deletedAt: now() })
}

export async function restoreTransfer(id: string): Promise<void> {
  await db.transfers.update(id, { deletedAt: undefined })
}

/* Money: the builder's fee agreement lives on the project */

export interface FeeInput {
  basis: FeeBasis
  amount?: number
  percent?: number
  /** Monthly retainer (basis 'retainer'). */
  retainer?: { amount?: number; start?: string; end?: string }
  /** Per-phase fees (basis 'perPhase'): kind undefined means no fee for that phase. */
  phases?: { id: string; kind?: PhaseFeeKind; value?: number }[]
}

export async function saveFee(projectId: string, fee: FeeInput): Promise<void> {
  await db.transaction('rw', db.projects, db.phases, async () => {
    const t = now()
    await db.projects.update(projectId, {
      feeBasis: fee.basis,
      feeAmount: fee.basis === 'fixed' ? fee.amount : undefined,
      feePercent: fee.basis === 'percent' ? fee.percent : undefined,
      // The retainer and phase fees are kept when another basis is chosen, so switching back restores them.
      ...(fee.basis === 'retainer'
        ? { retainerAmount: fee.retainer?.amount ?? 0, retainerStart: fee.retainer?.start || undefined, retainerEnd: fee.retainer?.end || undefined }
        : {}),
      updatedAt: t,
    })
    if (fee.basis === 'perPhase') {
      for (const f of fee.phases ?? []) {
        const ph = await db.phases.get(f.id)
        if (!ph) continue
        const has = f.kind && f.value
        // null (not undefined) once a fee existed, so removing it also removes it on the server.
        const previously = ph.feeKind !== undefined
        if (has) await db.phases.update(f.id, { feeKind: f.kind, feeValue: f.value, updatedAt: t })
        else if (previously) await db.phases.update(f.id, { feeKind: null, feeValue: null, updatedAt: t })
      }
    }
  })
}

/** Marks a phase complete or open again. A fixed per-phase fee is earned only when it is complete. */
export async function setPhaseDone(id: string, done: boolean): Promise<void> {
  await db.phases.update(id, { done, updatedAt: now() })
}

/* Money: weekly payment plans */

export type PlanInput = Omit<PaymentPlan, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'dirty' | 'generatedThrough'> & { id?: string }

export async function savePlan(input: PlanInput): Promise<string> {
  const t = now()
  if (input.id) {
    // Changing the weekday or start date restarts creation from the new start.
    const old = await db.plans.get(input.id)
    const restart = old && (old.weekday !== input.weekday || old.startDate !== input.startDate)
    await db.plans.update(input.id, { ...input, updatedAt: t, ...(restart ? { generatedThrough: undefined } : {}) })
    return input.id
  }
  const id = uid()
  await db.plans.add({ ...input, id, createdAt: t, updatedAt: t })
  return id
}

export async function deletePlan(id: string): Promise<void> {
  await db.plans.update(id, { deletedAt: now(), active: false })
}

/**
 * Creates the planned payments that active weekly plans are due to create (up to a week ahead).
 * Ids are derived from the plan and the date, so two phones never create two copies.
 */
export async function ensurePlanPayments(projectId: string, today: string = todayISO()): Promise<number> {
  const plans = (await db.plans.where('projectId').equals(projectId).toArray()).filter((p) => p.active && !p.deletedAt)
  let created = 0
  for (const plan of plans) {
    const dates = planDueDates(plan, today)
    if (dates.length === 0) continue
    for (const date of dates) {
      const id = await deterministicId(`${plan.id}:${date}`)
      if (await db.payments.get(id)) continue // already created, paid, skipped or binned: leave it alone
      const t = now()
      await db.payments.add({
        id,
        projectId,
        date,
        amount: plan.amount,
        vendorId: plan.vendorId,
        phaseId: plan.phaseId,
        category: plan.category,
        purpose: plan.purpose,
        status: 'planned',
        mode: plan.mode,
        paidBy: plan.paidBy,
        planId: plan.id,
        addedBy: 'plan',
        createdAt: t,
        updatedAt: t,
      })
      created++
    }
    const last = dates[dates.length - 1]
    if (!plan.generatedThrough || last > plan.generatedThrough) {
      await db.plans.update(plan.id, { generatedThrough: last })
    }
  }
  return created
}

/** Moves a due payment to another day. */
export async function movePayment(id: string, date: string): Promise<void> {
  await db.payments.update(id, { date })
}

/** Skips a due payment, keeping the reason. It stays in the ledger and never counts as spent. */
export async function skipPayment(id: string, reason: string): Promise<void> {
  const p = await db.payments.get(id)
  const note = [p?.note, reason].filter(Boolean).join(' · ')
  await db.payments.update(id, { status: 'skipped', note: note || undefined })
}

/** Puts a skipped payment back to Planned. */
export async function unskipPayment(id: string): Promise<void> {
  await db.payments.update(id, { status: 'planned' })
}

export const nextWeek = (iso: string): string => addDays(iso, 7)

/* Files: documents and progress photos */

export interface FileMeta {
  title: string
  docType?: ProjectFile['docType']
  phaseId?: string
  date: string
  note?: string
}

/** Stores one or more files with the same details. Each file keeps its own name as the title unless one is given. */
export async function addFiles(
  projectId: string,
  kind: ProjectFile['kind'],
  items: { blob: Blob; name: string; title?: string }[],
  meta: Omit<FileMeta, 'title'> & { title?: string },
): Promise<void> {
  const t = now()
  const rows: ProjectFile[] = items.map((it, i) => ({
    id: uid(),
    projectId,
    kind,
    title: (items.length === 1 ? meta.title?.trim() : '') || it.title || it.name.replace(/\.[^.]+$/, ''),
    docType: kind === 'document' ? meta.docType ?? 'other' : undefined,
    phaseId: meta.phaseId || undefined,
    date: meta.date,
    note: meta.note?.trim() || undefined,
    name: it.name,
    mime: it.blob.type || 'application/octet-stream',
    size: it.blob.size,
    blob: it.blob,
    createdAt: t + i,
    updatedAt: t + i,
  }))
  await db.files.bulkAdd(rows)
}

export async function updateFile(id: string, meta: FileMeta): Promise<void> {
  await db.files.update(id, {
    title: meta.title.trim(),
    docType: meta.docType,
    phaseId: meta.phaseId || undefined,
    date: meta.date,
    note: meta.note?.trim() || undefined,
    updatedAt: now(),
  })
}

export async function deleteFile(id: string): Promise<void> {
  const t = now()
  await db.files.update(id, { deletedAt: t, updatedAt: t })
}

export async function restoreFile(id: string): Promise<void> {
  await db.files.update(id, { deletedAt: undefined, updatedAt: now() })
}

/* Contracts: what was agreed with a vendor, and the changes to it */

export type ContractInput = Omit<Contract, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'dirty' | 'variations'> & { id?: string; variations?: ContractVariation[] }

export async function saveContract(input: ContractInput): Promise<string> {
  const t = now()
  if (input.id) {
    const { id, ...rest } = input
    await db.contracts.update(id, { ...rest, title: rest.title.trim(), note: rest.note?.trim() || undefined, updatedAt: t })
    return id
  }
  const id = uid()
  await db.contracts.add({ ...input, id, title: input.title.trim(), note: input.note?.trim() || undefined, variations: input.variations ?? [], createdAt: t, updatedAt: t })
  return id
}

export async function deleteContract(id: string): Promise<void> {
  const t = now()
  await db.contracts.update(id, { deletedAt: t, updatedAt: t })
}

export async function restoreContract(id: string): Promise<void> {
  await db.contracts.update(id, { deletedAt: undefined, updatedAt: now() })
}

export async function saveVariation(contractId: string, v: Omit<ContractVariation, 'id'> & { id?: string }): Promise<void> {
  await db.transaction('rw', db.contracts, async () => {
    const c = await db.contracts.get(contractId)
    if (!c) return
    const next = v.id ? c.variations.map((x) => (x.id === v.id ? { ...x, ...v, id: v.id } : x)) : [...c.variations, { ...v, id: uid() }]
    await db.contracts.update(contractId, { variations: next, updatedAt: now() })
  })
}

export async function removeVariation(contractId: string, variationId: string): Promise<void> {
  await db.transaction('rw', db.contracts, async () => {
    const c = await db.contracts.get(contractId)
    if (c) await db.contracts.update(contractId, { variations: c.variations.filter((x) => x.id !== variationId), updatedAt: now() })
  })
}

/**
 * Plans a contract's remaining money as dated payments: one planned payment for each row, linked to the contract (and its vendor and
 * phase), so they show in Due and upcoming and in the Cash forecast, and can be paid, moved or skipped like any planned payment.
 * `purpose` writes the text of each (instalment number counted from `firstNumber`).
 */
export async function planInstalments(
  contract: Contract,
  rows: { date: string; amount: number }[],
  opts: { category: Category; mode: PayMode; paidBy: string; addedBy: string; firstNumber: number; purpose: (n: number) => string },
): Promise<number> {
  const t = now()
  const made: Payment[] = rows
    .filter((r) => r.amount > 0 && r.date)
    .map((r, i) => ({
      id: uid(),
      projectId: contract.projectId,
      date: r.date,
      amount: r.amount,
      vendorId: contract.vendorId,
      phaseId: contract.phaseId,
      contractId: contract.id,
      category: opts.category,
      purpose: opts.purpose(opts.firstNumber + i),
      status: 'planned' as const,
      mode: opts.mode,
      paidBy: opts.paidBy,
      addedBy: opts.addedBy,
      createdAt: t + i,
      updatedAt: t + i,
    }))
  if (made.length) await db.payments.bulkAdd(made)
  return made.length
}
