// Runs the real sync engine against a small fake of the REST API in which the server refuses what a builder may not write
// (contracts), the way supabase/schema.sql does: the refused row is left out of the rows reported as written.
// Checks that a refused NEW row is taken off the phone (and reported), a refused EDIT is replaced by the server's version,
// that the role per project is kept, and the join-by-code call.
// Run: VITE_SUPABASE_URL=http://localhost:54397 VITE_SUPABASE_ANON_KEY=test-key-not-a-secret npx vite-node scripts/sync-refused-test.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import http from 'node:http'

// Never run this against a real project: it must be pointed at the local fake below.
assert.ok(process.env.VITE_SUPABASE_URL?.startsWith('http://localhost:'), 'set VITE_SUPABASE_URL to http://localhost:54397 (see the line above)')

Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
;(globalThis as any).window = new EventTarget()
;(globalThis as any).document = Object.assign(new EventTarget(), { visibilityState: 'visible' })

const store: Record<string, Record<string, any>> = {}
let tick = 0
const stamp = () => new Date(Date.UTC(2026, 10, 15, 0, 0, 0) + ++tick * 1000).toISOString()
const REFUSED = new Set(['contracts']) // what this fake server's "builder" may not write
let joinAnswer: { code: number; body: unknown } = { code: 200, body: '' }

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
    if (path === 'rpc/join_project') return send(joinAnswer.code, joinAnswer.body)
    if (req.method === 'POST') {
      const rows: any[] = JSON.parse(body)
      const written: any[] = []
      for (const r of rows) {
        if (REFUSED.has(path)) continue // the guard trigger: ignored, not an error
        ;(store[path] ??= {})[r.id] = { ...r, server_updated_at: stamp() }
        written.push({ id: r.id })
      }
      return (req.headers.prefer ?? '').includes('return=representation') ? send(201, written) : send(201)
    }
    let rows = Object.values(store[path] ?? {})
    const cursor = (url.searchParams.get('server_updated_at') ?? '').replace('gte.', '')
    if (cursor) rows = rows.filter((r) => r.server_updated_at >= cursor)
    const ids = /^in\.\((.*)\)$/.exec(url.searchParams.get('id') ?? '')?.[1]
    if (ids !== undefined) {
      const want = new Set(ids.split(',').map((s) => s.replace(/"/g, '')))
      rows = rows.filter((r) => want.has(r.id))
    }
    return send(200, rows)
  })
})
await new Promise<void>((r) => server.listen(54397, r))

const { db } = await import('../src/db/db')
const actions = await import('../src/db/actions')
const { startSync, stopSync, getStatus, onRefused, joinProject } = await import('../src/sync/engine')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const dirtyCount = async () => (await Promise.all([db.projects, db.phases, db.payments, db.contracts].map((t) => t.where('dirty').equals(1).count()))).reduce((a, b) => a + b, 0)
async function settle(label: string) {
  for (let i = 0; i < 80; i++) {
    const s = getStatus()
    if (s.state === 'error') throw new Error(`${label}: ${s.error}`)
    if (s.state === 'idle' && (await dirtyCount()) === 0) return
    await sleep(250)
  }
  throw new Error(`${label}: did not settle ${JSON.stringify(getStatus())}`)
}

const refusedCounts: number[] = []
onRefused((n) => refusedCounts.push(n))

// ---- A refused NEW row (a builder adds a contract) is taken off this phone and reported.
const pid = await actions.createProject({ name: 'House #3', location: 'Wah Cantt', budget: 1000 }, 'blank')
await actions.saveContract({ projectId: pid, title: 'Grey labour', amount: 2500000, date: '2026-11-01', status: 'active', variations: [] } as any)
assert.equal(await db.contracts.count(), 1)
// The server tells this phone what it is in the project.
store.project_members = { m1: { project_id: pid, user_id: 'test-user', role: 'builder', server_updated_at: stamp() } }
startSync('test-user')
await settle('first sync')
assert.equal(await db.contracts.count(), 0, 'the refused contract is not left on the phone as if it were saved')
assert.equal(store.contracts, undefined, 'and it is not on the server')
assert.deepEqual(refusedCounts, [1], 'the person is told once')
assert.equal((await db.projects.count()), 1, 'the project itself synced')
assert.equal((await db.settings.get(`member.role.${pid}`))?.value, 'builder', 'the role in this project is kept for the app')
stopSync()
console.log('1. refused new row: removed and reported, role kept')

// ---- A refused EDIT (the server has the contract; the builder changed its amount): the server's version comes back.
store.contracts = {
  c1: { id: 'c1', project_id: pid, title: 'Grey labour', amount: 2500000, date: '2026-11-01', status: 'active', variations: [], created_at: 1, updated_at: 5, deleted_at: null, server_updated_at: stamp() },
}
await db.contracts.put({ id: 'c1', projectId: pid, title: 'Grey labour', amount: 2500000, date: '2026-11-01', status: 'active', variations: [], createdAt: 1, updatedAt: 5, dirty: 0 } as any)
await actions.saveContract({ id: 'c1', projectId: pid, title: 'Grey labour', amount: 1, date: '2026-11-01', status: 'active', variations: [] } as any)
assert.equal((await db.contracts.get('c1'))?.amount, 1)
refusedCounts.length = 0
startSync('test-user')
await settle('second sync')
assert.equal((await db.contracts.get('c1'))?.amount, 2500000, 'the server\'s version is back on the phone')
assert.deepEqual(refusedCounts, [], 'an edit is not a removed row')
stopSync()
console.log('2. refused edit: the real version comes back')

// ---- Membership follows the server: a project the person was removed from loses its role.
store.project_members = {}
startSync('test-user')
await settle('third sync')
assert.equal(await db.settings.get(`member.role.${pid}`), undefined, 'no longer a member: no role kept')
stopSync()
console.log('3. membership refresh: ok')

// ---- Joining with a code.
startSync('test-user')
await settle('fourth sync')
joinAnswer = { code: 200, body: pid }
store.project_members = { m2: { project_id: pid, user_id: 'test-user', role: 'builder', server_updated_at: stamp() } }
const ok = await joinProject('ABCD-EFGH-IJKL')
assert.deepEqual(ok, { ok: true, projectId: pid })
assert.equal((await db.settings.get(`member.role.${pid}`))?.value, 'builder', 'joining records the role at once')
joinAnswer = { code: 400, body: { code: 'P0001', message: 'invalid_code', details: null, hint: null } }
assert.deepEqual(await joinProject('WRONG-WRONG-WRON'), { ok: false, reason: 'invalid' })
joinAnswer = { code: 404, body: { code: 'PGRST202', message: 'Could not find the function public.join_project', details: null, hint: null } }
assert.deepEqual(await joinProject('ABCD-EFGH-IJKL'), { ok: false, reason: 'notReady' }, 'a server that is not updated yet says so')
stopSync()
console.log('4. join by code: ok')

console.log('sync refused: all checks passed')
server.close()
process.exit(0)
