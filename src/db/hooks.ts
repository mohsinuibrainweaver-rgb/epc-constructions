import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { loadConflicts, type ConflictItem } from '../sync/conflicts'
import type { Attachment, Contract, ProjectFile, Payment, PaymentPlan, Phase, Transfer, Vendor } from './types'

export function usePhases(projectId: string | undefined): Phase[] {
  return (
    useLiveQuery(
      async () =>
        projectId ? (await db.phases.where('projectId').equals(projectId).sortBy('order')).filter((p) => !p.deletedAt) : [],
      [projectId],
    ) ?? []
  )
}

export function useVendors(projectId: string | undefined): Vendor[] {
  return (
    useLiveQuery(
      async () =>
        projectId
          ? (await db.vendors.where('projectId').equals(projectId).toArray())
              .filter((v) => !v.deletedAt)
              .sort((a, b) => a.name.localeCompare(b.name))
          : [],
      [projectId],
    ) ?? []
  )
}

/** All payments of a project, newest first. Includes the bin; callers filter with `!deletedAt`. */
export function usePayments(projectId: string | undefined): Payment[] {
  return (
    useLiveQuery(
      async () =>
        projectId
          ? (await db.payments.where('projectId').equals(projectId).toArray()).sort(
              (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
            )
          : [],
      [projectId],
    ) ?? []
  )
}

export function useAttachments(paymentId: string | undefined): Attachment[] {
  return (
    useLiveQuery(
      async () =>
        paymentId ? (await db.attachments.where('paymentId').equals(paymentId).toArray()).filter((a) => !a.deletedAt) : [],
      [paymentId],
    ) ?? []
  )
}

export function usePlans(projectId: string | undefined): PaymentPlan[] {
  return (
    useLiveQuery(
      async () =>
        projectId
          ? (await db.plans.where('projectId').equals(projectId).toArray())
              .filter((p) => !p.deletedAt)
              .sort((a, b) => a.weekday - b.weekday || a.purpose.localeCompare(b.purpose))
          : [],
      [projectId],
    ) ?? []
  )
}

/** Transfers of a project, newest first. Includes the bin; callers filter with `!deletedAt`. */
export function useTransfers(projectId: string | undefined): Transfer[] {
  return (
    useLiveQuery(
      async () =>
        projectId
          ? (await db.transfers.where('projectId').equals(projectId).toArray()).sort(
              (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
            )
          : [],
      [projectId],
    ) ?? []
  )
}

/** Documents and photos of a project, newest first. */
export function useFiles(projectId: string | undefined): ProjectFile[] {
  return (
    useLiveQuery(
      async () =>
        projectId
          ? (await db.files.where('projectId').equals(projectId).toArray())
              .filter((f) => !f.deletedAt)
              .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
          : [],
      [projectId],
    ) ?? []
  )
}

/** Ids of the payments that have a receipt photo. Undefined until the first read, so "no receipt" is never claimed too early. */
export function useReceiptIds(projectId: string | undefined): Set<string> | undefined {
  return useLiveQuery(
    async () =>
      projectId
        ? new Set((await db.attachments.where('projectId').equals(projectId).toArray()).filter((a) => !a.deletedAt).map((a) => a.paymentId))
        : new Set<string>(),
    [projectId],
  )
}

/** Edits of this device that a newer edit from another phone replaced, each with the row as it is now. */
export function useConflicts(): ConflictItem[] {
  return useLiveQuery(loadConflicts, []) ?? []
}

/** How many such edits are waiting for a decision; undefined until the first read. */
export function useConflictCount(): number | undefined {
  return useLiveQuery(() => db.conflicts.count(), [])
}

/** Contracts of a project, newest first. */
export function useContracts(projectId: string | undefined): Contract[] {
  return (
    useLiveQuery(
      async () =>
        projectId
          ? (await db.contracts.where('projectId').equals(projectId).toArray())
              .filter((c) => !c.deletedAt)
              .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
          : [],
      [projectId],
    ) ?? []
  )
}
