// Checks documents (PDF, Word, Excel ...) on a payment: what is accepted by the picker, by drag and drop and by paste, how they are named
// and typed, what is saved, and where they show (the payment, and the Documents list in Files rather than the photos).
// Run: npx vite-node scripts/payment-files-test.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { acceptsFile, nameClipboardFile, sortFiles } from '../src/lib/files'
import {
  attachmentMime,
  cleanFileName,
  DOCUMENT_EXTS,
  extForMime,
  extOfName,
  isDocumentName,
  isDocumentType,
  isPictureOrVideo,
  MAX_ATTACHMENT_BYTES,
  mimeForPath,
  PAYMENT_ACCEPT,
  storageExt,
} from '../src/lib/media'
import { documentItems, documentPhaseId, photoItems, receiptAsFile } from '../src/lib/receipts'
import { db } from '../src/db/db'
import { savePayment } from '../src/db/actions'
import type { Payment } from '../src/db/types'

const f = (name: string, type: string, size = 1000) => ({ name, type, size }) as File
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// 1. The same accept string drives the picker, drag and drop, and paste. It takes photos, videos and documents.
for (const [name, type] of [
  ['bill.pdf', 'application/pdf'],
  ['letter.docx', DOCX],
  ['old.doc', 'application/msword'],
  ['sheet.xlsx', XLSX],
  ['old.xls', 'application/vnd.ms-excel'],
  ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['notes.txt', 'text/plain'],
  ['list.csv', 'text/csv'],
  ['text.rtf', 'application/rtf'],
  ['plan.odt', 'application/vnd.oasis.opendocument.text'],
  ['all.zip', 'application/zip'],
  ['photo.jpg', 'image/jpeg'],
  ['clip.mp4', 'video/mp4'],
]) {
  assert.ok(acceptsFile(f(name, type), PAYMENT_ACCEPT), `${name} is taken`)
}
// Some programs hand over a dragged file with no type: the extension decides.
for (const name of ['bill.pdf', 'letter.docx', 'sheet.xlsx', 'slides.pptx', 'notes.txt', 'list.csv', 'UPPER.PDF', 'Report.DOCX']) assert.ok(acceptsFile(f(name, ''), PAYMENT_ACCEPT), `${name} with no type is taken`)
// Things that could run, or that have nothing to do with a payment, are turned away.
for (const [name, type] of [
  ['setup.exe', 'application/x-msdownload'],
  ['run.bat', 'application/x-bat'],
  ['page.html', 'text/html'],
  ['code.js', 'text/javascript'],
  ['pack.rar', 'application/vnd.rar'],
  ['font.ttf', 'font/ttf'],
  ['noext', ''],
]) {
  assert.ok(!acceptsFile(f(name, type), PAYMENT_ACCEPT), `${name} is turned away`)
}

// 2. The size limit and a mixed drop: good files are kept, the others are named with the reason.
const MB = 1024 * 1024
const mixed = sortFiles([f('bill.pdf', 'application/pdf', 3 * MB), f('big.docx', DOCX, MAX_ATTACHMENT_BYTES + 1), f('setup.exe', ''), f('a.png', 'image/png')], { accept: PAYMENT_ACCEPT, maxBytes: MAX_ATTACHMENT_BYTES, multiple: true })
assert.deepEqual(mixed.ok.map((x) => x.name), ['bill.pdf', 'a.png'])
assert.deepEqual(mixed.rejected.map((r) => [r.file.name, r.reason]), [['big.docx', 'size'], ['setup.exe', 'type']])

// 3. Paste: a document keeps its own name; a screenshot gets a readable one.
const doc = new File(['x'], 'Invoice 114.pdf', { type: 'application/pdf' })
assert.equal(nameClipboardFile(doc, 0), doc)
assert.match(nameClipboardFile(new File(['x'], 'image.png', { type: 'image/png' }), 0).name, /^pasted-\d{8}-\d{6}\.png$/)

// 4. Types and names.
assert.deepEqual(DOCUMENT_EXTS.map((e) => isDocumentName(`a.${e}`)), DOCUMENT_EXTS.map(() => true))
assert.ok(!isDocumentName('a.jpg') && !isDocumentName('a.mp4') && !isDocumentName('noext') && !isDocumentName(undefined) && !isDocumentName('a.exe'))
assert.ok(isDocumentName('Plan.PDF'))
assert.ok(isDocumentType('application/pdf') && isDocumentType(DOCX) && isDocumentType('text/csv; charset=utf-8') && !isDocumentType('image/png') && !isDocumentType('') && !isDocumentType(undefined))
assert.equal(extOfName('a.b.docx'), 'docx')
assert.equal(extOfName('noext'), '')
assert.equal(mimeForPath('p1/abc.pdf'), 'application/pdf')
assert.equal(mimeForPath('p1/abc.DOCX'), DOCX)
assert.equal(mimeForPath('p1/abc.xlsx'), XLSX)
assert.equal(mimeForPath('p1/abc.jpeg'), 'image/jpeg')
assert.equal(extForMime('application/pdf'), 'pdf')
assert.equal(extForMime(DOCX), 'docx')
assert.equal(extForMime('image/jpeg'), 'jpg')
assert.equal(extForMime('something/odd'), 'jpg', 'an unknown type is still stored as before')
assert.equal(cleanFileName('Invoice 114.pdf'), 'Invoice 114.pdf')
assert.equal(cleanFileName('a/b\\c:d*e?f"g<h>i|j.pdf'), 'a-b-c-d-e-f-g-h-i-j.pdf')
assert.equal(cleanFileName('  two   spaces .pdf'), 'two spaces .pdf')
assert.ok(cleanFileName(`${'x'.repeat(300)}.pdf`).length <= 120 && cleanFileName(`${'x'.repeat(300)}.pdf`).endsWith('.pdf'), 'a long name keeps its extension')

