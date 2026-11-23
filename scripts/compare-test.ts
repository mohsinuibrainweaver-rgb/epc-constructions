// Checks the rules of the project comparison page.
// Run: npx vite-node scripts/compare-test.ts
import assert from 'node:assert/strict'
import {
  comparePace, comparePhases, compareCategories, compareMaterials, delta, monthsSince, NO_PHASE, paceAt, paceSeries, perAreaBasis, phaseIdentity, phaseInsights, summarizeSide,
  type Side,
} from '../src/lib/compare'
import type { MaterialUnit, Payment, Phase } from '../src/db/types'

let n = 0
const ph = (o: Partial<Phase>): Phase => ({ id: `ph${++n}`, projectId: 'x', order: n, createdAt: n, updatedAt: n, ...o }) as Phase
const pay = (o: Partial<Payment>): Payment =>
  ({ id: `p${++n}`, projectId: 'x', date: '2026-01-10', amount: 100, category: 'labour', purpose: 'x', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'investor', createdAt: n, updatedAt: n, ...o }) as Payment
// A material purchase is a payment with a quantity and a unit; `item` is its purpose.
const mat = (o: { item?: string; quantity?: number; unit?: MaterialUnit; amount?: number; deletedAt?: number }): Payment => {
  const { item, ...rest } = o
  return pay({ category: 'material', purpose: item ?? 'Cement', quantity: 10, unit: 'bag', amount: 1000, ...rest })
}
const side = (name: string, o: Partial<Side> & { area?: number; start?: string; budget?: number }): Side => ({
  project: { id: name, name, startDate: o.start, coveredArea: o.area, budget: o.budget },
  payments: o.payments ?? [],
  phases: o.phases ?? [],
})

// ---- delta and identity
assert.deepEqual(delta(100, 120), { delta: 20, pct: 20 })
assert.deepEqual(delta(200, 150), { delta: -50, pct: -25 })
assert.deepEqual(delta(0, 50), { delta: 50, pct: undefined }, 'nothing to compare with')
assert.equal(delta(3, 4).pct, 33, 'rounded')
assert.equal(phaseIdentity({ key: 'grey', name: 'Whatever' }), 'grey')
assert.equal(phaseIdentity({ key: undefined, name: '  Boundary Wall ' }), 'name:boundary wall')

// ---- phases: the same standard phase in both, a custom phase by name
const aGrey = ph({ id: 'aG', key: 'grey', order: 0, done: true })
const aSite = ph({ id: 'aS', key: 'site', order: 1, done: true })
const aWall = ph({ id: 'aW', key: undefined, name: 'Boundary wall', order: 2 })
const aGone = ph({ id: 'aX', key: 'paint', order: 3, deletedAt: 9 })
const bGrey = ph({ id: 'bG', key: 'grey', order: 0 }) // not complete yet
const bSite = ph({ id: 'bS', key: 'site', order: 1, done: true })
const bWall = ph({ id: 'bW', name: 'boundary WALL', order: 2, done: true })
const bPool = ph({ id: 'bP', name: 'Swimming pool', order: 3 })
const A = side('A', {
  phases: [aGrey, aSite, aWall, aGone],
  payments: [
    pay({ phaseId: 'aG', amount: 1000 }), pay({ phaseId: 'aG', amount: 500, status: 'advance' }), pay({ phaseId: 'aG', amount: 99, status: 'planned' }),
    pay({ phaseId: 'aS', amount: 300 }), pay({ phaseId: 'aW', amount: 200 }),
    pay({ phaseId: 'aX', amount: 40 }), // its phase was removed: money outside any phase
    pay({ amount: 60 }), // no phase
    pay({ phaseId: 'aG', amount: 8, deletedAt: 3 }),
  ],
})
const B = side('B', {
  phases: [bGrey, bSite, bWall, bPool],
  payments: [pay({ phaseId: 'bG', amount: 1800 }), pay({ phaseId: 'bS', amount: 250 }), pay({ phaseId: 'bW', amount: 260 }), pay({ phaseId: 'bP', amount: 700 }), pay({ phaseId: 'bG', amount: 5, paidBy: 'builder', approval: 'pending' })],
})
const rows = comparePhases(A, B)
assert.deepEqual(rows.map((r) => [r.id, r.a, r.b]), [['grey', 1500, 1800], ['site', 300, 250], ['name:boundary wall', 200, 260], ['name:swimming pool', 0, 700], [NO_PHASE, 100, 0]], 'A order first, then B-only phases, then money with no phase; planned, waiting and removed add nothing')
assert.equal(rows[3].inA, false, 'the pool exists only in B')
assert.equal(rows[0].doneA, true)
assert.equal(rows[0].doneB, false)

