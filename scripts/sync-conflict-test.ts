// Runs the real sync engine against a small fake of the REST API that behaves like supabase/schema.sql:
// a write older than the stored row is ignored (and left out of the rows it reports back as written).
// Plays the story: two phones edit the same payment, the older edit is refused, nothing is lost silently.
// Run: VITE_SUPABASE_URL=http://localhost:54398 VITE_SUPABASE_ANON_KEY=test-key-not-a-secret npx vite-node scripts/sync-conflict-test.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import http from 'node:http'

// Never run this against a real project: it must be pointed at the local fake below.
assert.ok(process.env.VITE_SUPABASE_URL?.startsWith('http://localhost:'), 'set VITE_SUPABASE_URL to http://localhost:54398 (see the line above)')

Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
;(globalThis as any).window = new EventTarget()
;(globalThis as any).document = Object.assign(new EventTarget(), { visibilityState: 'visible' })

const store: Record<string, Record<string, any>> = {}
let tick = 0
const stamp = () => new Date(Date.UTC(2026, 10, 15, 0, 0, 0) + ++tick * 1000).toISOString()
let failNextSelectById = false

const server = http.createServer((req, res) => {
  const url = new URL(req.url!, 'http://x')
  const path = url.pathname.replace('/rest/v1/', '')
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const send = (code: number, json?: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(json === undefined ? undefined : JSON.stringify(json))
    }
    if (url.pathname.startsWith('/storage/v1/')) return send(200, { Key: url.pathname })
    if (path === 'rpc/claim_invites') return send(200, 0)
    if (req.method === 'POST') {
      const rows: any[] = JSON.parse(body)
      const written: any[] = []
      for (const r of rows) {
        const old = store[path]?.[r.id]
        if (old && r.updated_at < old.updated_at) continue // the trigger: an older edit is ignored without an error
        ;(store[path] ??= {})[r.id] = { ...r, server_updated_at: stamp() }
        written.push({ id: r.id })
      }
      // Like PostgREST: with return=representation the answer lists the rows that were really written.
      return (req.headers.prefer ?? '').includes('return=representation') ? send(201, written) : send(201)
    }
    let rows = Object.values(store[path] ?? {})
    const cursor = (url.searchParams.get('server_updated_at') ?? '').replace('gte.', '')
    if (cursor) rows = rows.filter((r) => r.server_updated_at >= cursor)
    const ids = /^in\.\((.*)\)$/.exec(url.searchParams.get('id') ?? '')?.[1]
    if (ids !== undefined) {
      if (failNextSelectById) {
        failNextSelectById = false
        return send(500, { code: 'XX000', message: 'boom', details: null, hint: null })
      }
      const want = new Set(ids.split(',').map((s) => s.replace(/"/g, '')))
      rows = rows.filter((r) => want.has(r.id))
    }
    return send(200, rows)
  })
})
await new Promise<void>((r) => server.listen(54398, r))

const { db } = await import('../src/db/db')
const actions = await import('../src/db/actions')
const { startSync, stopSync, getStatus } = await import('../src/sync/engine')
const { loadConflicts, restoreMine, keepCurrent } = await import('../src/sync/conflicts')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const dirtyCount = async () => (await Promise.all([db.projects, db.phases, db.payments].map((t) => t.where('dirty').equals(1).count()))).reduce((a, b) => a + b, 0)
async function settle(label: string) {
  for (let i = 0; i < 80; i++) {
    const s = getStatus()
    if (s.state === 'error') throw new Error(`${label}: ${s.error}`)
    if (s.state === 'idle' && (await dirtyCount()) === 0) return
    await sleep(250)
  }
  throw new Error(`${label}: did not settle ${JSON.stringify(getStatus())}`)
}

// ---- Phone A creates a payment and it reaches the server.
const pid = await actions.createProject({ name: 'House #3', location: 'Wah Cantt', budget: 1000 }, 'blank')
await actions.savePayment({ projectId: pid, date: '2026-11-10', amount: 30000, category: 'labour', purpose: 'Ceiling 2nd payment', status: 'paid', mode: 'bank', paidBy: 'investor', addedBy: 'A' }, [], [])
const payId = (await db.payments.toArray())[0].id
startSync('test-user')
await settle('first sync')
assert.equal(store.payments[payId].amount, 30000)
assert.equal((await loadConflicts()).length, 0, 'an ordinary sync records no notice')
stopSync()
console.log('1. ordinary sync: ok, no notice')

// ---- Phone B saved a newer edit meanwhile (its clock is ahead, so its edit is the newer one).
store.payments[payId] = { ...store.payments[payId], amount: 31000, note: 'checked by B', updated_at: Date.now() + 60_000, server_updated_at: stamp() }

// ---- Phone A, still offline from B's change, edits the same payment (older timestamp) and syncs.
await db.payments.update(payId, { amount: 35000 })
assert.equal(await dirtyCount(), 1)
startSync('test-user')
await settle('conflict sync')
stopSync()

const local = (await db.payments.get(payId))!
assert.equal(store.payments[payId].amount, 31000, 'the server kept the newer edit')
assert.equal(local.amount, 31000, 'this phone now shows the newer edit')
assert.equal(local.dirty, 0, 'and is not waiting to send anything')
const list = await loadConflicts()
assert.equal(list.length, 1, 'the lost edit was noticed')
assert.equal(list[0].conflict.table, 'payments')
assert.equal(list[0].conflict.mine.amount, 35000, 'our version is kept')
assert.equal(list[0].current?.amount, 31000, 'next to the current one')
console.log('2. older edit refused, newer one shown, ours kept in a notice: ok')

// ---- Put our version back: it becomes the newest edit and reaches the server.
await restoreMine(list[0].conflict)
startSync('test-user')
await settle('restore sync')
stopSync()
assert.equal(store.payments[payId].amount, 35000, 'our version won after being put back')
assert.equal((await loadConflicts()).length, 0, 'and the notice is gone')
assert.equal((await db.payments.get(payId))?.amount, 35000)
console.log('3. use mine: ok')

// ---- Another refused edit, this time we keep the current version.
store.payments[payId] = { ...store.payments[payId], amount: 40000, updated_at: Date.now() + 120_000, server_updated_at: stamp() }
await db.payments.update(payId, { amount: 36000 })
startSync('test-user')
await settle('second conflict')
stopSync()
const second = await loadConflicts()
assert.equal(second.length, 1)
await keepCurrent(second[0].conflict.id)
assert.equal((await db.payments.get(payId))?.amount, 40000, 'keep current: the newer value stays')
assert.equal(store.payments[payId].amount, 40000)
console.log('4. keep current: ok')

// ---- The newer row cannot be fetched: nothing is marked synced, the edit stays waiting, the next sync recovers.
store.payments[payId] = { ...store.payments[payId], amount: 41000, updated_at: Date.now() + 180_000, server_updated_at: stamp() }
await db.payments.update(payId, { amount: 37000 })
failNextSelectById = true
startSync('test-user')
for (let i = 0; i < 40 && getStatus().state !== 'error'; i++) await sleep(250)
assert.equal(getStatus().state, 'error', 'a failed fetch is reported as a sync problem')
assert.equal((await db.payments.get(payId))?.dirty, 1, 'our edit is still waiting, not silently marked as sent')
stopSync()
startSync('test-user')
await settle('recovery')
stopSync()
assert.equal((await db.payments.get(payId))?.amount, 41000, 'after the retry we match the server')
assert.equal((await loadConflicts()).length, 1, 'and the lost edit is in a notice')
console.log('5. failed fetch then retry: ok')

server.close()
console.log('sync conflicts: all checks passed')
process.exit(0)