// 5. What an attachment is, from the file or from its name or path (another phone has only the path until it downloads).
assert.equal(attachmentMime({ name: 'Invoice.pdf', blob: new Blob(['x'], { type: 'application/pdf' }) }), 'application/pdf')
assert.equal(attachmentMime({ name: 'Invoice.pdf' }), 'application/pdf')
assert.equal(attachmentMime({ path: 'p/abc.docx' }), DOCX)
assert.equal(attachmentMime({ name: 'receipt-1.jpg' }), 'image/jpeg')
assert.equal(attachmentMime({ name: '' }), 'image/jpeg', 'an old receipt with nothing to go on is a photo')
assert.ok(isPictureOrVideo({ name: 'receipt-1-1.jpg' }) && isPictureOrVideo({ name: 'video-1-1.mp4' }) && isPictureOrVideo({ name: '' }))
assert.ok(!isPictureOrVideo({ name: 'Invoice.pdf' }) && !isPictureOrVideo({ path: 'p/x.xlsx' }) && !isPictureOrVideo({ name: 'x', blob: new Blob(['x'], { type: 'application/pdf' }) }))
assert.equal(storageExt({ name: 'Invoice 114.pdf', blob: new Blob(['x'], { type: 'application/pdf' }) }), 'pdf')
assert.equal(storageExt({ name: 'Letter.DOCX' }), 'docx')
assert.equal(storageExt({ name: 'receipt-1-1.jpg', blob: new Blob(['x'], { type: 'image/jpeg' }) }), 'jpg')
assert.equal(storageExt({ name: 'weird.zzz', blob: new Blob(['x'], { type: 'video/mp4' }) }), 'mp4', 'an unknown extension falls back to the type')

// 6. Saving a payment with a photo, a PDF and a Word file keeps each with its own name and type.
const photo = new Blob(['jpeg'], { type: 'image/jpeg' })
const pdf = new File(['%PDF-1.4 test'], 'Invoice 114.pdf', { type: 'application/pdf' })
const word = new File(['docx'], 'Quote: "Brick/Sand".docx', { type: DOCX })
const id = await savePayment({ projectId: 'p', date: '2026-11-22', amount: 5000, category: 'labour', purpose: 'Mason', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'A' }, [photo, pdf, word], [])
const rows = await db.attachments.where('paymentId').equals(id).toArray()
assert.equal(rows.length, 3)
const byName = (re: RegExp) => rows.find((r) => re.test(r.name))!
assert.match(byName(/^receipt-/).name, /^receipt-\d+-1\.jpg$/)
const pdfRow = byName(/\.pdf$/)
assert.equal(pdfRow.name, 'Invoice 114.pdf', 'a document keeps the name it came with')
assert.equal(pdfRow.blob!.size, pdf.size, 'and is stored as it is')
assert.equal(pdfRow.blob!.type, 'application/pdf')
assert.equal(byName(/\.docx$/).name, 'Quote- -Brick-Sand-.docx', 'folder marks and quotes are cleaned out of a name')
assert.equal(rows.filter((r) => isPictureOrVideo(r)).length, 1)

// 7. Files: the photos list has the picture only; the documents list has the two documents, named after their payment.
const pay = { id, projectId: 'p', date: '2026-11-22', purpose: 'Mason', amount: 5000, phaseId: 'ph1' } as Payment
const gone = { ...pay, id: 'gone', deletedAt: 1 } as Payment
const photos = photoItems([], rows, [pay])
assert.equal(photos.length, 1)
assert.equal(photos[0].kind, 'receipt')
const docs = documentItems([], rows, [pay])
assert.deepEqual(docs.map((d) => (d.kind === 'payment' ? d.attachment.name : '')).sort(), ['Invoice 114.pdf', 'Quote- -Brick-Sand-.docx'])
assert.ok(docs.every((d) => documentPhaseId(d) === 'ph1'))
assert.equal(documentItems([], rows, [gone]).length, 0, 'documents of a removed payment are not listed')
assert.equal(documentItems([], rows.map((r) => ({ ...r, deletedAt: 5 })), [pay]).length, 0, 'nor are removed documents')

// 8. The viewer gets a document as a document (with its type, even before it is downloaded on a second phone).
const asFile = receiptAsFile(pdfRow, pay)
assert.equal(asFile.kind, 'document')
assert.equal(asFile.mime, 'application/pdf')
const remote = receiptAsFile({ ...pdfRow, blob: undefined, path: 'p/abc.pdf' }, pay)
assert.equal(remote.kind, 'document')
assert.equal(remote.mime, 'application/pdf')
assert.equal(receiptAsFile(byName(/^receipt-/), pay).kind, 'photo')

console.log('payment files: all checks passed')
