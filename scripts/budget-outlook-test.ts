// Checks how a cost stands against an estimate, the bottom-up budget outlook, and the budget alerts.
// Run: npx vite-node scripts/budget-outlook-test.ts
import assert from 'node:assert/strict'
import { budgetOutlook, budgetState, budgetTone, buildAlerts, fullPhases } from '../src/lib/stats'
import type { Payment, Phase, Project } from '../src/db/types'

let n = 0
const phase = (o: Partial<Phase>): Phase => ({ id: `ph${++n}`, projectId: 'p1', order: n, createdAt: n, updatedAt: n, ...o }) as Phase
const pay = (o: Partial<Payment>): Payment =>
  ({ id: `p${++n}`, projectId: 'p1', date: '2026-11-01', amount: 100, category: 'labour', purpose: 'x', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'A', createdAt: n, updatedAt: n, ...o }) as Payment

// ---- how a cost stands against an estimate
assert.equal(budgetState(100, undefined), 'none', 'no estimate, nothing to compare with')
assert.equal(budgetState(100, 0), 'none')
assert.equal(budgetState(50_000, 100_000), 'ok')
assert.equal(budgetState(79_999, 100_000), 'ok')
assert.equal(budgetState(80_000, 100_000), 'near')
assert.equal(budgetState(99_000, 100_000), 'near')
assert.equal(budgetState(99_500, 100_000), 'full', 'within half a percent is "the whole estimate"')
assert.equal(budgetState(100_000, 100_000), 'full', 'exactly the estimate is information, not an alarm')
assert.equal(budgetState(100_500, 100_000), 'full')
assert.equal(budgetState(101_000, 100_000), 'overSlight')
assert.equal(budgetState(105_000, 100_000), 'overSlight', 'up to 5% over is ordinary estimating error')
assert.equal(budgetState(105_001, 100_000), 'over')
assert.equal(budgetState(150_000, 100_000), 'over')

// A finished phase never reads as an alarm in the middle: it ended on, under or over.
assert.equal(budgetState(100_000, 100_000, true), 'onEstimate')
assert.equal(budgetState(99_800, 100_000, true), 'onEstimate')
assert.equal(budgetState(70_000, 100_000, true), 'under', 'finished under the estimate is good news, even at 79%')
assert.equal(budgetState(96_000, 100_000, true), 'under', 'and at 96%, not "near the limit"')
assert.equal(budgetState(103_000, 100_000, true), 'overSlight')
assert.equal(budgetState(130_000, 100_000, true), 'over')

assert.deepEqual(['over', 'overSlight', 'near', 'onEstimate', 'under', 'full', 'ok', 'none'].map((s) => budgetTone(s as never)), ['danger', 'warning', 'warning', 'success', 'success', 'neutral', 'none', 'none'])

// ---- the outlook, built from what is paid (the first project's figures, plus a phase with no estimate and some money in no phase)
const grey = phase({ id: 'brown', budget: 5_000_000 })
const done1 = phase({ id: 'plan', budget: 65_500, done: true })
const open1 = phase({ id: 'site', budget: 3_500 }) // at its estimate, not marked complete
const free = [phase({ id: 'a' }), phase({ id: 'b' }), phase({ id: 'c' })] // no estimate at all
const gone = phase({ id: 'gone', budget: 999, deletedAt: 5 })
const phases = [grey, done1, open1, ...free, gone]
const payments = [
  pay({ phaseId: 'brown', amount: 500_500 }),
  pay({ phaseId: 'plan', amount: 65_500 }),
  pay({ phaseId: 'site', amount: 3_500 }),
  pay({ phaseId: 'a', amount: 40_000 }), // spending on a phase with no estimate
  pay({ amount: 10_000 }), // no phase
  pay({ phaseId: 'brown', amount: 7, status: 'planned' }), // not paid: not counted
  pay({ phaseId: 'brown', amount: 8, deletedAt: 3 }),
  pay({ phaseId: 'brown', amount: 9, paidBy: 'builder', approval: 'pending' }),
]
const o = budgetOutlook(phases, payments, 15_000_000)
assert.equal(o.spent, 619_500, 'everything paid and approved, in a phase or not')
assert.deepEqual([o.spentDone, o.spentOpen, o.outside], [65_500, 544_000, 10_000], 'finished, unfinished (incl. the phase with no estimate) and no phase')
assert.equal(o.estimatedLeft, 4_499_500, 'brown still expects 5,000,000 - 500,500; site is used up; a finished phase expects nothing more')
assert.equal(o.unpriced, 3, 'the three unfinished phases with no estimate; removed phases do not count')
assert.equal(o.headroom, 15_000_000 - 619_500 - 4_499_500, 'the budget less what is spent and what the estimates still expect')
assert.equal(o.headroomEach, Math.round(o.headroom! / 3), 'shared among the phases that have no estimate yet')
assert.equal(o.projectedLow, 619_500 + 4_499_500, 'a lower bound: unpriced phases add nothing until they are paid')
assert.deepEqual([o.done, o.total], [1, 6])
assert.equal(o.state, 'ok')