// Per square foot: each project is divided by its own area.
const basis = perAreaBasis({ coveredArea: 1000 }, { coveredArea: 2000 })!
assert.deepEqual(comparePhases(A, B, basis).slice(0, 2).map((r) => [r.a, r.b]), [[1.5, 0.9], [0.3, 0.125]])
assert.equal(perAreaBasis({ coveredArea: 1000 }, { coveredArea: undefined }), undefined, 'one project without an area: no per sq ft')
assert.equal(perAreaBasis({ coveredArea: 0 }, { coveredArea: 10 }), undefined)

// Phases with no spending are left out.
assert.equal(comparePhases(side('A', { phases: [aGrey] }), side('B', { phases: [bGrey] })).length, 0)

// ---- categories
const cats = compareCategories(
  side('A', { payments: [pay({ category: 'material', amount: 400 }), pay({ category: 'labour', amount: 100 }), pay({ category: 'misc', amount: 7, status: 'planned' })] }),
  side('B', { payments: [pay({ category: 'material', amount: 500 }), pay({ category: 'fees', amount: 50 })] }),
)
assert.deepEqual(cats.map((c) => [c.category, c.a, c.b]), [['material', 400, 500], ['labour', 100, 0], ['fees', 0, 50]], 'in the usual category order; empty categories left out')

// ---- summary
const sum = summarizeSide(side('A', { area: 2000, budget: 5000, payments: [pay({ date: '2026-03-05', amount: 600 }), pay({ date: '2026-02-01', amount: 400 }), pay({ date: '2026-04-01', amount: 1, status: 'planned' })] }))
assert.deepEqual(sum, { spent: 1000, perArea: 0.5, budget: 5000, plotCost: undefined, area: 2000, start: '2026-02-01', lastPaid: '2026-03-05' }, 'with no start date the first paid day is the start')
assert.equal(summarizeSide(side('A', { start: '2026-01-01', payments: [pay({ date: '2026-03-05' })] })).start, '2026-01-01')
assert.equal(summarizeSide(side('A', {})).perArea, undefined)

// ---- pace
assert.equal(monthsSince('2026-01-01', '2026-01-31'), 0)
assert.equal(monthsSince('2026-01-01', '2026-02-05'), 1)
assert.equal(monthsSince('2026-01-01', '2026-12-31'), 11)
assert.equal(monthsSince('2026-03-01', '2026-01-01'), 0, 'before the start counts as the first month')
const finished = side('A', { start: '2026-01-01', payments: [pay({ date: '2026-01-15', amount: 100 }), pay({ date: '2026-03-10', amount: 300 }), pay({ date: '2026-03-20', amount: 100 }), pay({ date: '2026-05-01', amount: 50, status: 'planned' })] })
const sA = paceSeries(finished, '2027-01-01')
assert.deepEqual(sA, [100, 100, 500], 'cumulative by month; a project paid long ago stops at its last payment')
assert.equal(paceAt(sA, 7), 500, 'the total stays after the series ends')
assert.equal(paceAt([], 3), 0)
const running = side('B', { start: '2026-09-01', payments: [pay({ date: '2026-09-10', amount: 200 }), pay({ date: '2026-10-25', amount: 100 })] })
assert.deepEqual(paceSeries(running, '2026-11-20'), [200, 300, 300], 'a project paid recently goes on to today (month 2 since 2026-09-01)')
assert.deepEqual(paceSeries(running, '2026-12-05'), [200, 300, 300, 300], 'and further when today moves on, while still within 45 days of its last payment')
assert.deepEqual(paceSeries(running, '2027-06-01'), [200, 300], 'once the last payment is old, it stops')
assert.deepEqual(paceSeries(side('x', { start: '2026-01-01' }), '2026-02-01'), [], 'nothing paid: no line')
assert.deepEqual(paceSeries(finished, '2027-01-01', 10), [10, 10, 50], 'per sq ft divides')
const pc = comparePace(sA, paceSeries(running, '2026-11-20'))!
assert.deepEqual(pc, { month: 2, a: 500, b: 300 }, "B's current month, and what A had spent by then")
assert.equal(comparePace([], [1]), undefined)

