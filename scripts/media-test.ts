// Checks video attachments on a payment: what is accepted, the size limit, names and types, and what is saved.
// Run: npx vite-node scripts/media-test.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { acceptsFile, sortFiles } from '../src/lib/files'
import { extForMime, isVideoType, MAX_ATTACHMENT_BYTES, mimeForPath } from '../src/lib/media'
import { receiptAsFile } from '../src/lib/receipts'
import { db } from '../src/db/db'
import { savePayment } from '../src/db/actions'

const f = (name: string, type: string, size = 1000) => ({ name, type, size }) as File

// 1. The picker takes photos and videos, and nothing else.
const ACCEPT = 'image/*,video/*'
assert.ok(acceptsFile(f('a.jpg', 'image/jpeg'), ACCEPT))
assert.ok(acceptsFile(f('clip.mp4', 'video/mp4'), ACCEPT))
assert.ok(acceptsFile(f('clip.mov', 'video/quicktime'), ACCEPT))
assert.ok(acceptsFile(f('clip.webm', 'video/webm'), ACCEPT))
assert.ok(acceptsFile(f('clip.mov', ''), ACCEPT), 'a video with no type is found by its extension')
assert.ok(acceptsFile(f('clip.3gp', ''), ACCEPT))
assert.ok(!acceptsFile(f('doc.pdf', 'application/pdf'), ACCEPT))
assert.ok(!acceptsFile(f('song.mp3', 'audio/mpeg'), ACCEPT))

// 2. The size limit: a file over 40 MB is turned away, naming the reason, and the rest are kept.
const MB = 1024 * 1024
const { ok, rejected } = sortFiles([f('small.mp4', 'video/mp4', 5 * MB), f('exact.mp4', 'video/mp4', MAX_ATTACHMENT_BYTES), f('big.mp4', 'video/mp4', MAX_ATTACHMENT_BYTES + 1), f('x.pdf', 'application/pdf')], {
  accept: ACCEPT,
  maxBytes: MAX_ATTACHMENT_BYTES,
  multiple: true,
})
assert.deepEqual(ok.map((x) => x.name), ['small.mp4', 'exact.mp4'])
assert.deepEqual(rejected.map((r) => [r.file.name, r.reason]), [['big.mp4', 'size'], ['x.pdf', 'type']])
assert.equal(MAX_ATTACHMENT_BYTES, 40 * MB)

// 3. Types and extensions.
assert.ok(isVideoType('video/mp4') && isVideoType('VIDEO/QUICKTIME') && !isVideoType('image/jpeg') && !isVideoType('') && !isVideoType(undefined))
assert.deepEqual(['video/mp4', 'video/quicktime', 'video/webm', 'image/png', 'image/jpeg', '', 'something/odd', 'video/mp4; codecs=avc1'].map(extForMime), ['mp4', 'mov', 'webm', 'png', 'jpg', 'jpg', 'jpg', 'mp4'])
assert.equal(mimeForPath('p1/abc.mp4'), 'video/mp4')
assert.equal(mimeForPath('p1/abc.MOV'), 'video/quicktime')
assert.equal(mimeForPath('p1/abc.jpg'), 'image/jpeg')
assert.equal(mimeForPath('p1/abc'), undefined)
assert.equal(mimeForPath(undefined), undefined)

// 4. Saving a payment with a photo and a video keeps both, named by what they are and with their type.
const photo = new Blob(['jpeg'], { type: 'image/jpeg' })
const video = new Blob(['mp4data'], { type: 'video/mp4' })
const id = await savePayment({ projectId: 'p', date: '2026-11-22', amount: 5000, category: 'labour', purpose: 'Excavator', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'A' }, [photo, video], [])
const rows = (await db.attachments.where('paymentId').equals(id).toArray()).sort((a, b) => a.name.localeCompare(b.name))
assert.equal(rows.length, 2)
assert.match(rows.find((r) => r.blob?.type === 'image/jpeg')!.name, /^receipt-\d+-1\.jpg$/)
const v = rows.find((r) => r.blob?.type === 'video/mp4')!
assert.match(v.name, /^video-\d+-2\.mp4$/)
assert.equal(v.blob!.size, video.size, 'a video is stored as it is')

// 5. A video receipt reaches the viewer as a video, even before it is downloaded on a second phone (no blob yet, only the path).
const pay = { id, projectId: 'p', date: '2026-11-22', purpose: 'Excavator' } as never
const here = receiptAsFile(v, pay)
assert.equal(here.mime, 'video/mp4')
const remote = receiptAsFile({ ...v, blob: undefined, path: 'p/abc.mp4' }, pay)
assert.equal(remote.mime, 'video/mp4', 'type from the storage path')
const oldPhoto = receiptAsFile({ ...v, blob: undefined, path: 'p/abc.jpg', name: 'receipt-1.jpg' }, pay)
assert.equal(oldPhoto.mime, 'image/jpeg')
const noInfo = receiptAsFile({ ...v, blob: undefined, path: undefined, name: '' }, pay)
assert.equal(noInfo.mime, 'image/jpeg', 'unknown stays a photo, as before')

console.log('media: all checks passed')
