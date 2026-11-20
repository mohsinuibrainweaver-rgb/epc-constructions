// Checks the Ledger's sort and its summary figures, and the spending trend used on Reports.
// Run: npx vite-node scripts/ledger-test.ts
import assert from 'node:assert/strict'
import { ledgerTotals, sortPayments } from '../src/lib/ledger'
import { spendingTrend } from '../src/lib/trend'
import type { Payment } from '../src/db/types'

let n = 0
const pay = (o: Partial<Payment>): Payment =>
  ({ id: `p${++n}`, projectId: 'p1', date: '2026-11-01', amount: 1000, category: 'labour', purpose: 'x', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'A', createdAt: n, updatedAt: n, ...o }) as Payment

// ---- sort
const a = pay({ id: 'a', date: '2026-11-05', amount: 500 })
const b = pay({ id: 'b', date: '2026-11-01', amount: 9000 })
const c = pay({ id: 'c', date: '2026-11-05', amount: 500 }) // same day and amount as a, added later
const d = pay({ id: 'd', date: '2026-10-20', amount: 70 })
const rows = [a, b, c, d]
const ids = (s: Parameters<typeof sortPayments>[1]) => sortPayments(rows, s).map((p) => p.id)
assert.deepEqual(ids('newest'), ['c', 'a', 'b', 'd'], 'newest date first; the one added later first on the same day')
assert.deepEqual(ids('oldest'), ['d', 'b', 'a', 'c'])
assert.deepEqual(ids('largest'), ['b', 'c', 'a', 'd'], 'biggest first; equal amounts: later date first, then the one added later')
assert.deepEqual(ids('smallest'), ['d', 'c', 'a', 'b'])
assert.deepEqual(rows.map((p) => p.id), ['a', 'b', 'c', 'd'], 'the input is not changed')

// ---- totals
const t = ledgerTotals([
  pay({ amount: 1000 }),
  pay({ amount: 500, status: 'advance' }),
  pay({ amount: 300, status: 'planned' }),
  pay({ amount: 200, status: 'planned' }),
  pay({ amount: 40, paidBy: 'builder', approval: 'pending' }),
  pay({ amount: 7, paidBy: 'builder', approval: 'rejected' }),
  pay({ amount: 9, status: 'skipped' }),
  pay({ amount: 11, deletedAt: 3 }),
])
assert.deepEqual(t, { paid: 1500, planned: 500, awaiting: 40, count: 8 }, 'paid and advance count; rejected, skipped and removed add to nothing')
assert.deepEqual(ledgerTotals([]), { paid: 0, planned: 0, awaiting: 0, count: 0 })

// ---- trend
assert.deepEqual(spendingTrend([], '2026-11'), [])
assert.deepEqual(spendingTrend([pay({ status: 'skipped' }), pay({ deletedAt: 1 }), pay({ paidBy: 'builder', approval: 'pending' })], '2026-11'), [], 'nothing paid or planned')
const tr = spendingTrend(
  [
    pay({ date: '2026-09-10', amount: 100 }),
    pay({ date: '2026-09-25', amount: 50, status: 'advance' }),
    pay({ date: '2026-11-02', amount: 400 }),
    pay({ date: '2026-12-15', amount: 300, status: 'planned' }),
    pay({ date: '2027-01-05', amount: 200, status: 'planned' }),
  ],
  '2026-11',
)
assert.deepEqual(tr.map((x) => x.month), ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01'], 'a month with nothing is still a point, across the year end')
assert.deepEqual(tr.map((x) => x.spent), [150, 150, 550, 550, 550], 'cumulative; flat when nothing is paid')
assert.deepEqual(tr.map((x) => x.withPlanned), [150, 150, 550, 850, 1050], 'the forecast adds the planned payments in their months')
assert.deepEqual(tr.map((x) => x.future), [false, false, false, true, true])
// An overdue planned payment (dated in the past) is counted in its own month.
const od = spendingTrend([pay({ date: '2026-10-03', amount: 100 }), pay({ date: '2026-10-20', amount: 60, status: 'planned' })], '2026-11')
assert.deepEqual(od.map((x) => [x.month, x.spent, x.withPlanned]), [['2026-10', 100, 160], ['2026-11', 100, 160]])
// Only planned payments, all in the future.
assert.deepEqual(spendingTrend([pay({ date: '2027-02-01', amount: 9, status: 'planned' })], '2026-11').length, 4, 'from the first payment month to the last: Nov, Dec, Jan, Feb')
// A single month.
assert.deepEqual(spendingTrend([pay({ date: '2026-11-05', amount: 5 })], '2026-11').map((x) => x.spent), [5])

console.log('ledger and trend: all checks passed')
