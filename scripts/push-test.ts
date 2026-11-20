// Checks the reminder logic of the send-reminders Edge Function (pure functions, no server needed).
// Run: npx vite-node scripts/push-test.ts
import assert from 'node:assert/strict'
import {
  DEFAULT_PREFS, buildApprovalMessage, buildMessages, deviceId, hourOf, karachiHour, karachiToday, keysToLog, prefsOf, sentFor, testMessage, wantsApproval,
  type Payment, type Project,
} from '../supabase/functions/send-reminders/index'
import { DEFAULT_PUSH_PREFS, DEFAULT_REMINDER_HOUR, PUSH_PRESETS, PUSH_TYPES, countOn, hourFrom, hourLabel, prefsFrom, presetOf, reminderHours } from '../src/push/prefs'

const P: Project = { id: 'p1', name: 'Block E', budget: 1000 }
const pay = (purpose: string, amount: number, date: string, status: string): Payment => ({ purpose, amount, date, status })
const none = new Set<string>()

// Pakistan is UTC+5: 21:00 UTC on the 14th is already the 15th there.
assert.equal(karachiToday(new Date('2026-11-14T21:00:00Z')), '2026-11-15')
assert.equal(karachiToday(new Date('2026-11-15T04:00:00Z')), '2026-11-15')
assert.equal(karachiToday(new Date('2026-11-14T18:59:00Z')), '2026-11-14')

// Due today and overdue are separate notifications; skipped, paid and future ones are ignored.
let m = buildMessages(
  P,
  [
    pay('Foreman weekly', 90000, '2026-11-15', 'planned'),
    pay('Cement', 50000, '2026-11-12', 'planned'),
    pay('Old skipped', 1, '2026-11-10', 'skipped'),
    pay('Next week', 1, '2026-11-22', 'planned'),
    pay('Paid today', 5, '2026-11-15', 'paid'),
  ],
  '2026-11-15',
  none,
  'en',
)
assert.deepEqual(m.map((x) => x.title), ['Payments due today', 'Overdue payments'])
assert.equal(m[0].body, 'Block E: Foreman weekly · Rs 90,000')
assert.equal(m[1].body, 'Block E: Cement · Rs 50,000')
assert.equal(m[0].tag, 'due-p1-2026-11-15')

// More than three: first three named, the rest counted, total of all.
m = buildMessages(P, [1, 2, 3, 4, 5].map((i) => pay(`Item ${i}`, 100, '2026-11-15', 'planned')), '2026-11-15', none, 'en')
assert.equal(m[0].body, 'Block E: Item 1, Item 2, Item 3, +2 more · Rs 500')

// Urdu uses Urdu titles; money keeps the Rs form.
m = buildMessages(P, [pay('Foreman', 90000, '2026-11-15', 'planned')], '2026-11-15', none, 'ur')
assert.equal(m[0].title, 'آج کی واجب الادا ادائیگیاں')
assert.match(m[0].body, /Rs 90,000/)

// Nothing to say: no messages.
assert.deepEqual(buildMessages(P, [pay('Paid', 10, '2026-11-01', 'paid')], '2026-11-15', none, 'en'), [])

// Budget: 80% once, 100% once, 100% settles 80% too.
const spend = (n: number) => [pay('Spend', n, '2026-11-01', 'paid')]
m = buildMessages(P, spend(799), '2026-11-15', none, 'en')
assert.equal(m.length, 0, '79.9% is quiet')
m = buildMessages(P, spend(800), '2026-11-15', none, 'en')
assert.equal(m[0].title, 'Budget 80% used'); assert.deepEqual(keysToLog(m), ['budget80'])
assert.equal(buildMessages(P, spend(900), '2026-11-15', new Set(['budget80']), 'en').length, 0, '80% is not repeated')
m = buildMessages(P, spend(1200), '2026-11-15', none, 'en')
assert.equal(m.length, 1); assert.equal(m[0].title, 'Budget reached'); assert.deepEqual(keysToLog(m).sort(), ['budget100', 'budget80'])
assert.equal(buildMessages(P, spend(1200), '2026-11-15', new Set(['budget100', 'budget80']), 'en').length, 0, '100% is not repeated')
assert.equal(buildMessages(P, [pay('Adv', 850, '2026-11-01', 'advance')], '2026-11-15', none, 'en')[0].title, 'Budget 80% used', 'advances count as spent')

