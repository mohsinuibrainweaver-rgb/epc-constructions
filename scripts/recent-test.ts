// Checks the "repeat a recent payment" list used on the Add payment screen. Run: npx vite-node scripts/recent-test.ts
import assert from 'node:assert/strict'
import { recentTemplates, type KnownRefs } from '../src/lib/recent'
import type { Payment } from '../src/db/types'

let n = 0
const pay = (o: Partial<Payment>): Payment => ({
  id: `p${++n}`,
  projectId: 'p1',
  date: '2026-11-01',
  amount: 1000,
  category: 'labour',
  purpose: 'Wood work',
  status: 'paid',
  mode: 'bank',
  paidBy: 'investor',
  addedBy: 'A',
  createdAt: n,
  updatedAt: n,
  ...o,
})
const known: KnownRefs = { vendors: new Set(['v1', 'v2']), phases: new Set(['ph1']), openContracts: new Set(['c1']) }

// The latest of the same payment wins, with its amount; newest template first.
const a = recentTemplates([pay({ vendorId: 'v1', date: '2026-10-01', amount: 20000 }), pay({ vendorId: 'v1', date: '2026-11-05', amount: 35000 }), pay({ vendorId: 'v2', purpose: 'Electrician', date: '2026-11-02' })], known)
assert.deepEqual(a.map((t) => [t.vendorId, t.amount]), [['v1', 35000], ['v2', 1000]])

// Same day: the one added later comes first.
const b = recentTemplates([pay({ vendorId: 'v1', purpose: 'A', createdAt: 1 }), pay({ vendorId: 'v1', purpose: 'B', createdAt: 9 })], known)
assert.deepEqual(b.map((t) => t.purpose), ['B', 'A'])

// Spelling and spacing of the purpose do not make a second template; a different phase or category does.
const c = recentTemplates([pay({ vendorId: 'v1', purpose: ' wood WORK ' }), pay({ vendorId: 'v1', purpose: 'Wood work', phaseId: 'ph1' }), pay({ vendorId: 'v1', purpose: 'Wood work', category: 'material' }), pay({ vendorId: 'v1' })], known)
assert.equal(c.length, 3)

// Left out: removed, planned, skipped, rejected and weekly-plan payments (nothing was really paid, or it has its own flow).
const d = recentTemplates(
  [pay({ vendorId: 'v1', deletedAt: 5 }), pay({ vendorId: 'v1', status: 'skipped' }), pay({ vendorId: 'v1', status: 'planned', date: '2026-12-01' }), pay({ vendorId: 'v1', approval: 'rejected' }), pay({ vendorId: 'v1', planId: 'plan1' })],
  known,
)
assert.equal(d.length, 0)
// Pending, approved and advance ones stay (a builder repeats what he entered before).
assert.equal(recentTemplates([pay({ vendorId: 'v1', approval: 'pending' }), pay({ vendorId: 'v2', status: 'advance' })], known).length, 2)

// A vendor, phase or contract that is gone or closed is dropped from the template, not kept as a dead link.
const e = recentTemplates([pay({ vendorId: 'gone', phaseId: 'gone', contractId: 'closed', payeeName: ' Ali ' })], known)[0]
assert.deepEqual([e.vendorId, e.phaseId, e.contractId, e.payeeName], [undefined, undefined, undefined, 'Ali'])
const f = recentTemplates([pay({ vendorId: 'v1', phaseId: 'ph1', contractId: 'c1', payeeName: 'ignored' })], known)[0]
assert.deepEqual([f.vendorId, f.phaseId, f.contractId, f.payeeName], ['v1', 'ph1', 'c1', undefined], 'a vendor replaces the typed payee')

// Payees without a vendor are told apart by name.
assert.equal(recentTemplates([pay({ payeeName: 'Ali' }), pay({ payeeName: 'ali ' }), pay({ payeeName: 'Bilal' })], known).length, 2)

// Miscellaneous payments keep their type; the list is capped.
const g = recentTemplates([pay({ category: 'misc', miscType: 'meals', purpose: 'Lunch' })], known)[0]
assert.deepEqual([g.category, g.miscType], ['misc', 'meals'])
const many = Array.from({ length: 10 }, (_, i) => pay({ vendorId: 'v1', purpose: `Item ${i}` }))
assert.equal(recentTemplates(many, known).length, 4)
assert.equal(recentTemplates(many, known, 2).length, 2)
assert.equal(recentTemplates([], known).length, 0)

// A bank transfer's bank and account are carried (not the reference); cash payments carry none.
const h = recentTemplates([pay({ vendorId: 'v1', mode: 'bank', bankName: 'HBL', bankAccount: 'PK36', bankRef: 'TXN-9' }), pay({ vendorId: 'v2', mode: 'cash', bankName: 'HBL', bankAccount: 'PK36' }), pay({ vendorId: 'v1', purpose: 'Other', mode: 'bank', bankName: null, bankAccount: null })], known)
assert.deepEqual([h[0].bankName, h[0].bankAccount, 'bankRef' in h[0]], [undefined, undefined, false], 'a bank transfer with none, and no reference field')
const withBank = recentTemplates([pay({ vendorId: 'v1', mode: 'bank', bankName: 'HBL', bankAccount: 'PK36', bankRef: 'TXN-9' })], known)[0]
assert.deepEqual([withBank.bankName, withBank.bankAccount], ['HBL', 'PK36'])
const cash = recentTemplates([pay({ vendorId: 'v2', mode: 'cash', bankName: 'HBL', bankAccount: 'PK36' })], known)[0]
assert.deepEqual([cash.bankName, cash.bankAccount], [undefined, undefined], 'a cash payment carries no bank details')

console.log('recent payments: all checks passed')
