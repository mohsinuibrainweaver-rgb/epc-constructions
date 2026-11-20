// Edge Function "send-reminders": sends push notifications to the devices that turned them on.
//
//   { "action": "daily" }  called every hour by the scheduler (header x-cron-secret). Each device chooses a reminder
//                          hour (Pakistan time, default 9), and an hour's run serves the devices that chose that hour:
//                          - payments due today and overdue ones (status Planned)
//                          - "budget 80% used" and "budget reached", once each per device
//                          Each device also chooses which of these it wants (push_subscriptions.prefs).
//                          Optional "hour" (0-23) overrides the current hour, for testing.
//   { "action": "payment-event", "event": "pending|approved|rejected", "payment_id": "..." }
//                          called by a database trigger (header x-cron-secret) when the builder submits an entry
//                          (the investor is told) or the investor approves or rejects it (the builder is told),
//                          unless that device turned the type off.
//   { "action": "test" }   called from the app by a signed-in person. Sends a test to their own devices.
//
// Deploy it with "Verify JWT" switched OFF: it checks the cron secret or the person's sign-in itself.
// Secrets to set in Supabase: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET (optional VAPID_SUBJECT).
// SUPABASE_URL and the project keys (SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS, or the older
// SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY) are provided by Supabase automatically.
// See docs/PUSH_SETUP.md. The pure logic below is covered by scripts/push-test.ts.

export type Lang = 'en' | 'ur'

export interface Payment {
  purpose: string
  amount: number
  date: string
  status: string
  /** 'pending' and 'rejected' entries (the builder's, not yet approved) are not counted as spent. */
  approval?: string | null
}

export interface Project {
  id: string
  name: string
  budget: number | null
}

export interface Message {
  title: string
  body: string
  tag: string
  url: string
  /** Set on a message that should be remembered as sent, so it is not repeated. */
  logKey?: string
}

/** Pakistan time has no daylight saving: UTC+5 all year. */
export const karachiToday = (now: Date): string => new Date(now.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10)
/** The hour (0-23) it is now in Pakistan. */
export const karachiHour = (now: Date): number => (now.getUTCHours() + 5) % 24

/** What a device wants to hear about. A missing value means yes, so devices saved before this existed get everything. */
export interface Prefs {
  /** Payments due today and overdue ones. */
  due: boolean
  budget80: boolean
  budget100: boolean
  /** The builder submitted an entry that needs the investor's approval. */
  approvalRequests: boolean
  /** The investor approved or rejected an entry. */
  approvalDecisions: boolean
}
export const DEFAULT_PREFS: Prefs = { due: true, budget80: true, budget100: true, approvalRequests: true, approvalDecisions: true }
export const DEFAULT_HOUR = 9

export function prefsOf(raw: unknown): Prefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = { ...DEFAULT_PREFS }
  for (const k of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) if (r[k] === false) out[k] = false
  return out
}

/** The reminder hour a device chose, or 9 when it has none (or an impossible one). */
export const hourOf = (raw: unknown): number => (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : DEFAULT_HOUR)

