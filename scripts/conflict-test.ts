// Checks the "edit replaced by a newer edit" safety net: finding the refused rows, comparing versions, keeping the
// notice on this device, putting our version back, and that the v6 -> v7 local database upgrade keeps old data.
// Run: npx vite-node scripts/conflict-test.ts
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import assert from 'node:assert/strict'

// An existing device: the database as version 6 left it, with one payment in it.
const old = new Dexie('epc-construction')
old.version(6).stores({
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
await old.table('payments').add({ id: 'old-1', projectId: 'p1', date: '2026-11-01', amount: 1000, category: 'material', purpose: 'Old row', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'A', createdAt: 1, updatedAt: 1, dirty: 0 })
old.close()

const { db } = await import('../src/db/db')
const { staleIds, snapshot, diffFields, recordConflicts, restoreMine, keepCurrent, loadConflicts } = await import('../src/sync/conflicts')

// ---- upgrade
assert.equal((await db.payments.get('old-1'))?.purpose, 'Old row', 'old data survives the upgrade')
assert.equal(await db.conflicts.count(), 0, 'the new table starts empty')
console.log('upgrade v6 -> v7 ok')

// ---- finding refused rows
assert.deepEqual(staleIds([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }]), ['b'], 'a row missing from the answer was refused')
assert.deepEqual(staleIds([{ id: 'a' }], [{ id: 'a' }]), [], 'everything written: nothing refused')
assert.deepEqual(staleIds([{ id: 'a' }], null), [], 'no answer: no information, nothing is claimed')
assert.deepEqual(staleIds([{ id: 'a' }], []), ['a'], 'an empty answer means every row was refused')
console.log('staleIds ok')

// ---- snapshot
const snap = snapshot({ id: 'f', title: 'Plan', blob: new Blob(['x']), thumbnail: new Blob(['y']), dirty: 1 })
assert.deepEqual(snap, { id: 'f', title: 'Plan' }, 'no files, no sync flag')

// ---- comparing versions
const base = { id: 'p', projectId: 'p1', date: '2026-11-01', amount: 35000, purpose: 'Ceiling 2nd', status: 'paid', mode: 'bank', createdAt: 1, updatedAt: 10, vendorId: 'v1' }
assert.equal(diffFields(base, { ...base, updatedAt: 99 }).length, 0, 'only the time differs: nothing to show')
const amt = diffFields(base, { ...base, amount: 30000, updatedAt: 99 })
assert.deepEqual(amt.map((d) => [d.key, d.mine, d.current]), [['amount', 35000, 30000]])
assert.equal(diffFields({ ...base, note: undefined }, { ...base, note: '' }).length, 0, 'empty and missing are the same')
assert.deepEqual(diffFields(base, { ...base, vendorId: 'v2' }).map((d) => d.kind), ['other'], 'a change we cannot name is still reported')
const del = diffFields(base, { ...base, deletedAt: 5 })
assert.deepEqual(del.map((d) => [d.kind, d.mine, d.current]), [['state', false, true]], 'the other phone deleted it')
assert.ok(diffFields(base, undefined).some((d) => d.kind === 'state' && d.current === true), 'a row that is gone counts as deleted')
console.log('diffFields ok')

// ---- keeping the notice
await db.payments.put({ ...base, updatedAt: 10, dirty: 0 } as never)
const theirs = { ...base, amount: 30000, updatedAt: 99 }
await db.payments.put({ ...theirs, dirty: 0 } as never) // what the sync engine does after fetching the newer row
assert.equal(await recordConflicts('payments', [{ ...base, dirty: 1 }], new Map([['p', theirs]])), 1)
assert.equal(await recordConflicts('payments', [{ ...base }], new Map([['p', { ...base, updatedAt: 99 }]])), 0, 'same for the person: no notice')
const list = await loadConflicts()
assert.equal(list.length, 1)
assert.equal(list[0].conflict.id, 'payments:p')
assert.equal(list[0].conflict.projectId, 'p1')
assert.equal(list[0].current?.amount, 30000, 'the notice shows the row as it is now')
assert.equal(list[0].conflict.mine.amount, 35000, 'and our version')
assert.equal('dirty' in list[0].conflict.mine, false)
// The same row refused again replaces the notice instead of piling up.
await recordConflicts('payments', [{ ...base, amount: 36000 }], new Map([['p', theirs]]))
assert.equal(await db.conflicts.count(), 1)
assert.equal((await loadConflicts())[0].conflict.mine.amount, 36000)

// ---- putting our version back
const before = Date.now()
await restoreMine((await loadConflicts())[0].conflict)
const back = await db.payments.get('p')
assert.equal(back?.amount, 36000, 'our version is back')
assert.equal(back?.dirty, 1, 'and waits to be sent')
assert.ok((back?.updatedAt ?? 0) >= before, 'as the newest edit, so it wins over the other one')
assert.equal(await db.conflicts.count(), 0, 'the notice is gone')

// ---- keeping the current version
await recordConflicts('payments', [{ ...base, amount: 1 }], new Map([['p', theirs]]))
await keepCurrent('payments:p')
assert.equal(await db.conflicts.count(), 0)
assert.equal((await db.payments.get('p'))?.amount, 36000, 'keeping the current version changes nothing')

// ---- a file keeps its bytes when our version is put back
await db.files.put({ id: 'f1', projectId: 'p1', kind: 'document', title: 'Old title', date: '2026-11-01', name: 'a.pdf', mime: 'application/pdf', size: 1, blob: new Blob(['bytes']), createdAt: 1, updatedAt: 99, dirty: 0 } as never)
await recordConflicts('files', [{ id: 'f1', projectId: 'p1', kind: 'document', title: 'My title', date: '2026-11-01', name: 'a.pdf', mime: 'application/pdf', size: 1, blob: new Blob(['bytes']), createdAt: 1, updatedAt: 10 }], new Map([['f1', { id: 'f1', title: 'Old title', date: '2026-11-01', name: 'a.pdf', mime: 'application/pdf', size: 1 }]]))
await restoreMine((await loadConflicts())[0].conflict)
const file = await db.files.get('f1')
assert.equal(file?.title, 'My title')
assert.ok(file?.blob instanceof Blob, 'the file itself is still there')

// ---- a project's notice points at the project itself
await recordConflicts('projects', [{ id: 'p1', name: 'Mine', createdAt: 1, updatedAt: 1 }], new Map([['p1', { id: 'p1', name: 'Theirs', createdAt: 1, updatedAt: 2 }]]))
assert.equal((await loadConflicts())[0].conflict.projectId, 'p1')

console.log('conflict notices ok')
process.exit(0)
