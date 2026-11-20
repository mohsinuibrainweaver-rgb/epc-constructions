// Checks the plan of the money across phases (top of the Phases screen).
// Run: npx vite-node scripts/budget-plan-test.ts
import assert from 'node:assert/strict'
import { budgetPlan } from '../src/lib/stats'
import type { Payment, Phase } from '../src/db/types'

let n = 0
const phase = (o: Partial<Phase>): Phase => ({ id: `ph${++n}`, projectId: 'p1', order: n, createdAt: n, updatedAt: n, ...o }) as Phase
const pay = (o: Partial<Payment>): Payment =>
  ({ id: `p${++n}`, projectId: 'p1', date: '2026-11-01', amount: 100, category: 'labour', purpose: 'x', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'A', createdAt: n, updatedAt: n, ...o }) as Payment

const a = phase({ id: 'a', budget: 400, done: true })
const b = phase({ id: 'b', budget: 300 })
const c = phase({ id: 'c' }) // no budget
const d = phase({ id: 'd', budget: 0 }) // 0 is no budget
const gone = phase({ id: 'gone', budget: 999, deletedAt: 5 })
const phases = [a, b, c, d, gone]

// Budgets add up; part of the project budget is still to give out.
let p = budgetPlan(phases, [], 1000)
assert.deepEqual(
  { ...p },
  { projectBudget: 1000, allocated: 700, unallocated: 300, overAllocated: 0, total: 4, withBudget: 2, done: 1, outsideSpent: 0 },
  'removed phases are ignored; a budget of 0 is none',
)

// The phase budgets add up to more than the project budget.
p = budgetPlan(phases, [], 500)
assert.equal(p.unallocated, 0)
assert.equal(p.overAllocated, 200)

// Exactly all given out.
p = budgetPlan(phases, [], 700)
assert.equal(p.unallocated, 0)
assert.equal(p.overAllocated, 0)

// No project budget (undefined or 0): nothing to compare with.
for (const pb of [undefined, 0]) {
  p = budgetPlan(phases, [], pb)
  assert.equal(p.projectBudget, undefined)
  assert.equal(p.unallocated, 0)
  assert.equal(p.overAllocated, 0)
  assert.equal(p.allocated, 700)
}

// Money outside every phase: no phase, or a phase that was removed. Only paid and approved money counts.
p = budgetPlan(
  phases,
  [
    pay({ amount: 50 }), // no phase
    pay({ amount: 30, phaseId: 'gone' }), // phase removed
    pay({ amount: 20, phaseId: 'nowhere' }), // unknown phase
    pay({ amount: 900, phaseId: 'a' }), // inside a phase
    pay({ amount: 7, status: 'planned' }), // not paid
    pay({ amount: 8, paidBy: 'builder', approval: 'pending' }), // waiting
    pay({ amount: 9, deletedAt: 3 }), // removed
  ],
  1000,
)
assert.equal(p.outsideSpent, 100)

// No phases at all.
assert.deepEqual(budgetPlan([], [], undefined), { projectBudget: undefined, allocated: 0, unallocated: 0, overAllocated: 0, total: 0, withBudget: 0, done: 0, outsideSpent: 0 })

console.log('budget plan: all checks passed')