/** A short stable id for a device, used to remember which alerts it has had (FNV-1a hash of its address). */
export function deviceId(endpoint: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < endpoint.length; i++) h = Math.imul(h ^ endpoint.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

/**
 * The budget alerts one device has already had. The log holds `budget80:<device>` for a device, and plain
 * `budget80` for alerts sent before devices were tracked one by one (those count for every device).
 */
export function sentFor(log: string[], device: string): Set<string> {
  const out = new Set<string>()
  for (const key of log) {
    const i = key.indexOf(':')
    if (i < 0) out.add(key)
    else if (key.slice(i + 1) === device) out.add(key.slice(0, i))
  }
  return out
}

const group = (n: number): string => Math.round(n).toLocaleString('en-US')
const rs = (n: number): string => `Rs ${group(n)}`

const T = {
  en: {
    due: 'Payments due today',
    overdue: 'Overdue payments',
    more: (n: number) => `+${n} more`,
    b80: 'Budget 80% used',
    b100: 'Budget reached',
    budgetBody: (name: string, spent: number, budget: number) => `${name}: ${rs(spent)} of ${rs(budget)} spent`,
    testTitle: 'EPC Construction',
    testBody: 'Reminders are working on this device.',
  },
  ur: {
    due: 'آج کی واجب الادا ادائیگیاں',
    overdue: 'تاخیر شدہ ادائیگیاں',
    more: (n: number) => `مزید ${n}`,
    b80: 'بجٹ کا 80% خرچ ہو گیا',
    b100: 'بجٹ پورا ہو گیا',
    budgetBody: (name: string, spent: number, budget: number) => `${name}: ${rs(budget)} میں سے ${rs(spent)} خرچ`,
    testTitle: 'ای پی سی کنسٹرکشن',
    testBody: 'اس ڈیوائس پر یاد دہانی کام کر رہی ہے۔',
  },
} as const

const list = (items: Payment[], lang: Lang): string => {
  const names = items.slice(0, 3).map((p) => p.purpose)
  const extra = items.length > 3 ? `, ${T[lang].more(items.length - 3)}` : ''
  return `${names.join(', ')}${extra} · ${rs(items.reduce((s, p) => s + p.amount, 0))}`
}

/**
 * The notifications one project produces today, in one language.
 * `sent` holds the budget alerts already sent for this project.
 */
export function buildMessages(
  project: Project,
  payments: Payment[],
  today: string,
  sent: Set<string>,
  lang: Lang,
  prefs: Prefs = DEFAULT_PREFS,
): Message[] {
  const out: Message[] = []
  const t = T[lang]
  const planned = payments.filter((p) => p.status === 'planned')
  const dueToday = planned.filter((p) => p.date === today)
  const overdue = planned.filter((p) => p.date < today)
  if (prefs.due && dueToday.length) out.push({ title: t.due, body: `${project.name}: ${list(dueToday, lang)}`, tag: `due-${project.id}-${today}`, url: '/' })
  if (prefs.due && overdue.length) out.push({ title: t.overdue, body: `${project.name}: ${list(overdue, lang)}`, tag: `overdue-${project.id}`, url: '/' })

  if (project.budget && project.budget > 0) {
    const spent = payments
      .filter((p) => (p.status === 'paid' || p.status === 'advance') && p.approval !== 'pending' && p.approval !== 'rejected')
      .reduce((s, p) => s + p.amount, 0)
    const pct = (spent / project.budget) * 100
    if (pct >= 100 && prefs.budget100 && !sent.has('budget100')) {
      out.push({ title: t.b100, body: t.budgetBody(project.name, spent, project.budget), tag: `budget100-${project.id}`, url: '/reports', logKey: 'budget100' })
    } else if (pct >= 80 && pct < 100 && prefs.budget80 && !sent.has('budget80')) {
      out.push({ title: t.b80, body: t.budgetBody(project.name, spent, project.budget), tag: `budget80-${project.id}`, url: '/reports', logKey: 'budget80' })
    }
  }
  return out
}

/** Which budget alerts count as sent after this run: reaching 100% also settles the 80% one. */
export const keysToLog = (messages: Message[]): string[] =>
  [...new Set(messages.flatMap((m) => (m.logKey === 'budget100' ? ['budget100', 'budget80'] : m.logKey ? [m.logKey] : [])))]

export type ApprovalEvent = 'pending' | 'approved' | 'rejected'

export interface ApprovalPayment {
  purpose: string
  amount: number
  approval?: string | null
  added_by?: string | null
  approved_by?: string | null
  reject_reason?: string | null
}

const TA = {
  en: {
    pending: 'Entry waiting for your approval',
    approved: 'Entry approved',
    rejected: 'Entry rejected',
    by: (n: string) => `Added by ${n}`,
    approvedBy: (n: string) => `Approved by ${n}`,
    reason: (r: string) => `Reason: ${r}`,
  },
  ur: {
    pending: 'اندراج آپ کی منظوری کا منتظر ہے',
    approved: 'اندراج منظور ہو گیا',
    rejected: 'اندراج مسترد ہو گیا',
    by: (n: string) => `${n} نے شامل کیا`,
    approvedBy: (n: string) => `${n} نے منظور کیا`,
    reason: (r: string) => `وجہ: ${r}`,
  },
} as const

/**
 * The message for one approval event, or nothing when the entry has moved on since (so a late or repeated call
 * never sends a stale notice).
 */
export function buildApprovalMessage(event: ApprovalEvent, p: ApprovalPayment, project: string, paymentId: string, lang: Lang): Message | undefined {
  if (p.approval !== event) return undefined
  const t = TA[lang]
  const what = `${p.purpose} · ${rs(p.amount)}`
  const extra =
    event === 'pending' ? t.by(p.added_by || '—') : event === 'approved' ? t.approvedBy(p.approved_by || '—') : p.reject_reason ? t.reason(p.reject_reason) : ''
  return {
    title: t[event],
    body: `${project}: ${what}${extra ? ` · ${extra}` : ''}`,
    tag: `approval-${event}-${paymentId}`,
    url: event === 'pending' ? '/ledger?approval=pending' : event === 'rejected' ? '/ledger?approval=rejected' : `/payments/${paymentId}`,
  }
}

/** Does this device want this approval event? */
export const wantsApproval = (prefs: Prefs, event: ApprovalEvent): boolean => (event === 'pending' ? prefs.approvalRequests : prefs.approvalDecisions)

export const testMessage = (lang: Lang): Message => ({ title: T[lang].testTitle, body: T[lang].testBody, tag: 'test', url: '/settings/notifications' })

// ---------------------------------------------------------------- server part (runs only on Supabase)

interface Sub {
  endpoint: string
  p256dh: string
  auth: string
  lang: Lang
  user_id: string
  /** Missing until the database has the preferences columns (schema.sql); then everything is sent at 9:00. */
  prefs?: unknown
  reminder_hour?: number | null
}

const SUB_BASIC = 'endpoint,p256dh,auth,lang,user_id'
const SUB_FULL = `${SUB_BASIC},prefs,reminder_hour`

const env = (k: string): string => (globalThis as unknown as { Deno: { env: { get(k: string): string | undefined } } }).Deno.env.get(k) ?? ''

/** First value of a JSON dictionary of keys ({"default": "sb_..."}), as Supabase provides them. */
const firstKey = (json: string): string => {
  try {
    return String(Object.values(JSON.parse(json) as Record<string, string>)[0] ?? '')
  } catch {
    return ''
  }
}
/** Server key: the new secret key, else the older service role key. */
const serverKey = (): string => firstKey(env('SUPABASE_SECRET_KEYS')) || env('SUPABASE_SERVICE_ROLE_KEY')
/** Public key, used to ask the auth service who a signed-in person is. */
const publicKey = (): string => firstKey(env('SUPABASE_PUBLISHABLE_KEYS')) || env('SUPABASE_ANON_KEY') || serverKey()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = serverKey()
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : []) as T
}

