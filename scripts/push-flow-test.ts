// Runs the whole send-reminders function against a fake Supabase: who may call it, who gets what, in which
// language, that budget alerts go out once, and that dead devices are cleaned up.
// Run: npx vite-node scripts/push-flow-test.ts
import assert from 'node:assert/strict'
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const PROJECT = 'p1'
// Works on any day: the due payment is dated today, Pakistan time (what the function itself uses).
const TODAY = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10)
const data: Record<string, any[]> = {
  projects: [{ id: PROJECT, name: 'Block E', budget: 1000, owner_id: 'u-investor', target_finish: null, deleted_at: null }],
  project_members: [
    { project_id: PROJECT, user_id: 'u-investor', role: 'investor' },
    { project_id: PROJECT, user_id: 'u-builder', role: 'builder' },
  ],
  push_subscriptions: [
    { endpoint: 'https://push/investor-phone', p256dh: 'k', auth: 'a', lang: 'en', user_id: 'u-investor' },
    { endpoint: 'https://push/builder-phone', p256dh: 'k', auth: 'a', lang: 'ur', user_id: 'u-builder' },
    { endpoint: 'https://push/investor-gone', p256dh: 'k', auth: 'a', lang: 'en', user_id: 'u-investor' },
    { endpoint: 'https://push/stranger', p256dh: 'k', auth: 'a', lang: 'en', user_id: 'u-stranger' },
  ],
  payments: [
    { project_id: PROJECT, purpose: 'Foreman weekly', amount: 90000, date: TODAY, status: 'planned', deleted_at: null },
    { project_id: PROJECT, purpose: 'Cement', amount: 850, date: '2026-11-01', status: 'paid', deleted_at: null },
    { id: 'pay-1', project_id: PROJECT, purpose: 'Sand 10 trolleys', amount: 600, date: TODAY, status: 'paid', approval: 'pending', added_by: 'Imran', deleted_at: null },
    { project_id: PROJECT, purpose: 'Deleted', amount: 999999, date: '2026-11-01', status: 'paid', deleted_at: 5 },
  ],
  phases: [],
  contracts: [],
  transfers: [],
  attachments: [],
  project_invites: [],
  member_permissions: [{ project_id: PROJECT, user_id: 'u-builder', permission: 'viewLedger', enabled: true }],
  push_log: [],
}

let oldSchema = false // when true the fake database has no prefs / reminder_hour columns
const match = (row: any, col: string, spec: string): boolean => {
  if (spec === 'is.null') return row[col] === null || row[col] === undefined
  if (spec.startsWith('eq.')) return String(row[col]) === decodeURIComponent(spec.slice(3))
  if (spec.startsWith('in.(')) return spec.slice(4, -1).split(',').includes(String(row[col]))
  return true
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url!, 'http://x')
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const send = (code: number, json: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(json))
    }
    if (url.pathname === '/auth/v1/user') {
      if (req.headers.apikey !== 'sb_publishable_test') return send(401, { msg: 'bad apikey' })
      const tok = (req.headers.authorization ?? '').replace('Bearer ', '')
      return tok === 'good-token' ? send(200, { id: 'u-investor' }) : send(401, { msg: 'bad' })
    }
    if (req.headers.apikey !== 'sb_secret_test') return send(401, { msg: 'bad apikey' })
    const table = url.pathname.replace('/rest/v1/', '')
    if (!(table in data)) return send(404, {})
    if (oldSchema && table === 'push_subscriptions' && /prefs|reminder_hour/.test(url.searchParams.get('select') ?? '')) return send(400, { code: '42703', message: 'column push_subscriptions.prefs does not exist' })
    const filters = [...url.searchParams.entries()].filter(([k]) => !['select', 'limit', 'offset'].includes(k))
    const rows = data[table].filter((r) => filters.every(([k, v]) => match(r, k, v)))
    if (req.method === 'GET' && oldSchema && table === 'push_subscriptions') rows.forEach((r) => { delete r.prefs; delete r.reminder_hour })
    if (req.method === 'GET') return send(200, rows.slice(Number(url.searchParams.get('offset') ?? 0), Number(url.searchParams.get('offset') ?? 0) + Number(url.searchParams.get('limit') ?? 1000)))
    if (req.method === 'DELETE') {
      data[table] = data[table].filter((r) => !rows.includes(r))
      return send(204, '')
    }
    if (req.method === 'POST') {
      for (const r of JSON.parse(body)) if (!data[table].some((x) => x.project_id === r.project_id && x.key === r.key)) data[table].push(r)
      return send(201, '')
    }
    send(405, {})
  })
})
await new Promise<void>((r) => server.listen(54398, r))

