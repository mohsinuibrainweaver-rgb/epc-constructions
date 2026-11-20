// Checks that the sync engine copes with a server that has the OLD schema (no money tables or columns),
// and finishes the job once the schema is updated. Uses a tiny fake of the REST API, no database needed.
// Run: VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_ANON_KEY=test-key-not-a-secret npx vite-node scripts/sync-fallback-test.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import http from 'node:http'

Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
;(globalThis as any).window = new EventTarget()
;(globalThis as any).document = Object.assign(new EventTarget(), { visibilityState: 'visible' })

let mode: 'old' | 'new' = 'old'
const store: Record<string, Record<string, any>> = {}
const NEW_TABLES = ['payment_plans', 'transfers', 'materials', 'project_files', 'contracts']
const NEW_COLS: Record<string, string[]> = { projects: ['fee_basis', 'fee_amount', 'fee_percent', 'retainer_amount', 'retainer_start', 'retainer_end'], phases: ['fee_kind', 'fee_value', 'done'], payments: ['plan_id', 'approval', 'approved_by', 'approved_at', 'reject_reason', 'contract_id'] }
let tick = 0
const stamp = () => new Date(Date.UTC(2026, 10, 15, 0, 0, 0) + ++tick * 1000).toISOString()

const server = http.createServer((req, res) => {
  const url = new URL(req.url!, 'http://x')
  const path = url.pathname.replace('/rest/v1/', '')
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const send = (code: number, json: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(json))
    }
    if (url.pathname.startsWith('/storage/v1/')) return send(200, { Key: url.pathname })
    if (path === 'rpc/claim_invites') return send(200, 0)
    if (mode === 'old' && NEW_TABLES.includes(path)) {
      return send(404, { code: 'PGRST205', message: `Could not find the table 'public.${path}' in the schema cache`, details: null, hint: null })
    }
    if (req.method === 'POST') {
      const rows: any[] = JSON.parse(body)
      if (mode === 'old') {
        for (const col of NEW_COLS[path] ?? []) {
          if (rows.some((r) => col in r)) {
            return send(400, { code: 'PGRST204', message: `Could not find the '${col}' column of '${path}' in the schema cache`, details: null, hint: null })
          }
        }
      }
      for (const r of rows) (store[path] ??= {})[r.id] = { ...r, server_updated_at: stamp() }
      res.writeHead(201)
      return res.end()
    }
    const cursor = (url.searchParams.get('server_updated_at') ?? '').replace('gte.', '')
    const rows = Object.values(store[path] ?? {}).filter((r) => !cursor || r.server_updated_at >= cursor)
    return send(200, rows)
  })
})
await new Promise<void>((r) => server.listen(54399, r))

const { db } = await import('../src/db/db')
const actions = await import('../src/db/actions')
const { startSync, stopSync, getStatus, syncNow } = await import('../src/sync/engine')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const dirtyIds = async () => {
  const out: Record<string, number> = {}
  for (const t of [db.projects, db.phases, db.vendors, db.plans, db.payments, db.transfers, db.materials, db.files, db.contracts]) out[t.name] = await t.where('dirty').equals(1).count()
  return out
}
async function settle(label: string, wantDirty: (d: Record<string, number>) => boolean) {
  for (let i = 0; i < 60; i++) {
    const s = getStatus()
    if (s.state === 'error') throw new Error(`${label}: ${s.error}`)
    if (s.state === 'idle' && wantDirty(await dirtyIds())) return
    await sleep(250)
  }
  throw new Error(`${label}: did not settle ${JSON.stringify(getStatus())} ${JSON.stringify(await dirtyIds())}`)
}

