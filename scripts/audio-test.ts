// Checks voice notes: what is accepted (WhatsApp .ogg and .opus, MP3, m4a ...), how they are named, typed and told apart, the file names after
// conversion, and that the MP3 encoder produces a real MP3 of the right length.
// Run: npx vite-node scripts/audio-test.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { acceptsFile, nameClipboardFile, sortFiles } from '../src/lib/files'
import { attachmentMime, AUDIO_EXTS, extForMime, isAudio, isAudioName, isAudioType, isDocumentName, isPictureOrVideo, MAX_ATTACHMENT_BYTES, mimeForPath, normalizeMime, PAYMENT_ACCEPT, storageExt } from '../src/lib/media'
import { documentItems, photoItems, receiptAsFile } from '../src/lib/receipts'
import { encodeMp3, isMp3, mp3Name } from '../src/lib/audio'
import { db } from '../src/db/db'
import { savePayment } from '../src/db/actions'
import type { Payment } from '../src/db/types'

const f = (name: string, type: string, size = 1000) => ({ name, type, size }) as File

// 1. What the picker, drag and drop and paste take: WhatsApp voice notes and the usual sound files, by type or (when a program gives no type) by extension.
for (const [name, type] of [
  ['PTT-20261123-WA0001.opus', 'audio/ogg; codecs=opus'],
  ['WhatsApp Ptt 2026-11-23 at 10.12.03 AM.ogg', 'audio/ogg'],
  ['voice.opus', 'audio/opus'],
  ['note.mp3', 'audio/mpeg'],
  ['note.m4a', 'audio/mp4'],
  ['note.m4a', 'audio/x-m4a'],
  ['note.aac', 'audio/aac'],
  ['note.wav', 'audio/wav'],
  ['note.amr', 'audio/amr'],
  ['rec.weba', 'audio/webm'],
]) {
  assert.ok(acceptsFile(f(name, type), PAYMENT_ACCEPT), `${name} (${type}) is taken`)
}
for (const ext of AUDIO_EXTS) assert.ok(acceptsFile(f(`note.${ext}`, ''), PAYMENT_ACCEPT), `.${ext} with no type is taken`)
assert.ok(acceptsFile(f('NOTE.OGG', ''), PAYMENT_ACCEPT))
// Still turned away: things that run.
assert.ok(!acceptsFile(f('setup.exe', 'application/x-msdownload'), PAYMENT_ACCEPT))
assert.ok(!acceptsFile(f('page.html', 'text/html'), PAYMENT_ACCEPT))
// The size limit holds for voice notes too.
const sorted = sortFiles([f('a.ogg', 'audio/ogg', 2_000_000), f('big.wav', 'audio/wav', MAX_ATTACHMENT_BYTES + 1)], { accept: PAYMENT_ACCEPT, maxBytes: MAX_ATTACHMENT_BYTES, multiple: true })
assert.deepEqual(sorted.ok.map((x) => x.name), ['a.ogg'])
assert.deepEqual(sorted.rejected.map((r) => [r.file.name, r.reason]), [['big.wav', 'size']])

// 2. Types: aliases read as one type; extensions both ways.
assert.equal(normalizeMime('audio/ogg; codecs=opus'), 'audio/ogg')
assert.equal(normalizeMime('AUDIO/X-M4A'), 'audio/mp4')
assert.equal(normalizeMime('audio/x-wav'), 'audio/wav')
assert.equal(normalizeMime('audio/mp3'), 'audio/mpeg')
assert.equal(normalizeMime(undefined), '')
assert.ok(isAudioType('audio/ogg') && isAudioType('audio/ogg; codecs=opus') && isAudioType('AUDIO/MPEG') && !isAudioType('video/mp4') && !isAudioType('') && !isAudioType(undefined))
assert.equal(mimeForPath('p/abc.ogg'), 'audio/ogg')
assert.equal(mimeForPath('p/abc.oga'), 'audio/ogg')
assert.equal(mimeForPath('p/abc.opus'), 'audio/opus')
assert.equal(mimeForPath('p/abc.MP3'), 'audio/mpeg')
assert.equal(mimeForPath('p/abc.m4a'), 'audio/mp4')
assert.equal(extForMime('audio/ogg; codecs=opus'), 'ogg')
assert.equal(extForMime('audio/x-m4a'), 'm4a')
assert.equal(extForMime('audio/mpeg'), 'mp3')
assert.ok(AUDIO_EXTS.every((e) => isAudioName(`a.${e}`)) && !isAudioName('a.pdf') && !isAudioName('a.mp4') && !isAudioName('noext'))
assert.ok(!isDocumentName('a.ogg') && !isDocumentName('a.mp3'), 'a voice note is not a document')

