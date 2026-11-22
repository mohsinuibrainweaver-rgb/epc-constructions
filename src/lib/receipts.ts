import type { Attachment, Payment, ProjectFile } from '../db/types'

/*
 * Everything with a picture on it, in one list for the Files page: the photos and documents uploaded there, and the receipt photos
 * attached to payments (which are stored separately, with the payment). A receipt takes the date, phase and name of its payment.
 */
export type PhotoItem =
  | { kind: 'progress'; id: string; date: string; createdAt: number; file: ProjectFile }
  | { kind: 'receipt'; id: string; date: string; createdAt: number; attachment: Attachment; payment: Payment }

/** Photos uploaded in Files, plus the receipt photos of payments that still exist, newest day first. */
export function photoItems(files: ProjectFile[], attachments: Attachment[], payments: Payment[]): PhotoItem[] {
  const live = new Map(payments.filter((p) => !p.deletedAt).map((p) => [p.id, p]))
  const progress: PhotoItem[] = files
    .filter((f) => !f.deletedAt && f.kind === 'photo')
    .map((file) => ({ kind: 'progress', id: file.id, date: file.date, createdAt: file.createdAt, file }))
  const receipts: PhotoItem[] = []
  for (const attachment of attachments) {
    const payment = live.get(attachment.paymentId)
    if (attachment.deletedAt || !payment) continue
    receipts.push({ kind: 'receipt', id: attachment.id, date: payment.date, createdAt: attachment.createdAt, attachment, payment })
  }
  return [...progress, ...receipts].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

/** The phase an item belongs to: the photo's own, or its payment's. */
export const itemPhaseId = (i: PhotoItem): string | undefined => (i.kind === 'progress' ? i.file.phaseId : i.payment.phaseId)

/** A receipt shaped like a file, so the same viewer can show it. */
export function receiptAsFile(a: Attachment, p: Payment): ProjectFile {
  return {
    id: a.id,
    projectId: a.projectId,
    kind: 'photo',
    title: p.purpose,
    phaseId: p.phaseId,
    date: p.date,
    name: a.name,
    mime: a.blob?.type || 'image/jpeg',
    size: a.blob?.size ?? 0,
    blob: a.blob,
    path: a.path,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}