// ---- materials: same item and unit, average rate paid
const ma = [mat({ item: 'Cement', quantity: 100, unit: 'bag', rate: 1300, amount: 130000 }), mat({ item: 'cement ', quantity: 100, unit: 'bag', rate: 1500, amount: 150000 }), mat({ item: 'Sand', quantity: 10, unit: 'trip', rate: 8000, amount: 80000 }), mat({ item: 'Bricks', quantity: 1000, unit: 'piece', rate: 16, amount: 16000 }), mat({ item: 'Steel', unit: 'ton', quantity: 1, rate: 250000, amount: 250000, deletedAt: 5 })]
const mb = [mat({ item: 'Cement', quantity: 50, unit: 'bag', rate: 1540, amount: 77000 }), mat({ item: 'Sand', quantity: 4, unit: 'ton', rate: 9000, amount: 36000 }), mat({ item: 'Bricks', quantity: 2000, unit: 'piece', rate: 17.6, amount: 35200 }), mat({ item: 'Steel', unit: 'ton', quantity: 1, rate: 260000, amount: 260000 })]
const mr = compareMaterials(ma, mb)
assert.deepEqual(mr.map((r) => [r.item, r.rateA, r.rateB, r.pct]), [['Cement', 1400, 1540, 10], ['Bricks', 16, 17.6, 10]], 'matched by item and unit; Sand is a different unit; Steel was removed in A. Largest B spend first')
assert.deepEqual(compareMaterials([], mb), [])

// ---- insights
const ins = phaseInsights([
  { id: 'a', phase: undefined, a: 100, b: 300, inA: true, inB: true, doneA: true, doneB: false }, // +200, unfinished in B, still "higher"
  { id: 'b', phase: undefined, a: 100, b: 150, inA: true, inB: true, doneA: true, doneB: true }, // +50
  { id: 'c', phase: undefined, a: 400, b: 300, inA: true, inB: true, doneA: true, doneB: true }, // -100, cheaper
  { id: 'd', phase: undefined, a: 400, b: 100, inA: true, inB: true, doneA: true, doneB: false }, // not finished: not called cheaper
  { id: 'e', phase: undefined, a: 0, b: 500, inA: false, inB: true, doneA: false, doneB: true }, // only in B: not compared
  { id: NO_PHASE, phase: undefined, a: 10, b: 900, inA: true, inB: true, doneA: false, doneB: false },
], 3)
assert.deepEqual(ins.higher.map((x) => x.row.id), ['a', 'b'])
assert.deepEqual(ins.lower.map((x) => [x.row.id, x.d.pct]), [['c', -25]])

console.log('compare: all checks passed')

// ---- sorting the phase rows, and the average price change
import { averageRateChange, sortPhaseRows } from '../src/lib/compare'
const r = (id: string, a: number, b: number) => ({ id, phase: undefined, a, b, inA: true, inB: true, doneA: true, doneB: true })
const sortIn = [r('x', 100, 120), r('y', 100, 400), r(NO_PHASE, 0, 900), r('z', 500, 100)]
assert.deepEqual(sortPhaseRows(sortIn, 'order').map((q) => q.id), ['x', 'y', NO_PHASE, 'z'], 'order: as given')
assert.deepEqual(sortPhaseRows(sortIn, 'difference').map((q) => q.id), ['z', 'y', 'x', NO_PHASE], 'biggest difference first, in either direction; no phase stays last')
assert.deepEqual(sortIn.map((q) => q.id), ['x', 'y', NO_PHASE, 'z'], 'the input is not changed')
const mrow = (pct: number | undefined, spentB: number) => ({ key: 'k', item: 'i', unit: 'bag' as const, rateA: 1, rateB: 1, pct, spentB })
assert.equal(averageRateChange([mrow(10, 100), mrow(20, 300)]), 18, 'weighted by what was spent: (10*100 + 20*300) / 400')
assert.equal(averageRateChange([mrow(undefined, 100), mrow(-10, 100)]), -10, 'a row with nothing to compare with is ignored')
assert.equal(averageRateChange([]), undefined)
console.log('compare: sort and average checks passed')