// 3. What an attachment is.
assert.ok(isAudio({ name: 'PTT-1.opus' }) && isAudio({ path: 'p/abc.ogg' }) && isAudio({ name: 'x', blob: new Blob(['x'], { type: 'audio/webm' }) }))
assert.ok(!isAudio({ name: 'receipt-1-1.jpg' }) && !isAudio({ name: 'Invoice.pdf' }) && !isAudio({ name: 'video-1-1.mp4' }) && !isAudio({ name: '' }))
assert.ok(!isPictureOrVideo({ name: 'PTT-1.opus' }), 'not a picture or a video')
assert.equal(attachmentMime({ name: 'PTT-1.opus' }), 'audio/opus')
assert.equal(storageExt({ name: 'PTT-20261123-WA0001.opus', blob: new Blob(['x'], { type: 'audio/ogg; codecs=opus' }) }), 'opus')
assert.equal(storageExt({ name: 'voice.ogg' }), 'ogg')

// 4. Paste: a voice note keeps its own name.
const note = new File(['x'], 'PTT-20261123-WA0001.opus', { type: 'audio/ogg' })
assert.equal(nameClipboardFile(note, 0), note)

// 5. Saving a payment with a voice note keeps its name, type and bytes; a photo next to it is named as before.
const photo = new Blob(['jpeg'], { type: 'image/jpeg' })
const ogg = new File([new Uint8Array([79, 103, 103, 83, 0, 2])], 'WhatsApp Ptt 2026-11-23 at 10.12.03 AM.ogg', { type: 'audio/ogg' })
const opus = new File(['opusdata'], 'PTT-20261123-WA0001.opus', { type: 'audio/ogg; codecs=opus' })
const id = await savePayment({ projectId: 'p', date: '2026-11-23', amount: 7000, category: 'labour', purpose: 'Mason', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'A' }, [photo, ogg, opus], [])
const rows = await db.attachments.where('paymentId').equals(id).toArray()
assert.equal(rows.length, 3)
const oggRow = rows.find((r) => r.name.endsWith('.ogg'))!
assert.equal(oggRow.name, 'WhatsApp Ptt 2026-11-23 at 10.12.03 AM.ogg', 'the name it came with')
assert.equal(oggRow.blob!.size, ogg.size, 'stored as it is')
assert.equal(oggRow.blob!.type, 'audio/ogg')
assert.ok(rows.some((r) => r.name === 'PTT-20261123-WA0001.opus'))
assert.match(rows.find((r) => r.name.startsWith('receipt-'))!.name, /^receipt-\d+-1\.jpg$/)

// 6. Files: voice notes are listed with the documents of a payment (named after it), not among the photos.
const pay = { id, projectId: 'p', date: '2026-11-23', purpose: 'Mason', amount: 7000 } as Payment
assert.equal(photoItems([], rows, [pay]).length, 1)
const docs = documentItems([], rows, [pay])
assert.deepEqual(docs.map((d) => (d.kind === 'payment' ? d.attachment.name : '')).sort(), ['PTT-20261123-WA0001.opus', 'WhatsApp Ptt 2026-11-23 at 10.12.03 AM.ogg'])
const viewer = receiptAsFile(oggRow, pay)
assert.equal(viewer.kind, 'document')
assert.equal(viewer.mime, 'audio/ogg')
assert.equal(receiptAsFile({ ...oggRow, blob: undefined, name: '', path: 'p/abc.opus' }, pay).mime, 'audio/opus', 'a type from the storage path before it is downloaded')

// 7. After conversion: the name, and what needs no conversion.
assert.equal(mp3Name('PTT-20261123-WA0001.opus'), 'PTT-20261123-WA0001.mp3')
assert.equal(mp3Name('WhatsApp Ptt 2026-11-23 at 10.12.03 AM.ogg'), 'WhatsApp Ptt 2026-11-23 at 10.12.03 AM.mp3')
assert.equal(mp3Name('noext'), 'noext.mp3')
assert.equal(mp3Name('.ogg'), 'voice-note.mp3')
assert.ok(isMp3('a.mp3') && isMp3('a', 'audio/mpeg') && !isMp3('a.ogg') && !isMp3('a.m4a', 'audio/mp4'))

// 8. The encoder makes a real MP3: a 2 second 440 Hz tone at 48 kHz, in stereo, comes out mono, about 64 kbps (8000 bytes a second), starting like an MP3.
const rate = 48000
const seconds = 2
const left = new Float32Array(rate * seconds)
const right = new Float32Array(rate * seconds)
for (let i = 0; i < left.length; i++) {
  left[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5
  right[i] = left[i]
}
const mp3 = await encodeMp3([left, right], rate)
assert.ok(mp3.length > 14000 && mp3.length < 18000, `about 16 KB for 2 s at 64 kbps, got ${mp3.length}`)
assert.equal(mp3[0], 0xff, 'the frame sync byte')
assert.equal(mp3[1] & 0xe0, 0xe0, 'and the rest of the sync')
const silent = await encodeMp3([new Float32Array(rate)], rate)
assert.ok(silent.length > 0, 'silence is encoded too')
assert.ok((await encodeMp3([new Float32Array(0)], rate)).length >= 0, 'an empty note does not crash')

console.log('audio: all checks passed')
