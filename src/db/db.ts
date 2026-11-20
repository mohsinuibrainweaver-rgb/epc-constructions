/* eslint-disable @typescript-eslint/no-explicit-any */
import Dexie, { type Table } from 'dexie'
import type { Attachment, Contract, MaterialLine, ProjectFile, Payment, PaymentPlan, Phase, Project, SettingRow, Transfer, Vendor } from './types'

class AppDB extends Dexie {
  projects!: Table<Project, string>
  phases!: Table<Phase, string>
  vendors!: Table<Vendor, string>
  payments!: Table<Payment, string>
  attachments!: Table<Attachment, string>
  transfers!: Table<Transfer, string>
  plans!: Table<PaymentPlan, string>
  materials!: Table<MaterialLine, string>
  files!: Table<ProjectFile, string>
  contracts!: Table<Contract, string>
  settings!: Table<SettingRow, string>

  constructor() {
    super('epc-construction')
    this.version(1).stores({
      projects: 'id, type, updatedAt',
      phases: 'id, projectId, order',
      vendors: 'id, name',
      payments: 'id, projectId, date, vendorId, phaseId, status, deletedAt',
      attachments: 'id, paymentId',
      settings: 'key',
    })
    // v2: sync. Rows carry a dirty flag; vendors and attachments belong to a project.
    this.version(2)
      .stores({
        projects: 'id, type, updatedAt, dirty',
        phases: 'id, projectId, order, dirty',
        vendors: 'id, projectId, name, dirty',
        payments: 'id, projectId, date, vendorId, phaseId, status, deletedAt, dirty',
        attachments: 'id, paymentId, projectId, dirty',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        const projects = await tx.table('projects').toArray()
        const firstProject = projects[0]?.id as string | undefined
        const stamp = Date.now()
        await tx.table('projects').toCollection().modify({ dirty: 1 })
        await tx.table('phases').toCollection().modify({ dirty: 1 })
        await tx.table('payments').toCollection().modify({ dirty: 1 })
        await tx.table('vendors').toCollection().modify((v) => {
          v.projectId = firstProject ?? ''
          v.dirty = 1
        })
        const pays = new Map<string, string>(
          (await tx.table('payments').toArray()).map((p: Payment) => [p.id, p.projectId]),
        )
        await tx.table('attachments').toCollection().modify((a) => {
          a.projectId = pays.get(a.paymentId) ?? firstProject ?? ''
          a.updatedAt = a.createdAt ?? stamp
          a.dirty = 1
        })
      })
    // v3: money features. Transfers between the investor and builder, and weekly payment plans.
    this.version(3).stores({
      projects: 'id, type, updatedAt, dirty',
      phases: 'id, projectId, order, dirty',
      vendors: 'id, projectId, name, dirty',
      payments: 'id, projectId, date, vendorId, phaseId, status, deletedAt, dirty',
      attachments: 'id, paymentId, projectId, dirty',
      transfers: 'id, projectId, date, dirty',
      plans: 'id, projectId, dirty',
      settings: 'key',
    })
    // v4: materials with quantities and rates.
    this.version(4).stores({
      projects: 'id, type, updatedAt, dirty',
      phases: 'id, projectId, order, dirty',
      vendors: 'id, projectId, name, dirty',
      payments: 'id, projectId, date, vendorId, phaseId, status, deletedAt, dirty',
      attachments: 'id, paymentId, projectId, dirty',
      transfers: 'id, projectId, date, dirty',
      plans: 'id, projectId, dirty',
      materials: 'id, projectId, date, item, dirty',
      settings: 'key',
    })
    // v5: documents and progress photos.
    this.version(5).stores({
      projects: 'id, type, updatedAt, dirty',
      phases: 'id, projectId, order, dirty',
      vendors: 'id, projectId, name, dirty',
      payments: 'id, projectId, date, vendorId, phaseId, status, deletedAt, dirty',
      attachments: 'id, paymentId, projectId, dirty',
      transfers: 'id, projectId, date, dirty',
      plans: 'id, projectId, dirty',
      materials: 'id, projectId, date, item, dirty',
      files: 'id, projectId, kind, date, phaseId, dirty',
      settings: 'key',
    })
    // v6: contracts (agreed amounts); payments can point at one.
    this.version(6).stores({
      projects: 'id, type, updatedAt, dirty',
      phases: 'id, projectId, order, dirty',
      vendors: 'id, projectId, name, dirty',
      payments: 'id, projectId, date, vendorId, phaseId, status, deletedAt, dirty',
      attachments: 'id, paymentId, projectId, dirty',
      transfers: 'id, projectId, date, dirty',
      plans: 'id, projectId, dirty',
      materials: 'id, projectId, date, item, dirty',
      files: 'id, projectId, kind, date, phaseId, dirty',
      contracts: 'id, projectId, vendorId, status, dirty',
      settings: 'key',
    })
  }
}

export const db = new AppDB()

/** Tables that are synced to the server. */
export const SYNC_TABLES = [db.projects, db.phases, db.vendors, db.contracts, db.plans, db.payments, db.transfers, db.materials, db.files, db.attachments] as const

// Local edits mark a row dirty and stamp it; writes that come from the server (sync) must not.
// The marker lives on the Dexie transaction, so an edit made while a pull is running is still tracked.
type RemoteTrans = { remote?: boolean }

/** Runs a read-write transaction whose writes are treated as coming from the server. */
export function remoteTx<T>(tables: Table<any, any>[], fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', tables, async (trans) => {
    ;(trans as unknown as RemoteTrans).remote = true
    return fn()
  })
}

const listeners = new Set<() => void>()
/** Called after any local write, so the sync engine can schedule a push. */
export const onLocalWrite = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
// Listeners may query the database, so they must not run inside the transaction that triggered the hook.
const notify = () =>
  setTimeout(() => {
    Dexie.ignoreTransaction(() => listeners.forEach((l) => l()))
  }, 0)

for (const table of SYNC_TABLES) {
  table.hook('creating', (_key, obj, trans) => {
    if ((trans as unknown as RemoteTrans).remote) return
    ;(obj as { dirty?: number }).dirty = 1
    notify()
  })
  table.hook('updating', (_mods, _key, _obj, trans) => {
    if ((trans as unknown as RemoteTrans).remote) return {}
    notify()
    return { dirty: 1, updatedAt: Date.now() }
  })
}

/** uuid, with a fallback for browsers that only expose crypto.randomUUID on https. */
export const uid = (): string => {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  c.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const now = (): number => Date.now()