let serve!: (r: Request) => Promise<Response>
const E: Record<string, string> = {
  SUPABASE_URL: 'http://localhost:54398',
  // The new key names; the older SUPABASE_SERVICE_ROLE_KEY is deliberately absent.
  SUPABASE_SECRET_KEYS: '{"default":"sb_secret_test"}',
  SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_test"}',
  CRON_SECRET: 'cron-secret',
  WEB_PUSH_MODULE: pathToFileURL(resolve('scripts/fake-webpush.mjs')).href,
}
;(globalThis as any).Deno = { env: { get: (k: string) => E[k] }, serve: (h: any) => (serve = h) }
const fn = await import('../supabase/functions/send-reminders/index')
const { sent } = await import(E.WEB_PUSH_MODULE)

const call = (headers: Record<string, string>, action: string, extra: Record<string, unknown> = {}) =>
  serve(new Request('http://fn/', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ action, ...(action === 'daily' ? { hour: 9 } : {}), ...extra }) }))

// Who may call it.
assert.equal((await call({}, 'test')).status, 401, 'no sign-in')
assert.equal((await call({ authorization: 'Bearer bad' }, 'test')).status, 401, 'bad token')
assert.equal((await call({ 'x-cron-secret': 'wrong' }, 'daily')).status, 401, 'wrong cron secret')
assert.equal((await call({ authorization: 'Bearer good-token' }, 'daily')).status, 401, 'a signed-in person cannot run the daily job')
assert.equal(sent.length, 0)

// A test goes to the caller's own devices only (the gone one is cleaned up, not counted).
let r = await (await call({ authorization: 'Bearer good-token' }, 'test')).json()
assert.deepEqual(r, { sent: 1, devices: 2 })
assert.deepEqual(sent.map((s: any) => s.endpoint), ['https://push/investor-phone'])
assert.equal(sent[0].payload.title, 'EPC Construction')
assert.ok(!data.push_subscriptions.some((s) => s.endpoint.includes('gone')), 'a gone device is removed')
sent.length = 0

// Daily run: members only, each in their own language; the stranger gets nothing.
r = await (await call({ 'x-cron-secret': 'cron-secret' }, 'daily')).json()
assert.equal(r.failed, 0)
const to = (e: string) => sent.filter((s: any) => s.endpoint === `https://push/${e}`).map((s: any) => s.payload)
assert.equal(to('stranger').length, 0, 'someone outside the project gets nothing')
assert.deepEqual(to('investor-phone').map((p: any) => p.title), ['Payments due today', 'Budget 80% used'])
assert.deepEqual(to('builder-phone').map((p: any) => p.title), ['آج کی واجب الادا ادائیگیاں', 'بجٹ کا 80% خرچ ہو گیا'])
assert.equal(to('builder-phone')[0].lang, 'ur')
const dev = (e: string) => fn.deviceId(`https://push/${e}`)
assert.deepEqual(data.push_log.map((l) => l.key).sort(), [`budget80:${dev('builder-phone')}`, `budget80:${dev('investor-phone')}`].sort(), 'budget alerts are remembered per device')

// Run again the same day: the due reminder repeats (it is still due), the budget alert does not.
sent.length = 0
await call({ 'x-cron-secret': 'cron-secret' }, 'daily')
assert.deepEqual(to('investor-phone').map((p: any) => p.title), ['Payments due today'])

// Spending passes 100%: one "budget reached", and the 80% one is settled.
data.payments.push({ project_id: PROJECT, purpose: 'Big', amount: 500, date: '2026-11-02', status: 'paid', deleted_at: null })
sent.length = 0
await call({ 'x-cron-secret': 'cron-secret' }, 'daily')
assert.ok(to('investor-phone').some((p: any) => p.title === 'Budget reached'))
assert.deepEqual(data.push_log.map((l) => l.key).sort(), ['budget100', 'budget80'].flatMap((k) => [`${k}:${dev('builder-phone')}`, `${k}:${dev('investor-phone')}`]).sort())
sent.length = 0
await call({ 'x-cron-secret': 'cron-secret' }, 'daily')
assert.ok(!to('investor-phone').some((p: any) => p.title.startsWith('Budget')))


// ---- Preferences and reminder hours (phase 3).
const resetSubs = () => {
  data.push_subscriptions = [
    { endpoint: 'https://push/investor-phone', p256dh: 'k', auth: 'a', lang: 'en', user_id: 'u-investor' },
    { endpoint: 'https://push/builder-phone', p256dh: 'k', auth: 'a', lang: 'ur', user_id: 'u-builder' },
  ]
  data.push_log = []
  data.payments = data.payments.filter((p) => p.purpose !== 'Big') // back to 85% of the budget
  sent.length = 0
}
const daily = async (hour?: number) => (await call(CRON0, 'daily', hour === undefined ? { hour: undefined } : { hour })).json()
const CRON0 = { 'x-cron-secret': 'cron-secret' }
const B80_UR = 'بجٹ کا 80% خرچ ہو گیا'
const titlesFor = (e: string) => to(e).map((p: any) => p.title)

