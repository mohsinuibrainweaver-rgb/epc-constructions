// Checks the contract money logic. Run: npx vite-node scripts/contracts-test.ts
import assert from 'node:assert/strict'
import { money } from '../src/lib/format'
import { TABLES } from '../src/sync/mapping'
import { contractAlerts, contractPayments, contractTotal, openContracts, summarizeContract } from '../src/lib/contracts'

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

console.log('contracts: all checks passed')