const pid = await actions.createProject({ name: 'House #3', location: 'Wah Cantt', budget: 1000 }, 'standard')
const vid = await actions.saveVendor({ projectId: pid, name: 'Hakimeen', role: 'foreman' })
await actions.savePayment({ projectId: pid, date: '2026-11-10', amount: 100, category: 'material', purpose: 'Plain payment', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'A' }, [], [])
await actions.savePayment({ projectId: pid, date: '2026-11-10', amount: 700, category: 'material', purpose: 'Builder entry', status: 'paid', mode: 'cash', paidBy: 'builder', addedBy: 'B', approval: 'pending' }, [], [])
await actions.saveFee(pid, { basis: 'retainer', retainer: { amount: 100000, start: '2026-11-01' } })
await actions.saveFee(pid, { basis: 'percent', percent: 5 })
const donePhase = (await db.phases.where('projectId').equals(pid).first())!
await actions.setPhaseDone(donePhase.id, true)
await actions.saveTransfer({ projectId: pid, date: '2026-11-08', amount: 500000, kind: 'advance' })
await actions.saveMaterial({ projectId: pid, date: '2026-11-09', item: 'Bricks', quantity: 1000, unit: 'piece', rate: 16.5 })
await actions.addFiles(pid, 'document', [{ blob: new Blob(['hello'], { type: 'application/pdf' }), name: 'c.pdf' }], { date: '2026-11-09', docType: 'contract' })
const cid = await actions.saveContract({ projectId: pid, title: 'Labour', amount: 100000, date: '2026-11-01', status: 'active', variations: [{ id: 'v1', title: 'Extra', amount: 5000, date: '2026-11-02' }] })
await actions.savePayment({ projectId: pid, date: '2026-11-11', amount: 300, category: 'labour', purpose: 'On contract', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'A', contractId: cid }, [], [])
await actions.savePlan({ projectId: pid, purpose: 'Foreman weekly', amount: 90000, weekday: 4, vendorId: vid, category: 'labour', mode: 'cash', paidBy: 'investor', startDate: '2026-11-10', active: true })
assert.equal(await actions.ensurePlanPayments(pid, '2026-11-15'), 2, 'Thursdays 12 and 19 Nov are created')
assert.equal(await actions.ensurePlanPayments(pid, '2026-11-15'), 0, 'running it again creates nothing')

startSync('test-user')

// 1. Old server: the old tables sync, the new things wait, and nothing crashes.
await settle('old server', (d) => d.phases === 1 && d.vendors === 0 && d.plans > 0 && d.transfers > 0 && d.materials > 0 && d.files > 0 && d.contracts > 0)
const w = getStatus().warning ?? ''
assert.match(w, /payment_plans/); assert.match(w, /transfers/); assert.match(w, /materials/); assert.match(w, /project_files/); assert.match(w, /fee_basis/); assert.match(w, /plan_id/); assert.match(w, /retainer_amount/); assert.match(w, /fee_kind/); assert.match(w, /approval/); assert.match(w, /contract/)
assert.equal(Object.keys(store.phases ?? {}).length, 12, 'phases reached the old server')
assert.equal(Object.keys(store.vendors ?? {}).length, 1)
assert.ok(Object.values(store.payments ?? {}).some((p: any) => p.purpose === 'Plain payment'), 'plain payment reached the old server')
assert.equal(Object.keys(store.payment_plans ?? {}).length, 0); assert.equal(Object.keys(store.transfers ?? {}).length, 0); assert.equal(Object.keys(store.materials ?? {}).length, 0); assert.equal(Object.keys(store.project_files ?? {}).length, 0); assert.equal(Object.keys(store.contracts ?? {}).length, 0)
const d1 = await dirtyIds()
assert.ok(d1.projects >= 1 && d1.plans === 1 && d1.transfers === 1 && d1.materials === 1 && d1.files === 1 && d1.contracts === 1 && d1.payments >= 2, 'rows using the new schema keep waiting: ' + JSON.stringify(d1))
console.log('old schema: rest syncs, new rows wait', JSON.stringify(d1), '| warning:', w)

// 2. Schema updated on the server: everything catches up.
mode = 'new'
await syncNow()
await settle('new server', (d) => Object.values(d).every((n) => n === 0))
assert.equal(Object.keys(store.payment_plans).length, 1)
assert.equal(Object.keys(store.transfers).length, 1)
assert.match((Object.values(store.project_files)[0] as any).path, /\/files\/.+\.pdf$/, 'file path uses the project folder')
assert.equal((Object.values(store.contracts)[0] as any).variations[0].amount, 5000, 'variations arrive with the contract')
assert.ok(Object.values(store.payments).some((p: any) => p.contract_id === cid), 'the contract link arrived')
assert.equal((Object.values(store.materials)[0] as any).rate, 16.5, 'material rate keeps its decimals')
assert.equal((Object.values(store.projects)[0] as any).fee_basis, 'percent')
assert.equal((Object.values(store.projects)[0] as any).retainer_amount, 100000, 'the retainer kept for later arrived')
assert.equal((store.phases[donePhase.id] as any).done, true, 'phase completion arrived')
assert.ok(Object.values(store.payments).filter((p: any) => p.plan_id).length === 2, 'plan links arrived')
assert.equal((Object.values(store.payments).find((p: any) => p.purpose === 'Builder entry') as any).approval, 'pending', 'approval state arrived')
console.log('after schema update: everything synced')
stopSync(); server.close(); process.exit(0)
