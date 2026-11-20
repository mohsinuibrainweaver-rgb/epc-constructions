// Checks the contract money logic. Run: npx vite-node scripts/contracts-test.ts
import assert from 'node:assert/strict'
import { money } from '../src/lib/format'
import { TABLES } from '../src/sync/mapping'
import { contractAlerts, contractPayments, contractTotal, nextInstalment, openContracts, previewPayment, summarizeContract } from '../src/lib/contracts'
import type { Payment } from '../src/db/types'

const contract = (o: Record<string, unknown> = {}) =>
  ({ id: 'c1', projectId: 'p', title: 'Grey structure labour', amount: 2_500_000, date: '2026-11-01', status: 'active', variations: [], createdAt: 0, updatedAt: 0, ...o }) as never
const pay = (o: Record<string, unknown>) =>
  ({ id: Math.random().toString(), projectId: 'p', date: '2026-11-02', category: 'labour', purpose: 'x', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: '', createdAt: 0, updatedAt: 0, contractId: 'c1', ...o }) as never

// Total: variations add and subtract.
assert.equal(contractTotal(contract()), 2_500_000)
assert.equal(contractTotal(contract({ variations: [{ id: 'v1', title: 'Extra room', amount: 300_000, date: '' }, { id: 'v2', title: 'Skip plaster', amount: -50_000, date: '' }] })), 2_750_000)

// Nothing paid yet.
let s = summarizeContract(contract(), [])
assert.deepEqual([s.state, s.paid, s.remaining, s.pct, s.over], ['notStarted', 0, 2_500_000, 0, 0])

// Part paid; only this contract's, not binned, not other contracts, not unapproved.
const all = [
  pay({ amount: 1_000_000 }),
  pay({ amount: 250_000, status: 'advance' }),
  pay({ amount: 999, deletedAt: 5 }),
  pay({ amount: 777, contractId: 'c2' }),
  pay({ amount: 500, contractId: null }),
  pay({ amount: 400_000, paidBy: 'builder', approval: 'pending' }),
  pay({ amount: 5, paidBy: 'builder', approval: 'rejected' }),
  pay({ amount: 90_000, status: 'planned' }),
  pay({ amount: 1, status: 'skipped' }),
]
s = summarizeContract(contract(), all)
assert.equal(s.paid, 1_250_000, 'paid and advance, approved only')
assert.equal(s.awaiting, 400_000); assert.equal(s.planned, 90_000)
assert.equal(s.remaining, 1_250_000); assert.equal(s.pct, 50); assert.equal(s.state, 'inProgress')
assert.equal(contractPayments(contract(), all).length, 6, 'linked to this contract and not binned (binned, other contract and unlinked ones are out)')

// Fully paid, then overpaid.
s = summarizeContract(contract(), [pay({ amount: 2_500_000 })])
assert.deepEqual([s.state, s.remaining, s.pct, s.over], ['fullyPaid', 0, 100, 0])
s = summarizeContract(contract(), [pay({ amount: 2_500_000 }), pay({ amount: 60_000 })])
assert.deepEqual([s.state, s.remaining, s.over, s.pct], ['overpaid', -60_000, 60_000, 100])
// A variation can bring an overpaid contract back to in progress.
s = summarizeContract(contract({ variations: [{ id: 'v', title: 'More', amount: 100_000, date: '' }] }), [pay({ amount: 2_560_000 })])
assert.deepEqual([s.state, s.remaining], ['inProgress', 40_000])
// A zero contract with payments counts as overpaid.
s = summarizeContract(contract({ amount: 0 }), [pay({ amount: 10 })])
assert.equal(s.state, 'overpaid')

// Only active, not binned contracts are offered for new payments.
assert.deepEqual(openContracts([contract(), contract({ id: 'c2', status: 'completed' }), contract({ id: 'c3', status: 'cancelled' }), contract({ id: 'c4', deletedAt: 1 })]).map((c) => c.id), ['c1'])

// Alerts: only open, overpaid contracts.
const over = contractAlerts([contract(), contract({ id: 'c9', title: 'Closed', status: 'completed' })], [pay({ amount: 2_600_000 }), pay({ amount: 5, contractId: 'c9' })])
assert.deepEqual(over.map((a) => [a.id, a.key, a.vars.amount, a.to]), [['co-c1', 'notif.contractOver', money(100_000), '/contracts/c1']])
assert.equal(contractAlerts([contract()], [pay({ amount: 100 })]).length, 0)

// Sync: a link is sent when there is one, an unlink is sent as an explicit null, and a never-linked payment sends nothing.
const payments = TABLES.find((t) => t.name === 'payments')!
const row = (extra: Record<string, unknown>) => payments.toRemote(pay({ projectId: 'p', ...extra }), 'u') as Record<string, unknown>
assert.equal('contract_id' in row({ contractId: undefined }), false, 'old servers without the column keep working')
assert.equal(row({ contractId: 'c1' }).contract_id, 'c1')
assert.equal(row({ contractId: null }).contract_id, null, 'an unlink reaches the server')
assert.equal(payments.fromRemote({ ...row({ contractId: 'c1' }), contract_id: null, created_at: 1, updated_at: 1 } as never).contractId, undefined)

