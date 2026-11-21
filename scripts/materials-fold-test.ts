// Checks the move of the old Materials list onto payments: the database upgrade (v7 to v8), a backup made before the move,
// and how a quantity travels to and from the server. Run: npx vite-node scripts/materials-fold-test.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import Dexie from 'dexie'

// 1. A phone that already has data at the old version.
const old = new Dexie('epc-construction')
old.version(7).stores({
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
  conflicts: 'id, at',
  settings: 'key',
})
const pay = (id: string, o: object = {}) => ({ id, projectId: 'p', date: '2026-11-08', amount: 16500, category: 'material', purpose: 'Bricks', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'x', createdAt: 10, updatedAt: 10, dirty: 0, ...o })
const line = (id: string, paymentId: string | undefined, o: object = {}) => ({ id, projectId: 'p', date: '2026-11-08', item: 'Bricks', quantity: 1000, unit: 'piece', rate: 16.5, amount: 16500, paymentId, createdAt: 10, updatedAt: 10, dirty: 0, ...o })
await old.table('payments').bulkAdd([pay('a'), pay('b'), pay('c', { deletedAt: 20 }), pay('d', { quantity: 5, unit: 'bag' }), pay('e')])
await old.table('materials').bulkAdd([line('la', 'a'), line('lb', undefined), line('lc', 'c'), line('ld', 'd', { quantity: 9 }), line('le', 'e', { dirty: 1 })])
old.close()

// 2. The new app opens it: the upgrade runs.
const { db } = await import('../src/db/db')
await db.open()
const get = (id: string) => db.payments.get(id)
const a = (await get('a'))!
assert.equal(a.quantity, 1000, 'the line\'s quantity is on its payment')
assert.equal(a.unit, 'piece')
assert.equal(a.updatedAt, 10, 'the upgrade does not change the payment\'s time')
assert.ok(!a.dirty, 'and it is not queued for sending (it came from this device\'s own old data, the server does the same move)')
assert.equal((await get('b'))?.quantity, undefined, 'a payment with no line is untouched')
assert.equal((await get('c'))?.quantity, undefined, 'a payment in the bin is untouched')
assert.equal((await get('d'))?.quantity, 5, 'a payment that already has a quantity keeps it')
const e = (await get('e'))!
assert.equal(e.quantity, 1000)
assert.equal(e.dirty, 1, 'a line that was still waiting to be sent leaves its payment waiting')
assert.equal(await db.materials.count(), 5, 'the old lines are kept, unused')
console.log('upgrade v7 to v8: ok')

// 3. Saving and syncing a purchase.
const { savePayment, exportBackup, importBackup } = await import('../src/db/actions')
const id = await savePayment({ projectId: 'p', date: '2026-11-09', amount: 406000, category: 'material', purpose: 'Bricks', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'x', quantity: 28000, unit: 'piece' }, [], [])
assert.equal((await get(id))?.quantity, 28000)
const { TABLES } = await import('../src/sync/mapping')
const payments = TABLES.find((t) => t.name === 'payments')!
const sent = payments.toRemote((await get(id))!, 'u')
assert.equal(sent.quantity, 28000)
assert.equal(sent.unit, 'piece')
const back = payments.fromRemote({ ...sent, created_at: 1, updated_at: 1, deleted_at: null })
assert.equal(back.quantity, 28000)
assert.equal(back.unit, 'piece')
// A payment that never had a quantity does not send the columns, so a server without them keeps syncing.
const plain = payments.toRemote((await get('b'))!, 'u')
assert.ok(!('quantity' in plain) && !('unit' in plain), 'columns are left out until a quantity is set')
// Taking the quantity away is sent as null, so the other phone clears it too.
await savePayment({ ...(await get(id))!, quantity: null, unit: null }, [], [])
const cleared = payments.toRemote((await get(id))!, 'u')
assert.equal(cleared.quantity, null)
assert.equal(cleared.unit, null)
assert.equal(payments.fromRemote({ ...cleared, created_at: 1, updated_at: 1, deleted_at: null }).quantity, undefined)
assert.ok(!TABLES.some((t) => t.name === ('materials' as string)), 'the old materials table is no longer synced')
console.log('save and sync: ok')

// 4. A backup made before the move still restores, with the purchases on their payments.
const backup = JSON.parse(await exportBackup())
backup.projects = [{ id: 'p', name: 'P', type: 'house', currency: 'PKR', createdAt: 1, updatedAt: 1 }]
backup.payments = [pay('x1'), pay('x2')]
backup.materials = [line('lx', 'x1', { quantity: 3, unit: 'ton' })]
await importBackup(JSON.stringify(backup))
const x1 = (await db.payments.get('x1'))!
assert.deepEqual([x1.quantity, x1.unit], [3, 'ton'])
assert.equal((await db.payments.get('x2'))?.quantity, undefined)
console.log('old backup restore: ok')
console.log('materials fold: all checks passed')