// No project budget: the spending still adds up, but there is no room to talk about.
const noBudget = budgetOutlook(phases, payments, undefined)
assert.deepEqual([noBudget.budget, noBudget.headroom, noBudget.headroomEach, noBudget.spent], [undefined, undefined, undefined, 619_500])
assert.equal(budgetOutlook(phases, payments, 0).budget, undefined, 'a budget of 0 is none')

// The estimates already reach the budget: short, and nothing to share.
const tight = budgetOutlook(phases, payments, 5_000_000)
assert.ok(tight.headroom! < 0)
assert.equal(tight.headroomEach, undefined)

// No unpriced phases left: nothing to share it among.
const allPriced = budgetOutlook([grey], [pay({ phaseId: 'brown', amount: 100 })], 6_000_000)
assert.deepEqual([allPriced.unpriced, allPriced.headroomEach], [0, undefined])
assert.equal(allPriced.headroom, 6_000_000 - 100 - 4_999_900)

// A phase over its estimate expects nothing more (never a negative amount), and spending is not counted twice.
const over = budgetOutlook([phase({ id: 'x', budget: 100 })], [pay({ phaseId: 'x', amount: 130 })], 1_000)
assert.deepEqual([over.estimatedLeft, over.spent, over.headroom], [0, 130, 870])

// ---- phases at exactly their estimate and not finished
assert.deepEqual(fullPhases(phases, payments).map((p) => p.id), ['site'], 'only unfinished phases at their estimate; a finished one is just finished')

// ---- alerts
const project = { id: 'p1', name: 'Block E', budget: 1_000 } as Project
const name = (p: Phase) => p.id
const alertsFor = (ps: Phase[], pays: Payment[], budget = 1_000, today = '2026-11-20') => buildAlerts({ ...project, budget }, ps, pays, name, today, 'investor')
const ph = (id: string, budget: number, done = false) => phase({ id, budget, done })
const spend = (id: string, amount: number) => pay({ phaseId: id, amount })

const none = alertsFor([ph('a', 100), ph('b', 100), ph('c', 100, true), ph('d', 100)], [spend('a', 60), spend('b', 100), spend('c', 100), spend('d', 130)], 100_000)
assert.deepEqual(none.map((a) => [a.id, a.kind, a.key]), [['ph-over-d', 'error', 'notif.phaseOver']], 'at the estimate (a, b) and finished (c) are quiet; only the clear overspend speaks')
assert.deepEqual(alertsFor([ph('a', 100)], [spend('a', 85)], 100_000).map((a) => [a.id, a.kind, a.key]), [['ph-80-a', 'warning', 'notif.estimate80']])
assert.deepEqual(alertsFor([ph('a', 100)], [spend('a', 103)], 100_000).map((a) => [a.kind, a.key]), [['warning', 'notif.phaseOver']], 'slightly over is amber')
assert.deepEqual(alertsFor([ph('a', 100, true)], [spend('a', 140)], 100_000), [], 'a finished phase is never listed, even over: there is nothing left to do about it')
assert.deepEqual(alertsFor([ph('a', 100, true)], [spend('a', 99)], 100_000), [], 'finished at 99% is not "near the limit"')

// The project's own figure is a working estimate: passing it asks for a decision, and is red only when the overspend is clear.
assert.deepEqual(alertsFor([], [pay({ amount: 700 })], 1_000), [], 'under 80%')
assert.deepEqual(alertsFor([], [pay({ amount: 850 })], 1_000).map((a) => [a.id, a.kind, a.key]), [['proj-80', 'warning', 'notif.budget80']])
assert.deepEqual(alertsFor([], [pay({ amount: 1_000 })], 1_000), [], 'exactly the budget: nothing to flag')
assert.deepEqual(alertsFor([], [pay({ amount: 1_030 })], 1_000).map((a) => [a.id, a.kind, a.key, a.to]), [['proj-over', 'warning', 'notif.projectOver', '/phases']])
assert.deepEqual(alertsFor([], [pay({ amount: 1_200 })], 1_000).map((a) => [a.id, a.kind]), [['proj-over', 'error']])
assert.equal(alertsFor([], [pay({ amount: 5_000 })], 0).length, 0, 'no project budget, no budget alert')
assert.equal(alertsFor([], [pay({ amount: 1_200 })], 1_000)[0].vars.amount, 'Rs 200', 'it says by how much')

console.log('budget outlook: all checks passed')
