// Checks the region and format choices: number grouping, money, dates, times, week start, currency words.
// Run: npx vite-node scripts/region-test.ts
import assert from 'node:assert/strict'
import { addDays, formatDate, formatMoney, formatTime, groupDigits, money, parseAmount } from '../src/lib/format'
import { DEFAULT_REGION, currencyLabel, getRegion, groupNumber, regionFrom, setRegion, weekdayOrder, weekdayRank } from '../src/lib/region'
import { num } from '../src/lib/materials'
import { hourLabel } from '../src/push/prefs'
import { interpolate } from '../src/lib/format'

// ---- Defaults are how the app always looked.
assert.deepEqual(getRegion(), DEFAULT_REGION)
assert.equal(money(225500), 'Rs 225,500'); assert.equal(money(0), 'Rs 0'); assert.equal(money(undefined), 'Rs 0')
assert.equal(formatDate('2026-11-15', 'en'), '15 Nov 2026')
assert.equal(groupDigits('1300000'), '1,300,000'); assert.equal(groupDigits('abc'), '')
assert.equal(num(1234.5), '1,234.5'); assert.equal(num(2.5), '2.5'); assert.equal(num(1000), '1,000')
assert.deepEqual(weekdayOrder(), [0, 1, 2, 3, 4, 5, 6])

// ---- Grouping.
const t = (n: number, g: 'thousands' | 'lakh', d = 0) => groupNumber(n, g, d)
for (const [n, thousands, lakh] of [
  [0, '0', '0'], [7, '7', '7'], [999, '999', '999'], [1000, '1,000', '1,000'], [12345, '12,345', '12,345'],
  [99999, '99,999', '99,999'], [100000, '100,000', '1,00,000'], [225500, '225,500', '2,25,500'], [1300000, '1,300,000', '13,00,000'],
  [12345678, '12,345,678', '1,23,45,678'], [7153176, '7,153,176', '71,53,176'], [123456789012, '123,456,789,012', '1,23,45,67,89,012'],
] as [number, string, string][]) {
  assert.equal(t(n, 'thousands'), thousands, `thousands ${n}`)
  assert.equal(t(n, 'lakh'), lakh, `lakh ${n}`)
}
assert.equal(t(-1300000, 'lakh'), '-13,00,000'); assert.equal(t(-1300000, 'thousands'), '-1,300,000'); assert.equal(t(-0.4, 'lakh'), '0', 'no minus sign on zero')
assert.equal(t(1234567.891, 'lakh', 2), '12,34,567.89'); assert.equal(t(1234567.8, 'thousands', 2), '1,234,567.8', 'trailing zeros dropped'); assert.equal(t(2, 'lakh', 2), '2')
assert.equal(groupNumber(NaN), '0')
assert.equal(parseAmount('13,00,000'), 1300000); assert.equal(parseAmount('1,300,000'), 1300000, 'either grouping reads back the same')

// ---- Money in each choice.
const r = (over: Partial<typeof DEFAULT_REGION>) => ({ ...DEFAULT_REGION, ...over })
assert.equal(formatMoney(1300000, r({})), 'Rs 1,300,000')
assert.equal(formatMoney(1300000, r({ grouping: 'lakh' })), 'Rs 13,00,000')
assert.equal(formatMoney(1300000, r({ currency: 'PKR' })), 'PKR 1,300,000')
assert.equal(formatMoney(1300000, r({ currency: 'Rs' })), 'Rs 1,300,000')
assert.equal(formatMoney(1300000, r({ currency: 'روپے', grouping: 'lakh' })), '13,00,000 روپے', 'the Urdu word follows the number')
assert.equal(formatMoney(2499.6, r({})), 'Rs 2,500', 'whole rupees, rounded')
assert.equal(formatMoney(-500, r({})), 'Rs -500')

// ---- The current choice drives money(), digits, quantities and dates everywhere.
setRegion({ grouping: 'lakh', currency: 'PKR', dateStyle: 'numeric' })
assert.equal(money(1300000), 'PKR 13,00,000'); assert.equal(groupDigits('1300000'), '13,00,000'); assert.equal(num(1234567.5), '12,34,567.5')
assert.equal(formatDate('2026-11-15', 'en'), '15/11/2026'); assert.equal(formatDate('2026-01-05', 'ur'), '05/01/2026'); assert.equal(formatDate(undefined, 'en'), '')
assert.equal(formatDate('2026-11-15', 'en', 'short'), '15 Nov 2026', 'an explicit style wins (used for examples)')
setRegion(undefined)
assert.deepEqual(getRegion(), DEFAULT_REGION, 'no saved choice goes back to the defaults')
assert.equal(formatDate('2026-11-15', 'en'), '15 Nov 2026')

