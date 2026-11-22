// Checks what Home's "Phase progress" lists. Run: npx vite-node scripts/phase-progress-test.ts
import assert from 'node:assert/strict'
import { phaseProgress } from '../src/lib/stats'
import type { Payment, Phase } from '../src/db/types'

let n = 0
const phase = (id: string, budget?: number, order = ++n): Phase => ({ id, projectId: 'p1', order, budget, createdAt: 1, updatedAt: 1 }) as Phase
const pay = (phaseId: string | undefined, amount: number, o: Partial<Payment> = {}): Payment =>
  ({ id: `p${++n}`, projectId: 'p1', date: '2026-11-01', amount, category: 'labour', purpose: 'x', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'A', phaseId, createdAt: 1, updatedAt: 1, ...o }) as Payment

const phases = [phase('a', 100_000), phase('b', 250_000), phase('c'), phase('d', 50_000), phase('e'), phase('f')]
const payments = [
  pay('a', 120_000), // over its budget
  pay('b', 210_000), // 84%: near the limit
  pay('c', 30_000), // spending but no budget
  pay('d', 1_000), // budget, a little spent
  pay('a', 9, { status: 'planned' }), // not counted
  pay('c', 8, { deletedAt: 3 }), // removed
  pay('c', 7, { paidBy: 'builder', approval: 'pending' }), // waiting for approval
]
const p = phaseProgress(phases, payments)

// Over budget first, then near the limit, then the rest by what was spent.
assert.deepEqual(p.rows.map((r) => r.phase.id), ['a', 'b', 'c', 'd'])
assert.deepEqual(p.rows.map((r) => r.state), ['over', 'near', 'none', 'ok'])
assert.deepEqual(p.rows.map((r) => r.spent), [120_000, 210_000, 30_000, 1_000], 'only paid and approved payments count')
assert.deepEqual(p.rows.map((r) => r.pct), [120, 84, 0, 2])
assert.equal(p.rows[2].budget, undefined, 'a phase with no budget has none, not 0')

// Phases with no spending and no budget are only counted.
assert.equal(p.notStarted, 2, 'e and f')
assert.equal(p.total, 6)
assert.equal(p.budgeted, 3, 'a, b and d have a budget')

// A finished phase is listed after the unfinished ones, with how it ended, and is never over, near or "full".
const fin = (id: string, budget: number | undefined): Phase => ({ ...phase(id, budget), done: true }) as Phase
const r = phaseProgress([fin('f1', 100_000), phase('o1', 100_000), fin('f2', 100_000), fin('f3', undefined)], [pay('f1', 100_000), pay('o1', 90_000), pay('f2', 80_000), pay('f3', 500_000)])
assert.deepEqual(r.rows.map((x) => x.phase.id), ['o1', 'f3', 'f1', 'f2'], 'unfinished first (near its limit), then finished ones by what they cost')
assert.deepEqual(r.rows.map((x) => x.state), ['near', 'none', 'onEstimate', 'under'])
assert.deepEqual(r.rows.map((x) => x.done), [false, true, true, true])

// A phase with a budget and nothing spent is listed (it is planned work), and a budget of 0 is no budget.
const q = phaseProgress([phase('x', 500_000), phase('y', 0), phase('z')], [])
assert.deepEqual(q.rows.map((r) => r.phase.id), ['x'])
assert.deepEqual([q.notStarted, q.budgeted, q.total], [2, 1, 3])

// The list is capped, most urgent kept.
const many = Array.from({ length: 9 }, (_, i) => phase(`m${i}`, 100))
const manyPays = many.map((ph, i) => pay(ph.id, 10 * (i + 1)))
const capped = phaseProgress(many, manyPays, 5)
assert.equal(capped.rows.length, 5)
assert.deepEqual(capped.rows.map((r) => r.phase.id), ['m8', 'm7', 'm6', 'm5', 'm4'], 'm8 and m7 are near their limit; then by spending')
assert.equal(capped.notStarted, 0, 'every phase has spending, so none is "not started" even when the list is capped')

// Nothing at all.
assert.deepEqual(phaseProgress([], []), { rows: [], notStarted: 0, budgeted: 0, total: 0 })

console.log('phase progress: all checks passed')