async function restAll<T>(path: string): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const page = await rest<T[]>(`${path}${path.includes('?') ? '&' : '?'}limit=1000&offset=${offset}`)
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

async function pusher() {
  // Loaded only when sending, so the logic above can be tested without this package. The plain string in
  // import() lets Supabase's bundler find the package; WEB_PUSH_MODULE is only ever set by the test.
  const testModule = env('WEB_PUSH_MODULE')
  const mod = testModule ? await import(/* @vite-ignore */ testModule) : await import('npm:web-push@3.6.7')
  const webpush = mod.default ?? mod
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'https://epc-construction.vercel.app', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  return async (sub: Sub, m: Message): Promise<'sent' | 'gone' | 'failed'> => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: m.title, body: m.body, tag: m.tag, url: m.url, lang: sub.lang }),
        { TTL: 12 * 3600, urgency: 'normal' },
      )
      return 'sent'
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) {
        await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' }).catch(() => undefined)
        return 'gone'
      }
      console.error('push failed', code, (e as Error).message)
      return 'failed'
    }
  }
}

/**
 * Devices matching a filter, with their choices. If the database has not had the preferences columns added yet,
 * it falls back to the basic columns, so nothing stops working while the update is pending.
 */
async function loadSubs(filter: string): Promise<Sub[]> {
  try {
    return await restAll<Sub>(`push_subscriptions?select=${SUB_FULL}&${filter}`)
  } catch {
    return await restAll<Sub>(`push_subscriptions?select=${SUB_BASIC}&${filter}`)
  }
}

async function runTest(userId: string): Promise<Response> {
  const subs = await loadSubs(`user_id=eq.${userId}`)
  const send = await pusher()
  let sent = 0
  for (const s of subs) if ((await send(s, testMessage(s.lang))) === 'sent') sent++
  return json({ sent, devices: subs.length })
}

/** The investors hear about a new entry; the builder hears whether it was approved or rejected. */
async function runApprovalEvent(event: ApprovalEvent, paymentId: string): Promise<Response> {
  const [p] = await rest<(ApprovalPayment & { project_id: string })[]>(
    `payments?select=project_id,purpose,amount,approval,added_by,approved_by,reject_reason&id=eq.${encodeURIComponent(paymentId)}&deleted_at=is.null`,
  )
  if (!p || p.approval !== event) return json({ sent: 0, skipped: 'entry has moved on' })
  const [project] = await rest<{ name: string }[]>(`projects?select=name&id=eq.${p.project_id}`)
  const role = event === 'pending' ? 'investor' : 'builder'
  const members = await rest<{ user_id: string }[]>(`project_members?select=user_id&project_id=eq.${p.project_id}&role=eq.${role}`)
  if (members.length === 0) return json({ sent: 0, recipients: 0 })
  const subs = await loadSubs(`user_id=in.(${members.map((m) => m.user_id).join(',')})`)
  const send = await pusher()
  let sent = 0
  for (const s of subs) {
    if (!wantsApproval(prefsOf(s.prefs), event)) continue
    const m = buildApprovalMessage(event, p, project?.name ?? '', paymentId, s.lang)
    if (m && (await send(s, m)) === 'sent') sent++
  }
  return json({ sent, devices: subs.length })
}

