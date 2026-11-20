// Checks the small figures the project form shows. Run: npx vite-node scripts/project-plan-test.ts
import assert from 'node:assert/strict'
import { budgetPerSqft, plannedDays, plannedSpan } from '../src/lib/project-plan'

assert.equal(plannedDays('2026-01-01', '2026-01-31'), 30)
assert.equal(plannedDays('2026-01-01', '2026-01-01'), 0)
assert.equal(plannedDays('2026-01-10', '2026-01-01'), undefined, 'a finish before the start is not a span')
assert.equal(plannedDays('', '2026-01-01'), undefined)
assert.equal(plannedDays('2026-01-01', ''), undefined)
// Daylight-saving changes cannot shift the count: days are counted on UTC dates.
assert.equal(plannedDays('2026-03-01', '2026-04-01'), 31)
assert.equal(plannedDays('2026-10-01', '2026-11-05'), 35)

assert.deepEqual(plannedSpan(30), { days: 30 })
assert.deepEqual(plannedSpan(44), { days: 44 })
assert.deepEqual(plannedSpan(45), { months: 1 })
assert.deepEqual(plannedSpan(365), { months: 12 })
assert.deepEqual(plannedSpan(548), { months: 18 })

assert.equal(budgetPerSqft(9_000_000, 1800), 5000)
assert.equal(budgetPerSqft(0, 1800), undefined)
assert.equal(budgetPerSqft(9_000_000, 0), undefined)

console.log('project plan: all checks passed')