// A builder's entry that is not approved yet does not count towards the budget.
const held = (n: number, approval: string) => [{ purpose: 'Builder', amount: n, date: '2026-11-01', status: 'paid', approval }]
assert.equal(buildMessages(P, held(900, 'pending'), '2026-11-15', none, 'en').length, 0, 'pending is not spent')
assert.equal(buildMessages(P, held(900, 'rejected'), '2026-11-15', none, 'en').length, 0, 'rejected is not spent')
assert.equal(buildMessages(P, held(900, 'approved'), '2026-11-15', none, 'en')[0].title, 'Budget 80% used', 'approved counts')

// No budget set: no budget alerts.
assert.equal(buildMessages({ ...P, budget: null }, spend(99999), '2026-11-15', none, 'en').length, 0)
assert.equal(buildMessages({ ...P, budget: 0 }, spend(99999), '2026-11-15', none, 'en').length, 0)

// Approval events: who is told what, in which language, and nothing when the entry has moved on.
const entry = { purpose: 'Sand 10 trolleys', amount: 56000, approval: 'pending', added_by: 'Imran' }
let a = buildApprovalMessage('pending', entry, 'Block E', 'pay-1', 'en')!
assert.equal(a.title, 'Entry waiting for your approval'); assert.equal(a.body, 'Block E: Sand 10 trolleys · Rs 56,000 · Added by Imran')
assert.equal(a.url, '/ledger?approval=pending'); assert.equal(a.tag, 'approval-pending-pay-1')
assert.equal(buildApprovalMessage('approved', entry, 'Block E', 'pay-1', 'en'), undefined, 'a late "approved" for an entry that is still pending is dropped')
a = buildApprovalMessage('rejected', { ...entry, approval: 'rejected', reject_reason: 'Quantity looks wrong' }, 'Block E', 'pay-1', 'en')!
assert.equal(a.title, 'Entry rejected'); assert.match(a.body, /Reason: Quantity looks wrong$/); assert.equal(a.url, '/ledger?approval=rejected')
a = buildApprovalMessage('approved', { ...entry, approval: 'approved', approved_by: 'Mohsin' }, 'Block E', 'pay-1', 'en')!
assert.equal(a.title, 'Entry approved'); assert.match(a.body, /Approved by Mohsin$/); assert.equal(a.url, '/payments/pay-1')
a = buildApprovalMessage('pending', entry, 'Block E', 'pay-1', 'ur')!
assert.equal(a.title, 'اندراج آپ کی منظوری کا منتظر ہے'); assert.match(a.body, /Rs 56,000/)
a = buildApprovalMessage('rejected', { ...entry, approval: 'rejected' }, 'Block E', 'pay-1', 'en')!
assert.ok(!a.body.includes('Reason'), 'no reason, no reason line')

assert.equal(testMessage('en').url, '/settings/notifications')

// ---- Preferences: what a device chose decides what it is sent.
const over = [pay('Foreman', 90000, '2026-11-15', 'planned'), pay('Spend', 850, '2026-11-01', 'paid')]
const titles = (prefs: Partial<typeof DEFAULT_PREFS>) => buildMessages(P, over, '2026-11-15', none, 'en', { ...DEFAULT_PREFS, ...prefs }).map((x) => x.title)
assert.deepEqual(titles({}), ['Payments due today', 'Budget 80% used'], 'no choices: everything')
assert.deepEqual(titles({ due: false }), ['Budget 80% used'])
assert.deepEqual(titles({ budget80: false }), ['Payments due today'])
assert.deepEqual(titles({ due: false, budget80: false }), [])
// 100% needs its own switch; the 80% switch does not stand in for it.
const huge = [pay('Spend', 1200, '2026-11-01', 'paid')]
assert.equal(buildMessages(P, huge, '2026-11-15', none, 'en', { ...DEFAULT_PREFS, budget100: false }).length, 0)
assert.equal(buildMessages(P, huge, '2026-11-15', none, 'en', { ...DEFAULT_PREFS, budget80: false })[0].title, 'Budget reached')
// Turning a type off does not use it up: it is still sent once it is turned back on.
assert.deepEqual(keysToLog(buildMessages(P, over, '2026-11-15', none, 'en', { ...DEFAULT_PREFS, budget80: false })), [])

// Approval events follow their own two switches.
assert.equal(wantsApproval({ ...DEFAULT_PREFS, approvalRequests: false }, 'pending'), false)
assert.equal(wantsApproval({ ...DEFAULT_PREFS, approvalRequests: false }, 'approved'), true)
assert.equal(wantsApproval({ ...DEFAULT_PREFS, approvalDecisions: false }, 'rejected'), false)
assert.equal(wantsApproval(DEFAULT_PREFS, 'pending'), true)

