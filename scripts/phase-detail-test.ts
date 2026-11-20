// Checks the figures on a phase's page and the "where the money went" grouping.
// Run: npx vite-node scripts/phase-detail-test.ts
import assert from 'node:assert/strict'
import { phaseFigures, spentBy } from '../src/lib/stats'
import type { Payment } from '../src/db/types'

let n = 0
const pay = (o: Partial<Payment>): Payment =>
  ({ id: `p${++n}`, projectId: 'p1', date: '2026-11-01', amount: 100, category: 'labour', purpose: 'x', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'investor', createdAt: n, updatedAt: n, ...o }) as Payment

const rows = [
  pay({ amount: 1000 }),
  pay({ amount: 500, status: 'advance' }),
  pay({ amount: 300, status: 'planned' }),
  pay({ amount: 200, status: 'planned' }),
  pay({ amount: 40, paidBy: 'builder', approval: 'pending' }),
  pay({ amount: 7, paidBy: 'builder', approval: 'rejected' }),
  pay({ amount: 9, status: 'skipped' }),
  pay({ amount: 11, deletedAt: 3 }),
]

// Within the budget.
let f = phaseFigures(rows, 2000)
assert.deepEqual(f, { spent: 1500, planned: 500, awaiting: 40, left: 500, over: 0, count: 7 }, 'removed entries are not counted at all; rejected and skipped count as entries but add to nothing')

// Over the budget.
f = phaseFigures(rows, 1000)
assert.equal(f.left, 0)
assert.equal(f.over, 500)

// Exactly the budget.
f = phaseFigures(rows, 1500)
assert.equal(f.left, 0)
assert.equal(f.over, 0)

// No budget (undefined or 0): nothing is left or over.
for (const b of [undefined, 0]) {
  f = phaseFigures(rows, b)
  assert.equal(f.left, 0)
  assert.equal(f.over, 0)
  assert.equal(f.spent, 1500)
}

// Nothing in the phase.
assert.deepEqual(phaseFigures([], 100), { spent: 0, planned: 0, awaiting: 0, left: 100, over: 0, count: 0 })

// Where the money went: only paid and approved money, largest first, equal amounts by label.
const by = spentBy(
  [
    pay({ amount: 300, vendorId: 'v1' }),
    pay({ amount: 200, vendorId: 'v2' }),
    pay({ amount: 100, vendorId: 'v1' }),
    pay({ amount: 400, vendorId: 'v3' }),
    pay({ amount: 50, vendorId: 'v2', status: 'planned' }),
    pay({ amount: 60, vendorId: 'v2', paidBy: 'builder', approval: 'pending' }),
    pay({ amount: 70, vendorId: 'v2', deletedAt: 5 }),
  ],
  (p) => ({ v1: 'Alpha', v2: 'Beta', v3: 'Gamma' })[p.vendorId!] ?? '',
)
assert.deepEqual(by, [
  { label: 'Alpha', amount: 400 },
  { label: 'Gamma', amount: 400 },
  { label: 'Beta', amount: 200 },
])
assert.deepEqual(spentBy([], () => 'x'), [])

console.log('phase detail: all checks passed')
