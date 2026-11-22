// Checks the phase budget preview used on the Add payment screen. Run: npx vite-node scripts/budget-test.ts
import assert from 'node:assert/strict'
import { previewPhaseBudget } from '../src/lib/stats'
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
  phaseId: 'ph1',
  createdAt: n,
  updatedAt: n,
  ...o,
})
const phase = { id: 'ph1', budget: 250_000 }
const draft = { amount: 15_000, status: 'paid' as const, waitsForApproval: false }

// Plumber: 190,400 of 250,000 spent (76%); a payment of 15,000 makes it 82%.
const spent = [pay({ amount: 5_900 }), pay({ amount: 124_500 }), pay({ amount: 30_000, status: 'advance' }), pay({ amount: 30_000 })]
let p = previewPhaseBudget(phase, spent, draft)!
assert.deepEqual([p.spent, p.pct, p.afterPct, p.over, p.state, p.counts], [190_400, 76, 82, 0, 'near', true])

// Only what counts as spent is added up: not planned, skipped, removed, waiting, rejected, or another phase.
const noise = [pay({ amount: 7, status: 'planned' }), pay({ amount: 8, status: 'skipped' }), pay({ amount: 9, deletedAt: 5 }), pay({ amount: 10, paidBy: 'builder', approval: 'pending' }), pay({ amount: 11, paidBy: 'builder', approval: 'rejected' }), pay({ amount: 12, phaseId: 'ph2' }), pay({ amount: 13, phaseId: undefined })]
assert.equal(previewPhaseBudget(phase, [...spent, ...noise], draft)!.spent, 190_400)

// Under 80 percent after: ok. Exactly at the budget: the whole estimate used, nothing over. Past it: over by the difference.
p = previewPhaseBudget(phase, spent, { ...draft, amount: 1_000 })!
assert.deepEqual([p.afterPct, p.state, p.over], [77, 'ok', 0])
p = previewPhaseBudget(phase, spent, { ...draft, amount: 59_600 })!
assert.deepEqual([p.afterPct, p.state, p.over], [100, 'full', 0], 'exactly the estimate is information, not an alarm')
p = previewPhaseBudget(phase, spent, { ...draft, amount: 75_000 })!
assert.deepEqual([p.afterPct, p.state, p.over], [106, 'over', 15_400], 'more than 5% over is a clear overspend')
p = previewPhaseBudget(phase, spent, { ...draft, amount: 66_000 })!
assert.deepEqual([p.afterPct, p.state, p.over], [103, 'overSlight', 6_400], 'a few percent over is ordinary estimating error')

// A planned payment, or a builder's entry waiting for approval, does not change the figures.
p = previewPhaseBudget(phase, spent, { ...draft, status: 'planned' })!
assert.deepEqual([p.counts, p.afterPct, p.state], [false, 76, 'ok'])
p = previewPhaseBudget(phase, spent, { ...draft, waitsForApproval: true })!
assert.deepEqual([p.counts, p.afterPct], [false, 76])

// Editing: the payment itself is left out of "spent", so it is not counted twice.
const mine = pay({ id: 'mine', amount: 30_000 })
p = previewPhaseBudget(phase, [...spent, mine], { ...draft, id: 'mine', amount: 40_000 })!
assert.equal(p.spent, 190_400 + 0 /* 'mine' is excluded; the 4 above are 190,400 */)
assert.equal(p.afterPct, Math.round(((190_400 + 40_000) / 250_000) * 100))

// No amount yet: the figures before. Already over before this payment.
p = previewPhaseBudget(phase, spent, { ...draft, amount: 0 })!
assert.deepEqual([p.afterPct, p.over], [76, 0])
p = previewPhaseBudget({ id: 'ph1', budget: 100 }, [pay({ amount: 150 })], { ...draft, status: 'planned' })!
assert.deepEqual([p.pct, p.state, p.over], [150, 'over', 50], 'a phase that is already over stays reported')
// A finished phase reports how it ended, and says so.
p = previewPhaseBudget({ id: 'ph1', budget: 100, done: true }, [pay({ amount: 90 })], { ...draft, status: 'planned' })!
assert.deepEqual([p.done, p.state], [true, 'under'])

// No budget on the phase: nothing to preview.
assert.equal(previewPhaseBudget({ id: 'ph1', budget: undefined }, spent, draft), undefined)
assert.equal(previewPhaseBudget({ id: 'ph1', budget: 0 }, spent, draft), undefined)

console.log('phase budget preview: all checks passed')
