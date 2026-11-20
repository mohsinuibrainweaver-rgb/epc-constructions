// Checks the money logic (settlement and weekly plans). Run: npx vite-node scripts/money-test.ts
import assert from 'node:assert/strict'
import { computeFee, computeSettlement, retainerMonths } from '../src/lib/settlement'
import { deterministicId, planDueDates, weekdayOf } from '../src/lib/plans'
import { approvalFields, needsApproval } from '../src/lib/approval'
import { isAwaitingApproval, isRejected, isSpent } from '../src/lib/stats'

const pay = (o: Record<string, unknown>) => ({ id: Math.random().toString(), projectId: 'p', date: '2026-11-01', category: 'material', purpose: 'x', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: '', createdAt: 0, updatedAt: 0, ...o }) as never
const tr = (kind: string, amount: number, o: Record<string, unknown> = {}) => ({ id: Math.random().toString(), projectId: 'p', date: '2026-11-01', kind, amount, createdAt: 0, updatedAt: 0, ...o }) as never

// 1. Investor gives an advance, builder spends part of it: builder still holds the rest.
let s = computeSettlement({ feeBasis: 'tbd' }, [pay({ amount: 60000, paidBy: 'builder' }), pay({ amount: 40000 })], [tr('advance', 100000)])
assert.equal(s.constructionCost, 100000)
assert.equal(s.paidByBuilder, 60000)
assert.equal(s.paidByInvestor, 40000)
assert.equal(s.builderBalance, -40000, 'builder holds 40,000 of the advance')
assert.equal(s.feeEarned, undefined, 'fee blank until decided')
assert.equal(s.totalDue, -40000)

// 2. He gives back the rest: settled.
s = computeSettlement({ feeBasis: 'tbd' }, [pay({ amount: 60000, paidBy: 'builder' })], [tr('advance', 100000), tr('return', 40000)])
assert.equal(s.builderBalance, 0)

// 3. Builder pays out of his own pocket, investor reimburses part.
s = computeSettlement({ feeBasis: 'tbd' }, [pay({ amount: 30000, paidBy: 'builder' })], [tr('reimbursement', 10000)])
assert.equal(s.builderBalance, 20000, 'investor still owes 20,000')

// 4. Planned, skipped and binned payments never count as spent.
s = computeSettlement({ feeBasis: 'tbd' }, [pay({ amount: 5, status: 'planned' }), pay({ amount: 7, status: 'skipped' }), pay({ amount: 9, deletedAt: 1 }), pay({ amount: 100, status: 'advance' })], [])
assert.equal(s.constructionCost, 100)

// 5. Fee: fixed, percentage of cost, and paid part.
s = computeSettlement({ feeBasis: 'fixed', feeAmount: 500000 }, [pay({ amount: 1000000 })], [tr('fee', 200000)])
assert.equal(s.feeEarned, 500000); assert.equal(s.feeOutstanding, 300000); assert.equal(s.totalDue, 300000)
s = computeSettlement({ feeBasis: 'percent', feePercent: 5 }, [pay({ amount: 1_000_000 })], [])
assert.equal(s.feeEarned, 50000)
s = computeSettlement({ feeBasis: 'percent', feePercent: 5 }, [pay({ amount: 1_000_000, paidBy: 'builder' })], [tr('advance', 400000), tr('fee', 10000), tr('fee', 5000, { deletedAt: 5 })])
assert.equal(s.builderBalance, 600000); assert.equal(s.feeOutstanding, 40000); assert.equal(s.totalDue, 640000, 'binned transfers are ignored')

// 6. Weekly plan dates: Thursday plan opened on Sunday 15 Nov 2026.
assert.equal(weekdayOf('2026-11-19'), 4)
assert.deepEqual(planDueDates({ weekday: 4, startDate: '2026-11-10' }, '2026-11-15'), ['2026-11-12', '2026-11-19'])
assert.deepEqual(planDueDates({ weekday: 4, startDate: '2026-11-10', generatedThrough: '2026-11-19' }, '2026-11-15'), [], 'nothing new until the horizon moves')
assert.deepEqual(planDueDates({ weekday: 4, startDate: '2026-11-10', generatedThrough: '2026-11-19' }, '2026-11-20'), ['2026-11-26'])
assert.equal(planDueDates({ weekday: 4, startDate: '2024-01-01' }, '2026-11-15').length, 5, 'long-idle plan catches up 4 weeks at most')
assert.deepEqual(planDueDates({ weekday: 4, startDate: '2026-12-01' }, '2026-11-15'), [], 'a plan that starts later creates nothing yet')

// 7. Two phones building the same payment get the same id.
const a = await deterministicId('plan-1:2026-11-19'); const b = await deterministicId('plan-1:2026-11-19'); const c = await deterministicId('plan-1:2026-11-26')
assert.equal(a, b); assert.notEqual(a, c); assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

