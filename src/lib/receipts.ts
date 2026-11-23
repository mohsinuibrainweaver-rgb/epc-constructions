import type { Attachment, Payment, ProjectFile } from '../db/types'
import { attachmentMime, isPictureOrVideo } from './media'

/*
 * Everything with a picture on it, in one list for the Files page: the photos and documents uploaded there, and the receipt photos
 * attached to payments (which are stored separately, with the payment). A receipt takes the date, phase and name of its payment.
 */
export type PhotoItem =
  | { kind: 'progress'; id: string; date: string; createdAt: number; file: ProjectFile }
  | { kind: 'receipt'; id: string; date: string; createdAt: number; attachment: Attachment; payment: Payment }

/** Photos uploaded in Files, plus the receipt photos and videos of payments that still exist, newest day first. (A payment's documents are in `documentItems`.) */
export function photoItems(files: ProjectFile[], attachments: Attachment[], payments: Payment[]): PhotoItem[] {
  const live = new Map(payments.filter((p) => !p.deletedAt).map((p) => [p.id, p]))
  const progress: PhotoItem[] = files
    .filter((f) => !f.deletedAt && f.kind === 'photo')
    .map((file) => ({ kind: 'progress', id: file.id, date: file.date, createdAt: file.createdAt, file }))
  const receipts: PhotoItem[] = []
  for (const attachment of attachments) {
    const payment = live.get(attachment.paymentId)
    if (attachment.deletedAt || !payment || !isPictureOrVideo(attachment)) continue
    receipts.push({ kind: 'receipt', id: attachment.id, date: payment.date, createdAt: attachment.createdAt, attachment, payment })
  }
  return [...progress, ...receipts].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

export type DocumentItem =
  | { kind: 'upload'; id: string; date: string; createdAt: number; file: ProjectFile }
  | { kind: 'payment'; id: string; date: string; createdAt: number; attachment: Attachment; payment: Payment }

/** The documents uploaded in Files, plus the documents (PDF, Word, Excel ...) attached to payments that still exist, newest day first. */
export function documentItems(files: ProjectFile[], attachments: Attachment[], payments: Payment[]): DocumentItem[] {
  const live = new Map(payments.filter((p) => !p.deletedAt).map((p) => [p.id, p]))
  const uploaded: DocumentItem[] = files
    .filter((f) => !f.deletedAt && f.kind === 'document')
    .map((file) => ({ kind: 'upload', id: file.id, date: file.date, createdAt: file.createdAt, file }))
  const attached: DocumentItem[] = []
  for (const attachment of attachments) {
    const payment = live.get(attachment.paymentId)
    if (attachment.deletedAt || !payment || isPictureOrVideo(attachment)) continue
    attached.push({ kind: 'payment', id: attachment.id, date: payment.date, createdAt: attachment.createdAt, attachment, payment })
  }
  return [...uploaded, ...attached].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

/** The phase a document belongs to: its own, or its payment's. */
export const documentPhaseId = (d: DocumentItem): string | undefined => (d.kind === 'upload' ? d.file.phaseId : d.payment.phaseId)

/** The phase an item belongs to: the photo's own, or its payment's. */
export const itemPhaseId = (i: PhotoItem): string | undefined => (i.kind === 'progress' ? i.file.phaseId : i.payment.phaseId)

/** A receipt shaped like a file, so the same viewer can show it. */
export function receiptAsFile(a: Attachment, p: Payment): ProjectFile {
  return {
    id: a.id,
    projectId: a.projectId,
    kind: isPictureOrVideo(a) ? 'photo' : 'document',
    title: p.purpose,
    phaseId: p.phaseId,
    date: p.date,
    name: a.name,
    mime: attachmentMime(a),
    size: a.blob?.size ?? 0,
    blob: a.blob,
    path: a.path,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}