// ---- Anything unknown or missing in the saved value falls back to the default.
assert.deepEqual(regionFrom(undefined), DEFAULT_REGION); assert.deepEqual(regionFrom('x'), DEFAULT_REGION)
assert.deepEqual(regionFrom({ weekStart: 3, clock: '36', dateStyle: 'iso', grouping: 'lakh', currency: 'USD' }), { ...DEFAULT_REGION, grouping: 'lakh' })
assert.deepEqual(regionFrom({ weekStart: 6, clock: '24', dateStyle: 'numeric', grouping: 'lakh', currency: 'روپے' }), { weekStart: 6, clock: '24', dateStyle: 'numeric', grouping: 'lakh', currency: 'روپے' })

// ---- Currency word in field labels: Automatic follows the language, a choice wins in both.
assert.equal(currencyLabel('en', true, DEFAULT_REGION), 'Rs'); assert.equal(currencyLabel('ur', true, DEFAULT_REGION), 'روپے')
assert.equal(currencyLabel('ur', false, DEFAULT_REGION), 'Rs', 'amounts always say Rs when automatic')
assert.equal(currencyLabel('ur', true, r({ currency: 'PKR' })), 'PKR'); assert.equal(currencyLabel('en', true, r({ currency: 'روپے' })), 'روپے')
assert.equal(interpolate('Amount ({cur})', { cur: currencyLabel('ur', true, DEFAULT_REGION) }), 'Amount (روپے)')

// ---- Week start: Saturday, Sunday or Monday first; the same seven days.
assert.deepEqual(weekdayOrder(6), [6, 0, 1, 2, 3, 4, 5]); assert.deepEqual(weekdayOrder(1), [1, 2, 3, 4, 5, 6, 0])
for (const start of [6, 0, 1]) assert.deepEqual([...weekdayOrder(start)].sort(), [0, 1, 2, 3, 4, 5, 6])
assert.equal(weekdayRank(6, 6), 0); assert.equal(weekdayRank(0, 6), 1); assert.equal(weekdayRank(5, 6), 6)
assert.equal(weekdayRank(0, 1), 6); assert.equal(weekdayRank(1, 1), 0); assert.equal(weekdayRank(4, 0), 4)
setRegion({ weekStart: 6 }); assert.deepEqual(weekdayOrder(), [6, 0, 1, 2, 3, 4, 5]); assert.equal(weekdayRank(4), 5); setRegion(undefined)
// A weekly payment is stored by weekday number, so choosing another week start never moves a payment.
assert.equal(new Date('2026-11-12T00:00:00').getDay(), 4, '12 Nov 2026 is a Thursday')
assert.equal(addDays('2026-11-12', 7), '2026-11-19')

// ---- Clock: 9:05 in the morning and 17:30 in the evening, both languages.
const morning = new Date(2026, 10, 15, 9, 5); const evening = new Date(2026, 10, 15, 17, 30)
assert.match(formatTime(morning, 'en', '12'), /^9:05\s?am$/i); assert.match(formatTime(evening, 'en', '12'), /^5:30\s?pm$/i)
assert.equal(formatTime(morning, 'en', '24'), '09:05'); assert.equal(formatTime(evening, 'en', '24'), '17:30')
assert.equal(formatTime(evening, 'ur', '24'), '17:30', 'Latin digits in Urdu too')
assert.equal(hourLabel(9, 'en', '12'), '9:00 am'); assert.equal(hourLabel(0, 'en', '12'), '12:00 am'); assert.equal(hourLabel(18, 'en', '24'), '18:00'); assert.equal(hourLabel(5, 'ur', '24'), '05:00')
assert.equal(hourLabel(9, 'ur', '12'), '9:00 صبح')
setRegion({ clock: '24' }); assert.equal(hourLabel(9, 'en'), '09:00'); setRegion(undefined); assert.equal(hourLabel(9, 'en'), '9:00 am')

console.log('region: all checks passed')
