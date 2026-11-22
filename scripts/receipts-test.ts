// Checks the list of pictures on the Files page: uploads plus the receipt photos of payments. Run: npx vite-node scripts/receipts-test.ts
import assert from 'node:assert/strict'
import { itemPhaseId, photoItems, receiptAsFile } from '../src/lib/receipts'
import type { Attachment, Payment, ProjectFile } from '../src/db/types'

let n = 0
const file = (o: Partial<ProjectFile>): ProjectFile => ({ id: `f${++n}`, projectId: 'p', kind: 'photo', title: 'Site', date: '2026-11-12', name: 'a.jpg', mime: 'image/jpeg', size: 10, createdAt: n, updatedAt: n, ...o })
const pay = (o: Partial<Payment>): Payment => ({ id: `p${++n}`, projectId: 'p', date: '2026-11-15', amount: 100, category: 'labour', purpose: 'Cement', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'A', createdAt: n, updatedAt: n, ...o })
const att = (paymentId: string, o: Partial<Attachment> = {}): Attachment => ({ id: `a${++n}`, projectId: 'p', paymentId, name: 'receipt.jpg', createdAt: n, updatedAt: n, ...o })

const cement = pay({ id: 'cement', date: '2026-11-15', phaseId: 'brown' })
const meter = pay({ id: 'meter', date: '2026-11-21', purpose: 'Electricity Meter', phaseId: 'elec' })
const gone = pay({ id: 'gone', deletedAt: 5 })
const items = photoItems(
  [file({ title: 'Cement Bori', date: '2026-11-12', phaseId: 'brown' }), file({ kind: 'document' }), file({ deletedAt: 3 })],
  [att('cement'), att('meter'), att('meter'), att('meter', { deletedAt: 9 }), att('gone'), att('nowhere')],
  [cement, meter, gone],
)
assert.deepEqual(items.map((i) => [i.kind, i.date]), [['receipt', '2026-11-21'], ['receipt', '2026-11-21'], ['receipt', '2026-11-15'], ['progress', '2026-11-12']], 'newest day first; documents, deleted files, removed receipts and receipts of removed payments are left out')
assert.equal(items.filter((i) => i.kind === 'receipt').length, 3, 'a payment with two receipts shows both')
assert.deepEqual(items.map(itemPhaseId), ['elec', 'elec', 'brown', 'brown'], 'a receipt belongs to its payment\'s phase')

// Same day: the one added last comes first.
const same = photoItems([file({ date: '2026-11-15', createdAt: 1, title: 'old' }), file({ date: '2026-11-15', createdAt: 9, title: 'new' })], [], [])
assert.deepEqual(same.map((i) => (i.kind === 'progress' ? i.file.title : '')), ['new', 'old'])

// Nothing at all.
assert.deepEqual(photoItems([], [], []), [])

// A receipt can be opened like a file: titled by its payment, dated by it.
const a = att('cement', { path: 'p/receipts/x.jpg' })
const asFile = receiptAsFile(a, cement)
assert.deepEqual([asFile.title, asFile.date, asFile.phaseId, asFile.kind, asFile.path, asFile.id], ['Cement', '2026-11-15', 'brown', 'photo', 'p/receipts/x.jpg', a.id])
assert.equal(asFile.mime, 'image/jpeg')

console.log('receipts: all checks passed')
