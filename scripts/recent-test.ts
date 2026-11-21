// Checks what the Add payment screen learns from earlier payments: the recent list, a vendor's last payment, and a possible double entry.
// Run: npx vite-node scripts/recent-test.ts
import assert from 'node:assert/strict'
import { lastPaymentTo, possibleDouble, recentEntries, vendorDefaults } from '../src/lib/recent'
import type { Payment } from '../src/db/types'

let n = 0
const pay = (o: Partial<Payment>): Payment => ({
  id: `p${++n}`, projectId: 'p1', date: '2026-11-01', amount: 1000, category: 'labour', purpose: 'Wood work', status: 'paid', mode: 'bank', paidBy: 'investor',
  addedBy: 'A', createdAt: n, updatedAt: n, ...o,
})

// ---- the recent list: by the time entered, newest first
const a = pay({ purpose: 'A', date: '2026-11-20', createdAt: 1 })
const b = pay({ purpose: 'B', date: '2026-01-05', createdAt: 5 }) // back-dated, but entered last
const c = pay({ purpose: 'C', date: '2026-11-10', createdAt: 3 })
assert.deepEqual(recentEntries([a, b, c], 5).map((p) => p.purpose), ['B', 'C', 'A'], 'newest entered first, whatever its date')
assert.equal(recentEntries([a, b, c], 2).length, 2, 'limited to what is asked for')
assert.deepEqual(recentEntries([a, b, c], 5, b.id).map((p) => p.purpose), ['C', 'A'], 'the payment being edited is left out')
assert.deepEqual(
  recentEntries([pay({ deletedAt: 5 }), pay({ planId: 'plan1' }), pay({ purpose: 'kept' })], 5).map((p) => p.purpose),
  ['kept'],
  'removed payments and weekly-plan payments are left out',
)
assert.equal(recentEntries([pay({ status: 'planned' }), pay({ approval: 'pending' })], 5).length, 2, 'planned and waiting entries are shown (with their status)')
assert.deepEqual(recentEntries([], 5), [])

// ---- a vendor's last payment
const v1a = pay({ vendorId: 'v1', date: '2026-10-01', purpose: 'old' })
const v1b = pay({ vendorId: 'v1', date: '2026-11-05', purpose: 'new', createdAt: 20 })
const v1c = pay({ vendorId: 'v1', date: '2026-11-05', purpose: 'same day, entered later', createdAt: 30 })
assert.equal(lastPaymentTo([v1a, v1b], 'v1')?.purpose, 'new', 'the newest date')
assert.equal(lastPaymentTo([v1a, v1b, v1c], 'v1')?.purpose, 'same day, entered later', 'on the same day, the one entered last')
assert.equal(lastPaymentTo([v1a, v1b], 'v1', v1b.id)?.purpose, 'old', 'not the payment being edited')
assert.equal(lastPaymentTo([v1a], 'v2'), undefined, 'another vendor')
assert.equal(
  lastPaymentTo([pay({ vendorId: 'v1', deletedAt: 1 }), pay({ vendorId: 'v1', status: 'planned' }), pay({ vendorId: 'v1', status: 'skipped' }), pay({ vendorId: 'v1', approval: 'rejected' })], 'v1'),
  undefined,
  'only a payment really made counts: not removed, planned, skipped or turned down',
)
assert.equal(lastPaymentTo([pay({ vendorId: 'v1', status: 'advance', purpose: 'adv' })], 'v1')?.purpose, 'adv', 'an advance is a payment made')

// ---- what it suggests
assert.deepEqual(vendorDefaults(pay({ category: 'material', paidBy: 'builder', phaseId: 'ph1', mode: 'bank' })), { category: 'material', paidBy: 'builder', phaseId: 'ph1' }, 'category, who paid and phase; the mode is not suggested')
assert.equal(vendorDefaults(pay({ category: 'misc' })).category, undefined, 'a miscellaneous payment says nothing about the category')
assert.equal(vendorDefaults(pay({ phaseId: undefined })).phaseId, undefined)

// ---- a possible double entry: same vendor, same item, within a week
const base = pay({ vendorId: 'v1', purpose: 'Bricks', date: '2026-11-15', amount: 495000 })
const draft = { vendorId: 'v1', purpose: ' bricks ', date: '2026-11-18' }
assert.equal(possibleDouble([base], draft)?.id, base.id, 'spelling and spacing do not hide it')
assert.equal(possibleDouble([base], { ...draft, date: '2026-11-22' })?.id, base.id, 'seven days away is still close')
assert.equal(possibleDouble([base], { ...draft, date: '2026-11-23' }), undefined, 'eight days away is not')
assert.equal(possibleDouble([base], { ...draft, date: '2026-11-10' })?.id, base.id, 'a week before counts too')
assert.equal(possibleDouble([base], { ...draft, purpose: 'Sand' }), undefined, 'another item')
assert.equal(possibleDouble([base], { ...draft, vendorId: 'v2' }), undefined, 'another vendor')
assert.equal(possibleDouble([base], { ...draft, excludeId: base.id }), undefined, 'not the payment being edited')
assert.equal(possibleDouble([{ ...base, deletedAt: 1 }, { ...base, status: 'skipped' }, { ...base, approval: 'rejected' }], draft), undefined, 'removed, skipped and turned-down ones do not count')
assert.equal(possibleDouble([{ ...base, status: 'planned' }], draft)?.id, base.id, 'a planned one for the same week is worth a warning')
assert.equal(possibleDouble([base], { ...draft, purpose: '' }), undefined, 'nothing typed yet')
assert.equal(possibleDouble([base], { ...draft, vendorId: '' }), undefined, 'no vendor chosen')

console.log('recent payments: all checks passed')