// What the database holds: missing or odd values mean yes; only an explicit false turns a type off.
assert.deepEqual(prefsOf(undefined), DEFAULT_PREFS); assert.deepEqual(prefsOf({}), DEFAULT_PREFS); assert.deepEqual(prefsOf('x'), DEFAULT_PREFS)
assert.deepEqual(prefsOf({ due: false, budget80: 'no', other: false }), { ...DEFAULT_PREFS, due: false })
assert.equal(hourOf(undefined), 9); assert.equal(hourOf(null), 9); assert.equal(hourOf(24), 9); assert.equal(hourOf(7.5), 9); assert.equal(hourOf(0), 0); assert.equal(hourOf(21), 21)

// Reminder hour is Pakistan time: 04:00 UTC is 9, 19:00 UTC is midnight.
assert.equal(karachiHour(new Date('2026-11-15T04:00:00Z')), 9)
assert.equal(karachiHour(new Date('2026-11-15T19:30:00Z')), 0)
assert.equal(karachiHour(new Date('2026-11-15T18:59:00Z')), 23)

// Budget alerts are remembered per device; the plain keys written before this existed count for every device.
const dA = deviceId('https://push/a'); const dB = deviceId('https://push/b')
assert.notEqual(dA, dB); assert.equal(dA, deviceId('https://push/a')); assert.match(dA, /^[0-9a-f]{8}$/)
assert.deepEqual([...sentFor(['budget80'], dA)], ['budget80'], 'an old key counts for everyone')
assert.deepEqual([...sentFor([`budget80:${dA}`], dA)], ['budget80'])
assert.deepEqual([...sentFor([`budget80:${dA}`], dB)], [], 'another device has not had it')
assert.deepEqual([...sentFor([`budget100:${dA}`, `budget80:${dA}`, `budget80:${dB}`], dB)], ['budget80'])

// The app and the function agree on the defaults, the types and the hour.
assert.deepEqual(DEFAULT_PUSH_PREFS, DEFAULT_PREFS); assert.deepEqual([...PUSH_TYPES].sort(), Object.keys(DEFAULT_PREFS).sort()); assert.equal(DEFAULT_REMINDER_HOUR, hourOf(undefined))
for (const raw of [undefined, {}, { due: false }, { due: 0, budget100: false }, 'x']) assert.deepEqual(prefsFrom(raw), prefsOf(raw))
for (const raw of [undefined, 3, 24, 'x']) assert.equal(hourFrom(raw), hourOf(raw))

// Presets: Recommended is everything; each preset is recognised; any other mix is custom.
assert.deepEqual(PUSH_PRESETS.recommended, DEFAULT_PREFS)
assert.equal(presetOf(PUSH_PRESETS.recommended), 'recommended'); assert.equal(presetOf(PUSH_PRESETS.minimal), 'minimal'); assert.equal(presetOf(PUSH_PRESETS.approvals), 'approvals')
assert.equal(presetOf({ ...PUSH_PRESETS.minimal, due: true }), 'custom')
assert.deepEqual(Object.entries(PUSH_PRESETS.minimal).filter(([, v]) => v).map(([k]) => k), ['budget100', 'approvalRequests', 'approvalDecisions'], 'minimal: approvals and the budget limit')
assert.deepEqual(Object.entries(PUSH_PRESETS.approvals).filter(([, v]) => v).map(([k]) => k), ['approvalRequests', 'approvalDecisions'])
assert.equal(countOn(PUSH_PRESETS.recommended), 5); assert.equal(countOn(PUSH_PRESETS.minimal), 3); assert.equal(countOn(PUSH_PRESETS.approvals), 2)

// Hours offered and how they read.
assert.deepEqual(reminderHours(9), [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22])
assert.ok(reminderHours(2).includes(2) && reminderHours(2)[0] === 2, 'a saved hour outside the list stays selectable')
assert.equal(hourLabel(9, 'en'), '9:00 am'); assert.equal(hourLabel(12, 'en'), '12:00 pm'); assert.equal(hourLabel(0, 'en'), '12:00 am'); assert.equal(hourLabel(17, 'en'), '5:00 pm')
assert.equal(hourLabel(9, 'ur'), '9:00 صبح'); assert.equal(hourLabel(17, 'ur'), '5:00 شام')

console.log('push logic: all checks passed')