// Devices saved before the columns existed are served at 9:00 with everything on; at other hours nothing.
resetSubs()
r = await daily(10)
assert.deepEqual([r.sent, r.hour], [0, 10], 'nobody chose 10:00')
r = await daily(9)
assert.equal(r.hour, 9); assert.deepEqual(titlesFor('investor-phone'), ['Payments due today', 'Budget 80% used'])

// Each device is served at its own hour.
resetSubs()
data.push_subscriptions[0].reminder_hour = 7
data.push_subscriptions[1].reminder_hour = 18
await daily(9); assert.equal(sent.length, 0, 'neither chose 9:00')
await daily(7); assert.deepEqual(sent.map((x: any) => x.endpoint), ['https://push/investor-phone', 'https://push/investor-phone'])
sent.length = 0
await daily(18); assert.deepEqual([...new Set(sent.map((x: any) => x.endpoint))], ['https://push/builder-phone'])
assert.equal(to('builder-phone')[0].lang, 'ur')

// An impossible hour in the database falls back to 9:00 instead of never sending.
resetSubs()
data.push_subscriptions[0].reminder_hour = 99
await daily(9); assert.equal(titlesFor('investor-phone').length, 2)

// What a device turned off is not sent; the other device is unaffected.
resetSubs()
data.push_subscriptions[0].prefs = { due: false }
await daily(9)
assert.deepEqual(titlesFor('investor-phone'), ['Budget 80% used'])
assert.deepEqual(titlesFor('builder-phone').length, 2)
resetSubs()
data.push_subscriptions[0].prefs = { due: false, budget80: false, budget100: false, approvalRequests: true, approvalDecisions: true }
await daily(9)
assert.equal(titlesFor('investor-phone').length, 0, 'Approvals only: no due or budget alerts')
assert.equal(data.push_log.filter((l) => l.key.endsWith(dev('investor-phone'))).length, 0, 'an alert that was not sent is not marked as sent')

// Budget alerts are once per device: a device that turns the alert on later still gets it.
resetSubs()
data.push_subscriptions[0].prefs = { budget80: false }
await daily(9)
assert.ok(!titlesFor('investor-phone').includes('Budget 80% used')); assert.ok(titlesFor('builder-phone').includes(B80_UR))
data.push_subscriptions[0].prefs = {} // the investor turns it back on
sent.length = 0
await daily(9)
assert.ok(titlesFor('investor-phone').includes('Budget 80% used'), 'sent now that it is wanted')
assert.ok(!titlesFor('builder-phone').includes(B80_UR), 'not repeated to the device that had it')

// A budget alert logged before devices were tracked (plain key) counts as sent to every device.
resetSubs()
data.push_log = [{ project_id: PROJECT, key: 'budget80' }]
await daily(9)
assert.ok(!titlesFor('investor-phone').includes('Budget 80% used') && !titlesFor('builder-phone').includes(B80_UR))

// Before the database has the new columns, everything still works the old way (9:00, everything).
resetSubs()
oldSchema = true
await daily(9)
assert.equal(titlesFor('investor-phone').length, 2); assert.equal(titlesFor('builder-phone').length, 2)
r = await (await call({ authorization: 'Bearer good-token' }, 'test')).json()
assert.equal(r.sent, 1, 'the test still works on the old database')
oldSchema = false

// A test message ignores the choices, so you can always check the device works.
resetSubs()
data.push_subscriptions[0].prefs = { due: false, budget80: false, budget100: false, approvalRequests: false, approvalDecisions: false }
r = await (await call({ authorization: 'Bearer good-token' }, 'test')).json()
assert.equal(r.sent, 1)
assert.equal(sent.at(-1).payload.url, '/settings/notifications')

// Approval events (called by the database trigger with the cron secret).
const event = (headers: Record<string, string>, ev: string, id = 'pay-1') =>
  serve(new Request('http://fn/', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ action: 'payment-event', event: ev, payment_id: id }) }))
const CRON = { 'x-cron-secret': 'cron-secret' }
data.push_subscriptions = [
  { endpoint: 'https://push/investor-phone', p256dh: 'k', auth: 'a', lang: 'en', user_id: 'u-investor' },
  { endpoint: 'https://push/builder-phone', p256dh: 'k', auth: 'a', lang: 'ur', user_id: 'u-builder' },
  { endpoint: 'https://push/stranger', p256dh: 'k', auth: 'a', lang: 'en', user_id: 'u-stranger' },
]
sent.length = 0
assert.equal((await event({}, 'pending')).status, 401, 'no secret')
assert.equal((await event({ authorization: 'Bearer good-token' }, 'pending')).status, 401, 'a signed-in person cannot raise events')
assert.equal((await event(CRON, 'sideways')).status, 400, 'unknown event')