/** One run of the hourly job: serves the devices whose reminder hour it is (Pakistan time). */
async function runDaily(hourOverride?: number): Promise<Response> {
  const now = new Date()
  const today = karachiToday(now)
  const hour = typeof hourOverride === 'number' && Number.isInteger(hourOverride) && hourOverride >= 0 && hourOverride <= 23 ? hourOverride : karachiHour(now)
  const projects = await restAll<Project>('projects?select=id,name,budget&deleted_at=is.null')
  if (projects.length === 0) return json({ sent: 0, projects: 0, hour })
  const ids = projects.map((p) => p.id).join(',')
  const members = await restAll<{ project_id: string; user_id: string }>(`project_members?select=project_id,user_id&project_id=in.(${ids})`)
  const userIds = [...new Set(members.map((m) => m.user_id))]
  if (userIds.length === 0) return json({ sent: 0, projects: projects.length, hour })
  const subs = (await loadSubs(`user_id=in.(${userIds.join(',')})`)).filter((s) => hourOf(s.reminder_hour) === hour)
  if (subs.length === 0) return json({ sent: 0, failed: 0, projects: projects.length, hour })
  const log = await restAll<{ project_id: string; key: string }>(`push_log?select=project_id,key&project_id=in.(${ids})`)
  const send = await pusher()
  let sent = 0
  let failed = 0

  for (const project of projects) {
    const recipients = subs.filter((s) => members.some((m) => m.project_id === project.id && m.user_id === s.user_id))
    if (recipients.length === 0) continue
    const payments = await restAll<Payment>(
      `payments?select=purpose,amount,date,status,approval&project_id=eq.${project.id}&deleted_at=is.null&status=in.(planned,paid,advance)`,
    )
    const projectLog = log.filter((l) => l.project_id === project.id).map((l) => l.key)
    const toLog = new Set<string>()
    for (const s of recipients) {
      const dev = deviceId(s.endpoint)
      for (const m of buildMessages(project, payments, today, sentFor(projectLog, dev), s.lang, prefsOf(s.prefs))) {
        const r = await send(s, m)
        if (r === 'sent') {
          sent++
          keysToLog([m]).forEach((k) => toLog.add(`${k}:${dev}`))
        } else if (r === 'failed') failed++
      }
    }
    if (toLog.size) {
      await rest('push_log', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify([...toLog].map((key) => ({ project_id: project.id, key }))),
      })
    }
  }
  return json({ sent, failed, projects: projects.length, hour })
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; event?: string; payment_id?: string; hour?: number }
    const secret = env('CRON_SECRET')
    const given = req.headers.get('x-cron-secret')
    if (given !== null) {
      // The scheduler is calling. Say plainly why it was refused (no secret values are ever shown).
      if (!secret) return json({ error: 'CRON_SECRET is not set for this function' }, 401)
      if (given !== secret) return json({ error: 'cron secret does not match' }, 401)
      if (body.action === 'daily') return await runDaily(body.hour)
      if (body.action === 'payment-event' && body.payment_id && ['pending', 'approved', 'rejected'].includes(body.event ?? ''))
        return await runApprovalEvent(body.event as ApprovalEvent, body.payment_id)
      return json({ error: 'unknown action' }, 400)
    }
    // Otherwise it must be a signed-in person asking for a test of their own devices.
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'not allowed' }, 401)
    const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: publicKey(), Authorization: `Bearer ${token}` } })
    if (!res.ok) return json({ error: 'not allowed' }, 401)
    const user = (await res.json()) as { id?: string }
    if (!user.id || body.action !== 'test') return json({ error: 'not allowed' }, 401)
    return await runTest(user.id)
  } catch (e) {
    console.error(e)
    return json({ error: 'failed' }, 500)
  }
}

const deno = (globalThis as unknown as { Deno?: { serve(h: (r: Request) => Promise<Response>): void } }).Deno
if (deno) deno.serve(handle)
