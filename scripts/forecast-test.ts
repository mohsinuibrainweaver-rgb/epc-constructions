// Checks the cash forecast: what the coming weeks will cost.
// Run: npx vite-node scripts/forecast-test.ts
import assert from 'node:assert/strict'
import { cashAdvice, forecast } from '../src/lib/forecast'
import type { Contract, Payment, PaymentPlan } from '../src/db/types'

let n = 0
const TODAY = '2026-11-20' // a Friday
const pay = (o: Partial<Payment>): Payment =>
  ({ id: `p${++n}`, projectId: 'x', date: '2026-11-25', amount: 100, category: 'labour', purpose: 'x', status: 'planned', mode: 'cash', paidBy: 'investor', addedBy: 'investor', createdAt: n, updatedAt: n, ...o }) as Payment
const plan = (o: Partial<PaymentPlan>): PaymentPlan =>
  ({ id: `pl${++n}`, projectId: 'x', purpose: 'Weekly', amount: 1000, weekday: 4, category: 'labour', mode: 'cash', paidBy: 'investor', startDate: '2026-10-01', active: true, createdAt: n, updatedAt: n, ...o }) as PaymentPlan
const contract = (o: Partial<Contract>): Contract =>
  ({ id: `c${++n}`, projectId: 'x', title: 'T', amount: 1000, date: '2026-01-01', status: 'active', variations: [], createdAt: n, updatedAt: n, ...o }) as Contract
const run = (o: Partial<Parameters<typeof forecast>[0]>) => forecast({ payments: [], plans: [], contracts: [], today: TODAY, ...o })

// ---- planned payments: overdue, this week, later weeks, beyond the weeks
let f = run({
  payments: [
    pay({ date: '2026-11-15', amount: 500 }), // overdue
    pay({ date: '2026-11-20', amount: 200 }), // today: week 0, not overdue
    pay({ date: '2026-11-26', amount: 300 }), // week 0 (day 6)
    pay({ date: '2026-11-27', amount: 400 }), // week 1 (day 7)
    pay({ date: '2026-12-25', amount: 600, paidBy: 'builder' }), // day 35: week 5
    pay({ date: '2027-06-01', amount: 900 }), // beyond 12 weeks
    pay({ date: '2026-11-22', amount: 50, status: 'paid' }), // not planned
    pay({ date: '2026-11-22', amount: 60, status: 'skipped' }),
    pay({ date: '2026-11-22', amount: 70, deletedAt: 5 }),
  ],
})
assert.equal(f.overdue, 500)
assert.deepEqual(f.weeks.slice(0, 2).map((w) => [w.start, w.end, w.scheduled]), [['2026-11-20', '2026-11-26', 500], ['2026-11-27', '2026-12-03', 400]], 'weeks start today and run seven days; the overdue one is not in a week')
assert.equal(f.weeks[5].scheduled, 600)
assert.equal(f.weeks.length, 12)
assert.equal(f.later, 900, 'beyond the weeks shown')
assert.equal(f.next7, 500 + 200 + 300, 'overdue plus the first 7 days (today to day 6)')
assert.equal(f.next30, 500 + 200 + 300 + 400, 'overdue plus the first 30 days; the one on day 35 is outside')
assert.deepEqual([f.builderNext30, f.investorNext30], [0, 1400], 'who pays what in the next 30 days')
assert.deepEqual(f.items.map((i) => i.amount), [500, 200, 300, 400, 600], 'oldest first, inside the weeks only')
assert.equal(f.items[0].overdue, true)

// ---- a weekly plan: Thursdays (weekday 4). The app creates one a week ahead; the rest are expected.
const pl = plan({ id: 'PL', weekday: 4, amount: 1000 })
f = run({ plans: [pl], payments: [pay({ planId: 'PL', date: '2026-11-26', amount: 1000 })] })
const exp = f.items.filter((i) => i.kind === 'expected')
assert.equal(exp[0].date, '2026-12-03', '26 Nov already exists as a planned payment, so the first expected one is the next Thursday')
assert.equal(exp.length, 11, 'Thursdays 3 Dec ... 11 Feb inside 12 weeks (from 20 Nov to 11 Feb), without the existing one')
assert.ok(exp.every((i) => i.date >= '2026-12-03' && i.amount === 1000))
assert.equal(f.weeks[1].expected, 1000)
assert.equal(f.weeks[0].scheduled, 1000, 'the created one counts as scheduled')
assert.equal(f.weeks[0].expected, 0)

// A payment already made, skipped or removed for that day is never expected again.
for (const status of [{ status: 'paid' as const }, { status: 'skipped' as const }, { deletedAt: 3 }]) {
  f = run({ plans: [pl], payments: [pay({ planId: 'PL', date: '2026-12-03', ...status })] })
  assert.ok(!f.items.some((i) => i.kind === 'expected' && i.date === '2026-12-03'), JSON.stringify(status))
}

// An inactive, removed or not-yet-started plan; a plan starting later.
assert.equal(run({ plans: [plan({ active: false })] }).items.length, 0)
assert.equal(run({ plans: [plan({ deletedAt: 1 })] }).items.length, 0)
f = run({ plans: [plan({ weekday: 4, startDate: '2026-12-15' })] })
assert.equal(f.items.filter((i) => i.kind === 'expected')[0].date, '2026-12-17', 'from its start date')
// The plan's payer carries through.
f = run({ plans: [plan({ paidBy: 'builder' })] })
assert.ok(f.builderNext30 > 0 && f.investorNext30 === 0)

// ---- contracts: what is left and not yet planned
const c1 = contract({ id: 'c1', amount: 1000 })
const c2 = contract({ id: 'c2', amount: 500, status: 'completed' })
const c3 = contract({ id: 'c3', amount: 300, deletedAt: 1 })
const c4 = contract({ id: 'c4', amount: 200 }) // overpaid below
f = run({
  contracts: [c1, c2, c3, c4],
  payments: [
    pay({ contractId: 'c1', status: 'paid', amount: 400 }),
    pay({ contractId: 'c1', status: 'planned', amount: 100, date: '2026-12-01' }),
    pay({ contractId: 'c1', status: 'paid', amount: 50, paidBy: 'builder', approval: 'pending' }),
    pay({ contractId: 'c4', status: 'paid', amount: 250 }),
  ],
})
assert.deepEqual(f.unscheduled.map((u) => [u.contract.id, u.amount]), [['c1', 450]], '1000 - 400 paid - 100 planned - 50 waiting; completed, removed and overpaid ones have none')
assert.equal(f.unscheduledTotal, 450)

// ---- empty
f = run({})
assert.deepEqual([f.overdue, f.next7, f.next30, f.later, f.unscheduledTotal, f.items.length], [0, 0, 0, 0, 0, 0])

// ---- cash advice: what the builder holds against what he must pay
assert.deepEqual(cashAdvice(-938500, 1036000), { holds: 938500, needs: 1036000, topUp: 97500, leftOver: 0 }, 'the builder holds 938,500 and must pay 1,036,000: send 97,500')
assert.deepEqual(cashAdvice(-500, 200), { holds: 500, needs: 200, topUp: 0, leftOver: 300 })
assert.deepEqual(cashAdvice(300, 200), { holds: 0, needs: 200, topUp: 200, leftOver: 0 }, 'the investor owes the builder: he holds nothing')
assert.deepEqual(cashAdvice(0, 0), { holds: 0, needs: 0, topUp: 0, leftOver: 0 })

console.log('forecast: all checks passed')
