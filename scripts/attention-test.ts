// Checks what Home lists under "Needs your attention" and the Ledger "Missing" filter. Run: npx vite-node scripts/attention-test.ts
import assert from 'node:assert/strict'
import { attentionItems, isMissing, missingBank, missingReceipt, missingVendor } from '../src/lib/attention'
import type { Alert } from '../src/lib/stats'
import type { Payment } from '../src/db/types'

let n = 0
const pay = (o: Partial<Payment>): Payment => ({
  id: `p${++n}`,
  projectId: 'p1',
  date: '2026-11-01',
  amount: 1000,
  category: 'labour',
  purpose: 'x',
  status: 'paid',
  mode: 'cash',
  paidBy: 'investor',
  addedBy: 'A',
  vendorId: 'v1',
  createdAt: n,
  updatedAt: n,
  ...o,
})
const none = new Set<string>()

// No receipt: only payments that count, and only when no photo is linked.
const a = pay({ id: 'a' })
assert.equal(missingReceipt(a, none), true)
assert.equal(missingReceipt(a, new Set(['a'])), false, 'a photo is linked')
assert.equal(missingReceipt(pay({ status: 'planned' }), none), false, 'planned: nothing was paid')
assert.equal(missingReceipt(pay({ status: 'skipped' }), none), false)
assert.equal(missingReceipt(pay({ deletedAt: 5 }), none), false, 'removed')
assert.equal(missingReceipt(pay({ paidBy: 'builder', approval: 'pending' }), none), false, 'waiting for approval: not counted yet')
assert.equal(missingReceipt(pay({ status: 'advance' }), none), true)

// No vendor or payee: anything not skipped or removed, with neither named.
assert.equal(missingVendor(pay({ vendorId: undefined })), true)
assert.equal(missingVendor(pay({ vendorId: undefined, payeeName: '  ' })), true, 'blank spaces name nobody')
assert.equal(missingVendor(pay({ vendorId: undefined, payeeName: 'Ali' })), false)
assert.equal(missingVendor(pay({})), false)
assert.equal(missingVendor(pay({ vendorId: undefined, status: 'planned' })), true, 'a planned payment is still worth naming')
assert.equal(missingVendor(pay({ vendorId: undefined, status: 'skipped' })), false)
assert.equal(missingVendor(pay({ vendorId: undefined, deletedAt: 1 })), false)

// Bank transfer without details: needs a bank transfer that counts, with neither bank nor account.
assert.equal(missingBank(pay({ mode: 'bank' })), true)
assert.equal(missingBank(pay({ mode: 'bank', bankName: 'HBL' })), false)
assert.equal(missingBank(pay({ mode: 'bank', bankAccount: 'PK36' })), false)
assert.equal(missingBank(pay({ mode: 'bank', bankName: null, bankAccount: null })), true, 'cleared values count as none')
assert.equal(missingBank(pay({ mode: 'cash' })), false)
assert.equal(missingBank(pay({ mode: 'bank', status: 'planned' })), false)

// The Ledger filter uses the same rules.
assert.equal(isMissing('receipt', a, none), true)
assert.equal(isMissing('vendor', pay({ vendorId: undefined }), none), true)
assert.equal(isMissing('bank', pay({ mode: 'bank' }), none), true)

// The list on Home: alerts first (danger, then warning), then tidy-up items; nothing when all is well.
const alerts: Alert[] = [
  { id: 'ph-80-1', kind: 'warning', key: 'notif.estimate80', vars: { name: 'Grey', pct: 85 }, to: '/phases/1' },
  { id: 'od-1', kind: 'error', key: 'notif.overdue', vars: { what: 'Foreman' }, to: '/payments/x' },
  { id: 'approvals', kind: 'warning', key: 'notif.pending', vars: { count: 2 }, to: '/ledger?approval=pending' },
  { id: 'ph-over-2', kind: 'error', key: 'notif.phaseOver', vars: { name: 'Plumber', amount: 'Rs 9,000' }, to: '/phases/2' },
  { id: 'co-c1', kind: 'error', key: 'notif.contractOver', vars: { name: 'Wood', amount: 'Rs 5,000' }, to: '/contracts/c1' },
]
const mixed = [pay({ id: 'm1' }), pay({ id: 'm2', vendorId: undefined }), pay({ id: 'm3', mode: 'bank' }), pay({ id: 'm4', status: 'planned' })]
const items = attentionItems(alerts, mixed, new Set(['m1']))
assert.deepEqual(items.map((i) => i.id), ['ph-over-2', 'co-c1', 'ph-80-1', 'missing-vendor', 'missing-bank', 'missing-receipt'], 'danger, warning, then tidy-up; due and approval alerts have their own cards')
assert.deepEqual(items.map((i) => i.tone), ['danger', 'danger', 'warning', 'info', 'info', 'info'])
assert.deepEqual(items.find((i) => i.id === 'missing-receipt')!.vars, { count: 2 }, 'm2 and m3: m1 has a photo and m4 is only planned')
assert.equal(items.find((i) => i.id === 'missing-vendor')!.to, '/ledger?missing=vendor')
assert.equal(items.find((i) => i.id === 'missing-bank')!.vars.count, 1)

// A slight overspend is amber, a clear one red; and phases at exactly their estimate are one quiet row, not an alarm each.
const slight: Alert[] = [{ id: 'ph-over-3', kind: 'warning', key: 'notif.phaseOver', vars: { name: 'Tiles', amount: 'Rs 2,000' }, to: '/phases/3' }, { id: 'proj-over', kind: 'error', key: 'notif.projectOver', vars: { name: 'House', amount: 'Rs 900,000' }, to: '/phases' }]
assert.deepEqual(attentionItems(slight, [], none).map((i) => [i.id, i.tone]), [['proj-over', 'danger'], ['ph-over-3', 'warning']])
const full1 = attentionItems([], [], none, ['Site preparation'])
assert.deepEqual(full1.map((i) => [i.id, i.tone, i.key, i.to]), [['phases-full', 'info', 'attn.phaseFull', '/phases']])
assert.deepEqual(full1[0].vars, { name: 'Site preparation' })
const full4 = attentionItems([], [], none, ['A', 'B', 'C', 'D'])
assert.deepEqual([full4.length, full4[0].key, full4[0].vars], [1, 'attn.phasesFull', { count: 4 }], 'four phases at their estimate make one row')
assert.equal(attentionItems([], [], none, []).length, 0)

// Receipts not read yet: never claim "no receipt".
assert.equal(attentionItems([], mixed, undefined).some((i) => i.id === 'missing-receipt'), false)
// Nothing wrong: nothing listed. Removed payments are ignored.
assert.equal(attentionItems([], [pay({ id: 'ok' })], new Set(['ok'])).length, 0)
assert.equal(attentionItems([], [pay({ vendorId: undefined, deletedAt: 3, mode: 'bank' })], none).length, 0)
assert.equal(attentionItems([], [], none).length, 0)

console.log('attention: all checks passed')
