// Checks the rules every file upload shares: what is accepted, the size limit, one file or several, and pasted files.
// Run: npx vite-node scripts/files-test.ts
import assert from 'node:assert/strict'
import { acceptsFile, nameClipboardFile, sortFiles } from '../src/lib/files'

const f = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type })

// Pictures
assert.ok(acceptsFile(f('a.png', 'image/png'), 'image/*'))
assert.ok(acceptsFile(f('a.webp', 'image/webp'), 'image/*'))
assert.ok(!acceptsFile(f('a.pdf', 'application/pdf'), 'image/*'), 'a PDF is not a picture')
assert.ok(acceptsFile(f('IMG_1.HEIC', ''), 'image/*'), 'a phone photo with no type is still a picture, by its extension')
assert.ok(!acceptsFile(f('notes.txt', ''), 'image/*'))

// Documents (the list the Files page uses)
const docs = 'application/pdf,image/*,.doc,.docx,.xls,.xlsx'
assert.ok(acceptsFile(f('plan.pdf', 'application/pdf'), docs))
assert.ok(acceptsFile(f('boq.XLSX', ''), docs), 'matched by extension, any case')
assert.ok(acceptsFile(f('site.jpg', 'image/jpeg'), docs))
assert.ok(!acceptsFile(f('virus.exe', 'application/x-msdownload'), docs))

// Backup restore
assert.ok(acceptsFile(f('backup.json', ''), 'application/json,.json'), 'a backup with no type is found by its extension')
assert.ok(!acceptsFile(f('backup.png', 'image/png'), 'application/json,.json'))
assert.ok(acceptsFile(f('anything.bin', ''), ''), 'no rule, anything goes')

// Sorting: type first, then size, and a single-file place keeps one
const mixed = [f('a.png', 'image/png', 5), f('b.pdf', 'application/pdf', 5), f('c.png', 'image/png', 50), f('d.png', 'image/png', 5)]
const many = sortFiles(mixed, { accept: 'image/*', maxBytes: 10, multiple: true })
assert.deepEqual(many.ok.map((x) => x.name), ['a.png', 'd.png'])
assert.deepEqual(many.rejected.map((r) => `${r.file.name}:${r.reason}`), ['b.pdf:type', 'c.png:size'])
const one = sortFiles(mixed, { accept: 'image/*', maxBytes: 10, multiple: false })
assert.deepEqual(one.ok.map((x) => x.name), ['a.png'], 'a single-file place keeps only the first good file')

// A pasted picture is called "image.png" by the browser; it gets a real name. A named file is left alone.
const when = new Date('2026-11-21T09:05:07Z')
assert.equal(nameClipboardFile(f('image.png', 'image/png'), 0, when).name, 'pasted-20261121-090507.png')
assert.equal(nameClipboardFile(f('image.png', 'image/png'), 1, when).name, 'pasted-20261121-090507-2.png')
assert.equal(nameClipboardFile(f('receipt.jpg', 'image/jpeg'), 0, when).name, 'receipt.jpg')
assert.equal(nameClipboardFile(f('', 'image/jpeg'), 0, when).name, 'pasted-20261121-090507.jpg')

console.log('files: all checks passed')