// 8. Approval: the builder's paid entries wait for the investor and are not counted until approved.
const pending = pay({ amount: 70000, paidBy: 'builder', approval: 'pending' })
const approved = pay({ amount: 30000, paidBy: 'builder', approval: 'approved' })
const rejected = pay({ amount: 5000, paidBy: 'builder', approval: 'rejected' })
const plain = pay({ amount: 20000 }) // the investor's own entry: no approval field, counts at once
assert.equal(isSpent(pending), false); assert.equal(isSpent(rejected), false); assert.equal(isSpent(approved), true); assert.equal(isSpent(plain), true)
assert.equal(isAwaitingApproval(pending), true); assert.equal(isAwaitingApproval(approved), false); assert.equal(isRejected(rejected), true)
assert.equal(isSpent(pay({ amount: 1, approval: 'approved', deletedAt: 5 })), false, 'binned stays out')
s = computeSettlement({ feeBasis: 'percent', feePercent: 10 }, [pending, approved, rejected, plain], [tr('advance', 100000)])
assert.equal(s.constructionCost, 50000, 'only approved and the investor\'s own entries count')
assert.equal(s.paidByBuilder, 30000); assert.equal(s.builderBalance, -70000); assert.equal(s.feeEarned, 5000)
assert.equal(needsApproval('builder', 'paid'), true); assert.equal(needsApproval('builder', 'advance'), true)
assert.equal(needsApproval('builder', 'planned'), false, 'a planned payment is not spent yet'); assert.equal(needsApproval('investor', 'paid'), false)
assert.deepEqual(approvalFields('builder', 'paid', { approval: 'approved', approvedBy: 'A', approvedAt: 1 }), { approval: 'pending', approvedBy: undefined, approvedAt: undefined, rejectReason: undefined }, 'a builder edit is checked again')
assert.deepEqual(approvalFields('builder', 'paid', { approval: 'rejected', rejectReason: 'wrong amount' }).rejectReason, undefined, 'resubmitting clears the reason')
assert.equal(approvalFields('investor', 'paid', { approval: 'approved', approvedBy: 'A' }).approval, 'approved', 'the investor keeps it as is')
assert.equal(approvalFields('investor', 'paid').approval, undefined)

// 9. Monthly retainer: each month that has started counts in full, from the start month to the end (or today).
assert.equal(retainerMonths('2026-11-01', undefined, '2026-11-15'), 1, 'the start month counts at once')
assert.equal(retainerMonths('2026-11-20', undefined, '2026-12-01'), 2)
assert.equal(retainerMonths('2026-11-01', undefined, '2027-01-31'), 3, 'across the new year')
assert.equal(retainerMonths('2026-12-01', undefined, '2026-11-15'), 0, 'not started yet')
assert.equal(retainerMonths('2026-11-01', '2026-12-31', '2027-03-10'), 2, 'stops at the end date')
assert.equal(retainerMonths('2026-11-01', '2027-06-30', '2026-12-05'), 2, 'an end in the future changes nothing yet')
assert.equal(retainerMonths(undefined, undefined, '2026-11-15'), 0)
let f = computeFee({ feeBasis: 'retainer', retainerAmount: 100_000, retainerStart: '2026-09-10' }, [], [], '2026-11-15')
assert.deepEqual([f.earned, f.months], [300_000, 3])
s = computeSettlement({ feeBasis: 'retainer', retainerAmount: 100_000, retainerStart: '2026-09-10' }, [pay({ amount: 50_000 })], [tr('fee', 120_000)], [], '2026-11-15')
assert.equal(s.feeEarned, 300_000); assert.equal(s.feeOutstanding, 180_000); assert.equal(s.totalDue, 180_000, 'the retainer does not depend on the cost')

// 10. Fee per phase: a fixed fee needs the phase complete, a percentage accrues on approved cost.
const phase = (o: Record<string, unknown>) => ({ id: Math.random().toString(), projectId: 'p', order: 0, createdAt: 0, updatedAt: 0, ...o }) as never
const ph1 = phase({ id: 'a', feeKind: 'fixed', feeValue: 200_000 })
const ph2 = phase({ id: 'b', feeKind: 'fixed', feeValue: 150_000, done: true })
const ph3 = phase({ id: 'c', feeKind: 'percent', feeValue: 10 })
const ph4 = phase({ id: 'd', feeKind: null, feeValue: null })
const ph5 = phase({ id: 'e', feeKind: 'percent', feeValue: 50, deletedAt: 3 })
const ph6 = phase({ id: 'f', feeKind: 'fixed', feeValue: 0, done: true })
const spendings = [pay({ amount: 300_000, phaseId: 'c' }), pay({ amount: 100_000, phaseId: 'c' }), pay({ amount: 900_000, phaseId: 'c', paidBy: 'builder', approval: 'pending' }), pay({ amount: 77, phaseId: 'a' }), pay({ amount: 55, phaseId: 'zz' })]
f = computeFee({ feeBasis: 'perPhase' }, [ph1, ph2, ph3, ph4, ph5, ph6], spendings, '2026-11-15')
assert.deepEqual(f.lines.map((l) => [l.phaseId, l.earned, l.counted]), [['a', 0, false], ['b', 150_000, true], ['c', 40_000, true]], 'incomplete fixed earns nothing yet; pending cost is not counted; removed, empty and deleted are skipped')
assert.equal(f.earned, 190_000); assert.equal(f.lines[2].cost, 400_000)
Object.assign(ph1 as object, { done: true })
assert.equal(computeFee({ feeBasis: 'perPhase' }, [ph1, ph2, ph3], spendings, '2026-11-15').earned, 390_000, 'completing a phase earns its fixed fee')
s = computeSettlement({ feeBasis: 'perPhase' }, spendings, [tr('fee', 100_000)], [ph1, ph2, ph3], '2026-11-15')
assert.deepEqual([s.feeEarned, s.feePaid, s.feeOutstanding], [390_000, 100_000, 290_000])
assert.equal(computeFee({ feeBasis: 'perPhase' }, [], [], '2026-11-15').earned, 0, 'no phase fees set: nothing earned')
assert.equal(computeFee({ feeBasis: 'tbd' }, [ph1], spendings, '2026-11-15').earned, undefined, 'still decided at the end')
assert.equal(computeSettlement({ feeBasis: 'fixed', feeAmount: 5 }, [], []).feeEarned, 5, 'old callers without phases still work')
console.log('money logic: all checks passed')