// Preview while adding a payment: instalment number, what is left, and going over.
{
  const c = contract({ amount: 155_000 })
  const done = [pay({ id: 'a', amount: 40_000 }), pay({ id: 'b', amount: 15_000, status: 'advance' }), pay({ id: 'w', amount: 5_000, paidBy: 'builder', approval: 'pending' })]
  const noise = [pay({ amount: 1, status: 'planned' }), pay({ amount: 2, status: 'skipped' }), pay({ amount: 3, deletedAt: 5 }), pay({ amount: 4, contractId: 'c2' }), pay({ amount: 5, approval: 'rejected', paidBy: 'builder' })]
  const draft = { amount: 40_000, status: 'paid' as const, waitsForApproval: false }
  let p = previewPayment(c, [...done, ...noise], draft)
  assert.equal(p.before.paid, 55_000, 'paid so far: paid and advance, approved only')
  assert.equal(p.instalment, 4, 'three already paid or waiting, so this is the fourth (planned, skipped, removed, rejected and other contracts do not count)')
  assert.deepEqual([p.counts, p.after, p.over], [true, 60_000, 0], '155,000 - 55,000 - 40,000')
  // Going over the agreed total.
  p = previewPayment(c, done, { ...draft, amount: 120_000 })
  assert.deepEqual([p.after, p.over], [-20_000, 20_000])
  // Exactly the rest: nothing left, not over.
  p = previewPayment(c, done, { ...draft, amount: 100_000 })
  assert.deepEqual([p.after, p.over], [0, 0])
  // A planned payment, or a builder's entry waiting for approval, does not change what is left.
  p = previewPayment(c, done, { ...draft, status: 'planned' })
  assert.deepEqual([p.counts, p.after, p.over], [false, 100_000, 0])
  p = previewPayment(c, done, { ...draft, waitsForApproval: true })
  assert.deepEqual([p.counts, p.after], [false, 100_000])
  // Editing a payment leaves it out of "before", so it is not counted twice. (The screen shows the instalment number
  // only for a new payment; for an edit the number would not be its real place.)
  p = previewPayment(c, done, { ...draft, id: 'a', amount: 50_000 })
  assert.equal(p.before.paid, 15_000 /* only advance 'b'; 'w' waits */)
  assert.equal(p.after, 155_000 - 15_000 - 50_000)
  assert.equal(p.instalment, 3, 'the other two (paid advance, waiting) plus one')
  // Already overpaid before this payment: the overpayment is still reported.
  p = previewPayment(contract({ amount: 100 }), [pay({ amount: 150 })], { ...draft, status: 'planned' })
  assert.deepEqual([p.counts, p.over], [false, 50])
  // No payments yet: first instalment; an empty amount changes nothing.
  p = previewPayment(c, [], { ...draft, amount: 0 })
  assert.deepEqual([p.instalment, p.after, p.over], [1, 155_000, 0])
}


// ---- the next instalment of a contract
{
  const mk = (o: Partial<Payment>): Payment => ({ id: 'n' + Math.random(), projectId: 'p', date: '2026-12-01', amount: 100, category: 'labour', purpose: 'x', status: 'planned', mode: 'cash', paidBy: 'investor', addedBy: 'a', createdAt: 1, updatedAt: 1, contractId: 'cx', ...o }) as Payment
  const none = nextInstalment({ id: 'cx' }, [mk({ status: 'paid' }), mk({ deletedAt: 1 }), mk({ contractId: 'other' }), mk({ status: 'skipped' })], '2026-11-20')
  assert.equal(none, undefined, 'paid, removed, skipped and other contracts: nothing planned')
  const n = nextInstalment({ id: 'cx' }, [mk({ date: '2026-12-30', amount: 3 }), mk({ date: '2026-11-30', amount: 1 }), mk({ date: '2027-01-30', amount: 4 })], '2026-11-20')
  assert.equal(n?.payment.amount, 1, 'the earliest day')
  assert.equal(n?.more, 2)
  assert.equal(n?.overdue, false)
  const late = nextInstalment({ id: 'cx' }, [mk({ date: '2026-11-10', amount: 7 }), mk({ date: '2026-12-30' })], '2026-11-20')
  assert.equal(late?.payment.amount, 7, 'an overdue one comes first')
  assert.equal(late?.overdue, true)
  assert.equal(nextInstalment({ id: 'cx' }, [mk({ date: '2026-11-20' })], '2026-11-20')?.overdue, false, 'due today is not overdue')
}

console.log('contracts: all checks passed')