// The builder submitted: only the investor's devices hear about it.
r = await (await event(CRON, 'pending')).json()
assert.equal(r.sent, 1)
assert.deepEqual(sent.map((s: any) => [s.endpoint, s.payload.title]), [['https://push/investor-phone', 'Entry waiting for your approval']])
sent.length = 0

// A stale event (the entry is no longer pending) sends nothing.
r = await (await event(CRON, 'approved')).json()
assert.deepEqual([r.sent, r.skipped], [0, 'entry has moved on'])

// The investor rejected it: only the builder's devices hear, in Urdu, with the reason.
Object.assign(data.payments.find((p) => p.id === 'pay-1')!, { approval: 'rejected', reject_reason: 'Quantity looks wrong' })
r = await (await event(CRON, 'rejected')).json()
assert.equal(r.sent, 1)
assert.equal(sent[0].endpoint, 'https://push/builder-phone'); assert.equal(sent[0].payload.title, 'اندراج مسترد ہو گیا'); assert.equal(sent[0].payload.lang, 'ur')
assert.match(sent[0].payload.body, /Quantity looks wrong/); assert.equal(sent[0].payload.url, '/ledger?approval=rejected')

// A device that turned the type off is not told; the others still are.
data.push_subscriptions = [
  { endpoint: 'https://push/investor-phone', p256dh: 'k', auth: 'a', lang: 'en', user_id: 'u-investor', prefs: { approvalRequests: false } },
  { endpoint: 'https://push/investor-tablet', p256dh: 'k', auth: 'a', lang: 'en', user_id: 'u-investor', prefs: { approvalDecisions: false } },
  { endpoint: 'https://push/builder-phone', p256dh: 'k', auth: 'a', lang: 'ur', user_id: 'u-builder', prefs: { approvalDecisions: false } },
]
Object.assign(data.payments.find((p) => p.id === 'pay-1')!, { approval: 'pending', reject_reason: null })
sent.length = 0
r = await (await event(CRON, 'pending')).json()
assert.deepEqual(sent.map((s: any) => s.endpoint), ['https://push/investor-tablet'], 'requests: only the device that still wants them')
Object.assign(data.payments.find((p) => p.id === 'pay-1')!, { approval: 'approved', approved_by: 'Mohsin' })
sent.length = 0
r = await (await event(CRON, 'approved')).json()
assert.equal(sent.length, 0, 'the builder turned decisions off')
data.push_subscriptions[2].prefs = {}
r = await (await event(CRON, 'approved')).json()
assert.deepEqual(sent.map((s: any) => s.endpoint), ['https://push/builder-phone'])

// A deleted entry or an unknown one sends nothing.
assert.deepEqual((await (await event(CRON, 'pending', 'nope')).json()).sent, 0)

// General activity fans out once, excludes the actor and respects page permissions.
const activity = (eventName: string, extra: Record<string, unknown> = {}) =>
  call(CRON, 'activity-event', { event: eventName, project_id: PROJECT, record_id: 'pay-1', actor_id: 'u-investor', ...extra })
data.push_subscriptions = [
  { endpoint: 'https://push/investor-phone', p256dh: 'k', auth: 'a', lang: 'en', user_id: 'u-investor' },
  { endpoint: 'https://push/builder-phone', p256dh: 'k', auth: 'a', lang: 'en', user_id: 'u-builder' },
]
Object.assign(data.payments.find((p) => p.id === 'pay-1')!, { approval: null })
sent.length = 0
r = await (await activity('payment_added')).json()
assert.equal(r.sent, 1); assert.deepEqual(sent.map((s: any) => s.endpoint), ['https://push/builder-phone'])
assert.match(sent[0].payload.body, /Sand 10 trolleys · Rs 600/, 'a member with view permission gets useful detail')
data.member_permissions = []
sent.length = 0
await activity('payment_added')
assert.equal(sent[0].payload.body, 'There is new activity in Block E.', 'a restricted member gets no financial detail')
data.push_subscriptions[1].prefs = { paymentActivity: false }
sent.length = 0
r = await (await activity('payment_added')).json()
assert.equal(r.sent, 0, 'the payment activity switch silences payment events')
data.push_subscriptions[1].prefs = { activity: false }
r = await (await activity('payment_added')).json()
assert.equal(r.sent, 0, 'the old combined activity switch remains respected')

console.log('push flow: all checks passed')
server.close()
process.exit(0)
