// End-to-end check of the sync engine against a real Postgres + PostgREST (no Supabase account needed).
// Each run is one "device" (fresh in-memory IndexedDB). See the commands in docs/SUPABASE_SETUP.md.
import 'fake-indexeddb/auto'
import { createHmac } from 'node:crypto'

// Minimal browser globals the engine touches.
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
;(globalThis as any).window = new EventTarget()
;(globalThis as any).document = Object.assign(new EventTarget(), { visibilityState: 'visible' })

const step = process.env.STEP ?? ''
const userId = process.env.TEST_USER_ID as string
const email = process.env.TEST_EMAIL as string
const secret = process.env.JWT_SECRET as string

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const head = b64({ alg: 'HS256', typ: 'JWT' })
const body = b64({ role: 'authenticated', sub: userId, email, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
const jwt = `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`
process.env.VITE_SUPABASE_ANON_KEY = jwt

const { db } = await import('../src/db/db')
const actions = await import('../src/db/actions')
const { startSync, stopSync, getStatus, syncNow } = await import('../src/sync/engine')
const { supabase } = await import('../src/sync/supabase')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function settle(label: string) {
  for (let i = 0; i < 60; i++) {
    const s = getStatus()
    if (s.state === 'idle' && (await local()).dirty === 0) return
    if (s.state === 'error') throw new Error(`${label}: sync error: ${s.error}`)
    await sleep(250)
  }
  throw new Error(`${label}: did not settle ${JSON.stringify(getStatus())}`)
}
async function local() {
  const [p, ph, v, pay, plans, transfers] = await Promise.all([
    db.projects.toArray(),
    db.phases.toArray(),
    db.vendors.toArray(),
    db.payments.toArray(),
    db.plans.toArray(),
    db.transfers.toArray(),
  ])
  return {
    projects: p.filter((x) => !x.deletedAt).map((x) => x.name),
    fee: p[0] ? `${p[0].feeBasis ?? ''}:${p[0].feePercent ?? p[0].feeAmount ?? ''}` : '',
    plans: plans.filter((x) => !x.deletedAt).map((x) => `${x.purpose}:${x.weekday}`),
    transfers: transfers.filter((x) => !x.deletedAt).map((x) => `${x.kind}:${x.amount}`).sort(),
    planPayments: pay.filter((x) => x.planId).length,
    phases: ph.filter((x) => !x.deletedAt).length,
    vendors: v.filter((x) => !x.deletedAt).map((x) => x.name),
    payments: pay.filter((x) => !x.deletedAt).map((x) => `${x.purpose}:${x.amount}`).sort(),
    dirty: (await Promise.all([db.projects, db.phases, db.vendors, db.payments, db.plans, db.transfers].map((t) => t.where('dirty').equals(1).count()))).reduce((a, b) => a + b, 0),
  }
}

startSync(userId)
try {
  if (step === 'A1') {
    const pid = await actions.createProject({ name: 'House #3', location: 'Wah Cantt', budget: 12_000_000 }, 'standard')
    const vid = await actions.saveVendor({ projectId: pid, name: 'Hakimeen', role: 'builder', phone: '0300' })
    await actions.savePayment(
      { projectId: pid, date: '2026-11-15', amount: 225500, vendorId: vid, category: 'material', purpose: 'Sariya', status: 'paid', mode: 'bank', paidBy: 'investor', addedBy: 'A' },
      [],
      [],
    )
    await actions.saveFee(pid, { basis: 'percent', percent: 5 })
    await actions.saveTransfer({ projectId: pid, date: '2026-11-08', amount: 500000, kind: 'advance' })
    await actions.savePlan({ projectId: pid, purpose: 'Foreman weekly', amount: 90000, weekday: 4, vendorId: vid, category: 'labour', mode: 'cash', paidBy: 'investor', startDate: '2026-11-10', active: true })
    await actions.ensurePlanPayments(pid, '2026-11-15')
    await settle('A1')
    const { error } = await supabase!.from('project_invites').insert({ project_id: pid, email: 'B@X.com', role: 'builder', invited_by: userId })
    if (error) throw error
    console.log('A1 local', JSON.stringify(await local()))
  } else if (step === 'B1') {
    await syncNow()
    await settle('B1 pull')
    const seen = await local()
    console.log('B1 after first sync', JSON.stringify(seen))
    await actions.ensurePlanPayments((await db.projects.toArray())[0].id, '2026-11-15') // same day: must not duplicate
    await settle('B1 plan check')
    console.log('B1 after plan generation', JSON.stringify({ planPayments: (await local()).planPayments }))
    const pid = (await db.projects.toArray())[0].id
    await actions.savePayment(
      { projectId: pid, date: '2026-11-16', amount: 7000, category: 'misc', miscType: 'meals', purpose: 'Roof day meals', status: 'paid', mode: 'cash', paidBy: 'builder', addedBy: 'B' },
      [],
      [],
    )
    await settle('B1 push')
    console.log('B1 after adding a payment', JSON.stringify(await local()))
  } else if (step === 'A2') {
    await syncNow()
    await settle('A2 pull')
    console.log('A2 fresh device sees', JSON.stringify(await local()))
    const pay = (await db.payments.toArray()).find((p) => p.purpose === 'Sariya')!
    await actions.savePayment({ ...pay, amount: 230000, addedBy: pay.addedBy }, [], [])
    const phase = (await db.phases.toArray())[0]
    await actions.deletePhase(phase.id)
    await actions.binPayment((await db.payments.toArray()).find((p) => p.purpose === 'Roof day meals')!.id)
    await settle('A2 push')
    console.log('A2 after edit, phase delete, bin', JSON.stringify(await local()))
  } else if (step === 'B2') {
    await syncNow()
    await settle('B2 pull')
    console.log('B2 sees A edits', JSON.stringify(await local()))
  } else if (step === 'X') {
    // An uninvited user must see nothing and be unable to write.
    await syncNow()
    await settle('X pull')
    console.log('X (stranger) sees', JSON.stringify(await local()))
  }
  stopSync()
  await sleep(100)
  process.exit(0)
} catch (e) {
  console.error('FAILED', e)
  stopSync()
  process.exit(1)
}
