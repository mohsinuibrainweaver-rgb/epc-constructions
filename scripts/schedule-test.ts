// Checks how a contract's remaining money is split into dated instalments.
// Run: npx vite-node scripts/schedule-test.ts
import assert from 'node:assert/strict'
import { addMonths, firstInstalmentDay, instalmentDates, proposeInstalments, splitAmount } from '../src/lib/schedule'

// ---- months
assert.equal(addMonths('2026-01-31', 1), '2026-02-28', '31 Jan + 1 month is the last day of February')
assert.equal(addMonths('2028-01-31', 1), '2028-02-29', 'a leap year')
assert.equal(addMonths('2026-11-20', 1), '2026-12-20')
assert.equal(addMonths('2026-12-15', 1), '2027-01-15', 'over the year end')
assert.equal(addMonths('2026-11-20', 14), '2028-01-20')
assert.equal(addMonths('2026-03-31', 0), '2026-03-31')

// ---- dates
assert.deepEqual(instalmentDates('2026-11-20', 'week', 3), ['2026-11-20', '2026-11-27', '2026-12-04'])
assert.deepEqual(instalmentDates('2026-11-20', 'twoWeeks', 3), ['2026-11-20', '2026-12-04', '2026-12-18'])
assert.deepEqual(instalmentDates('2026-11-30', 'month', 4), ['2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28'], 'counted from the first date: 30 Jan, then the last day of February')
assert.deepEqual(instalmentDates('2026-01-31', 'month', 3), ['2026-01-31', '2026-02-28', '2026-03-31'], 'March goes back to the 31st')
assert.deepEqual(instalmentDates('2026-11-20', 'week', 0), [])

// ---- amounts
assert.deepEqual(splitAmount(500000, 4), [125000, 125000, 125000, 125000])
assert.deepEqual(splitAmount(65000, 3), [21700, 21700, 21600], 'rounded to 100, the last takes the rest')
assert.deepEqual(splitAmount(100000, 3), [33300, 33300, 33400])
assert.deepEqual(splitAmount(70000, 1), [70000])
assert.deepEqual(splitAmount(0, 3), [0, 0, 0], 'nothing to split')
for (const [total, n] of [[1000, 12], [250, 3], [60, 2], [149, 2], [1450, 3], [999999, 7], [5, 9], [1, 2]] as const) {
  const parts = splitAmount(total, n)
  assert.equal(parts.length, n)
  assert.equal(parts.reduce((a, b) => a + b, 0), total, `${total} in ${n} adds up`)
  assert.ok(parts.every((p) => p >= 0 && Number.isInteger(p)), `${total} in ${n}: no negative or fractional part`)
}
assert.deepEqual(splitAmount(1000, 12).slice(0, 11), Array(11).fill(83), 'too small for rounding to 100: whole-rupee parts')

// ---- the proposal
assert.deepEqual(proposeInstalments(500000, 4, '2026-12-01', 'month'), [
  { date: '2026-12-01', amount: 125000 },
  { date: '2027-01-01', amount: 125000 },
  { date: '2027-02-01', amount: 125000 },
  { date: '2027-03-01', amount: 125000 },
])
assert.equal(proposeInstalments(100, 0, '2026-12-01', 'week').length, 1, 'at least one instalment')

// ---- where the first new instalment starts
assert.equal(firstInstalmentDay('2026-11-20', undefined, 'month'), '2026-11-27', 'no payments yet: a week ahead')
assert.equal(firstInstalmentDay('2026-11-20', '2026-11-30', 'month'), '2026-12-30', 'after the latest payment (30 Nov): a month later')
assert.equal(firstInstalmentDay('2026-11-20', '2026-11-30', 'week'), '2026-12-07')
assert.equal(firstInstalmentDay('2026-11-20', '2026-11-30', 'twoWeeks'), '2026-12-14')
assert.equal(firstInstalmentDay('2026-11-20', '2026-09-01', 'month'), '2026-11-27', 'the latest is long past: still a week ahead, never in the past')
assert.equal(firstInstalmentDay('2026-11-20', '2026-11-21', 'week'), '2026-11-28', 'a payment tomorrow: a week after it')

console.log('schedule: all checks passed')
