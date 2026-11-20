// Checks which payments a statement lists and what it adds up to. Run: npx vite-node scripts/statements-test.ts
import assert from 'node:assert/strict'
import { buildStatement, type StatementFilter } from '../src/lib/statements'

let n = 0
const pay = (o: Record<string, unknown>) =>
  ({ id: `p${++n}`, projectId: 'p', date: '2026-11-05', amount: 1000, category: 'material', purpose: 'x', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: '', createdAt: n, updatedAt: n, ...o }) as never
const all: StatementFilter = { scope: 'all', includePlanned: false, includePending: false }

const data = [
  pay({ amount: 5000, date: '2026-11-03', vendorId: 'v1', phaseId: 'ph1', contractId: 'c1' }),
  pay({ amount: 2000, date: '2026-11-01', vendorId: 'v1', phaseId: 'ph2', mode: 'bank' }),
  pay({ amount: 700, date: '2026-11-10', vendorId: 'v2', paidBy: 'builder', status: 'advance' }),
  pay({ amount: 400, vendorId: 'v1', paidBy: 'builder', approval: 'pending' }),
  pay({ amount: 300, vendorId: 'v1', approval: 'rejected' }),
  pay({ amount: 90, vendorId: 'v1', status: 'skipped' }),
  pay({ amount: 800, vendorId: 'v1', status: 'planned', date: '2026-11-19' }),
  pay({ amount: 999, vendorId: 'v1', deletedAt: 5 }),
]

// Everything: counted payments only, oldest first, with totals.
let r = buildStatement(data, all)
assert.equal(r.total, 7700); assert.equal(r.countedCount, 3)
assert.deepEqual(r.rows.map((p) => p.amount), [2000, 5000, 700], 'oldest first; planned, pending, rejected, skipped and binned left out')
assert.deepEqual(r.byMode, { cash: 5700, bank: 2000 }); assert.deepEqual(r.byPaidBy, { investor: 7000, builder: 700 })
assert.deepEqual(r.byPhase, [{ phaseId: 'ph1', amount: 5000 }, { phaseId: 'ph2', amount: 2000 }, { phaseId: '', amount: 700 }])

// Planned and pending can be listed, but never change the total.
r = buildStatement(data, { ...all, includePlanned: true, includePending: true })
assert.equal(r.total, 7700); assert.equal(r.plannedTotal, 800); assert.equal(r.pendingTotal, 400)
assert.equal(r.rows.length, 5); assert.equal(r.byPhase.reduce((s, x) => s + x.amount, 0), 7700)

// Scopes.
assert.equal(buildStatement(data, { ...all, scope: 'vendor', vendorId: 'v1' }).total, 7000)
assert.equal(buildStatement(data, { ...all, scope: 'vendor', vendorId: 'v2' }).total, 700)
assert.equal(buildStatement(data, { ...all, scope: 'phase', phaseId: 'ph2' }).total, 2000)
assert.equal(buildStatement(data, { ...all, scope: 'contract', contractId: 'c1' }).total, 5000)
assert.equal(buildStatement(data, { ...all, scope: 'contract', contractId: 'nope' }).rows.length, 0)

// Dates are inclusive on both ends.
assert.equal(buildStatement(data, { ...all, from: '2026-11-03', to: '2026-11-10' }).total, 5700)
assert.equal(buildStatement(data, { ...all, from: '2026-11-04' }).total, 700)
assert.equal(buildStatement(data, { ...all, to: '2026-11-02' }).total, 2000)
assert.equal(buildStatement(data, { ...all, from: '2027-01-01' }).total, 0)

console.log('statements: all checks passed')
