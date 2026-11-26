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
  id?: string
  purpose: string
  amount: number
  date: string
  status: string
  /** 'pending' and 'rejected' entries (the builder's, not yet approved) are not counted as spent. */
  approval?: string | null
  added_by?: string | null
  created_at?: number | null
  phase_id?: string | null
  contract_id?: string | null
  paid_by?: string | null
  project_cash_amount?: number | null
}

export interface Project {
  id: string
  name: string
  budget: number | null
  owner_id?: string
  target_finish?: string | null
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
  /** Important changes made by another project member, split so each family can be controlled in the UI. */
  paymentActivity: boolean
  phaseActivity: boolean
  cashActivity: boolean
  contractActivity: boolean
  memberActivity: boolean
  projectActivity: boolean
  /** Payments due today and overdue ones. */
  due: boolean
  /** Follow-ups such as stale approvals, missing proof and deadlines. */
  attention: boolean
  budget80: boolean
  budget100: boolean
  /** The builder submitted an entry that needs the investor's approval. */
  approvalRequests: boolean
  /** The investor approved or rejected an entry. */
  approvalDecisions: boolean
}
export const DEFAULT_PREFS: Prefs = {
  paymentActivity: true,
  phaseActivity: true,
  cashActivity: true,
  contractActivity: true,
  memberActivity: true,
  projectActivity: true,
  due: true,
  attention: true,
  budget80: true,
  budget100: true,
  approvalRequests: true,
  approvalDecisions: true,
}
export const DEFAULT_HOUR = 9

export function prefsOf(raw: unknown): Prefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = { ...DEFAULT_PREFS }
  const activityKeys: (keyof Prefs)[] = ['paymentActivity', 'phaseActivity', 'cashActivity', 'contractActivity', 'memberActivity', 'projectActivity']
  for (const k of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
    if (r[k] === false || (activityKeys.includes(k) && r[k] === undefined && r.activity === false)) out[k] = false
  }
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
const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const T = {
  en: {
    due: 'Payments due today',
    soon: 'Payments due soon',
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
    soon: 'جلد واجب الادا ادائیگیاں',
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
  const dueSoon = planned.filter((p) => p.date > today && p.date <= addDays(today, 3))
  const overdue = planned.filter((p) => p.date < today)
  if (prefs.due && dueSoon.length) out.push({ title: t.soon, body: `${project.name}: ${list(dueSoon, lang)}`, tag: `soon-${project.id}-${today}`, url: '/ledger?status=planned' })
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

export type ActivityEvent =
  | 'payment_added' | 'payment_changed' | 'payment_deleted' | 'payment_restored' | 'payment_skipped' | 'payment_rescheduled' | 'payment_paid'
  | 'phase_completed' | 'phase_reopened' | 'phase_estimate_changed'
  | 'cash_added' | 'cash_changed' | 'cash_deleted'
  | 'contract_created' | 'contract_changed' | 'contract_completed' | 'contract_cancelled' | 'contract_deleted' | 'contract_restored'
  | 'member_joined' | 'member_removed' | 'permissions_changed'
  | 'project_budget_changed' | 'project_changed' | 'project_deleted'

export interface ActivityContext {
  event: ActivityEvent
  project: string
  actor?: string
  subject?: string
  item?: string
  amount?: number
  id?: string
}

const ACTIVITY = {
  en: {
    payment_added: 'New payment added', payment_changed: 'Payment updated', payment_deleted: 'Payment removed', payment_restored: 'Payment restored',
    payment_skipped: 'Payment skipped', payment_rescheduled: 'Payment rescheduled', payment_paid: 'Payment marked paid',
    phase_completed: 'Phase completed', phase_reopened: 'Phase reopened', phase_estimate_changed: 'Phase estimate changed',
    cash_added: 'Project cash recorded', cash_changed: 'Project cash updated', cash_deleted: 'Project cash entry removed',
    contract_created: 'Contract added', contract_changed: 'Contract updated', contract_completed: 'Contract completed', contract_cancelled: 'Contract cancelled',
    contract_deleted: 'Contract removed', contract_restored: 'Contract restored', member_joined: 'Member joined the project',
    member_removed: 'Project access removed', permissions_changed: 'Your project permissions changed', project_budget_changed: 'Project budget changed',
    project_changed: 'Project details changed', project_deleted: 'Project deleted',
    by: (actor: string) => ` by ${actor}`,
    generic: (project: string) => `There is new activity in ${project}.`,
    removed: (project: string) => `You were removed from ${project}.`,
    permissions: (project: string) => `Your access to ${project} was updated.`,
  },
  ur: {
    payment_added: 'نئی ادائیگی شامل ہوئی', payment_changed: 'ادائیگی تبدیل ہوئی', payment_deleted: 'ادائیگی ہٹا دی گئی', payment_restored: 'ادائیگی بحال ہوئی',
    payment_skipped: 'ادائیگی چھوڑ دی گئی', payment_rescheduled: 'ادائیگی کی تاریخ بدلی گئی', payment_paid: 'ادائیگی ادا شدہ قرار دی گئی',
    phase_completed: 'مرحلہ مکمل ہوا', phase_reopened: 'مرحلہ دوبارہ کھولا گیا', phase_estimate_changed: 'مرحلے کا اندازہ تبدیل ہوا',
    cash_added: 'پراجیکٹ کیش درج ہوا', cash_changed: 'پراجیکٹ کیش تبدیل ہوا', cash_deleted: 'پراجیکٹ کیش کا اندراج ہٹا دیا گیا',
    contract_created: 'معاہدہ شامل ہوا', contract_changed: 'معاہدہ تبدیل ہوا', contract_completed: 'معاہدہ مکمل ہوا', contract_cancelled: 'معاہدہ منسوخ ہوا',
    contract_deleted: 'معاہدہ ہٹا دیا گیا', contract_restored: 'معاہدہ بحال ہوا', member_joined: 'نیا فرد پراجیکٹ میں شامل ہوا',
    member_removed: 'پراجیکٹ کی رسائی ختم ہوئی', permissions_changed: 'آپ کی پراجیکٹ اجازتیں بدل گئیں', project_budget_changed: 'پراجیکٹ بجٹ تبدیل ہوا',
    project_changed: 'پراجیکٹ کی تفصیل تبدیل ہوئی', project_deleted: 'پراجیکٹ حذف ہوا',
    by: (actor: string) => `، ${actor} کی طرف سے`,
    generic: (project: string) => `${project} میں نئی سرگرمی ہوئی ہے۔`,
    removed: (project: string) => `آپ کو ${project} سے ہٹا دیا گیا ہے۔`,
    permissions: (project: string) => `${project} میں آپ کی رسائی تبدیل ہوئی ہے۔`,
  },
} as const

/** A permission-safe activity message. People without access still learn that the project changed, without financial detail. */
export function buildActivityMessage(c: ActivityContext, lang: Lang, detailed = true): Message {
  const t = ACTIVITY[lang]
  const title = t[c.event]
  const url = c.event.startsWith('payment_') ? (c.id ? `/payments/${c.id}` : '/ledger')
    : c.event.startsWith('phase_') ? (c.id ? `/phases/${c.id}` : '/phases')
      : c.event.startsWith('contract_') ? (c.id ? `/contracts/${c.id}` : '/contracts')
        : c.event.startsWith('cash_') ? '/settlement'
          : c.event === 'permissions_changed' ? '/permissions'
            : c.event === 'member_removed' || c.event === 'project_deleted' ? '/projects' : '/'
  let body: string
  if (c.event === 'member_removed') body = t.removed(c.project)
  else if (c.event === 'permissions_changed') body = t.permissions(c.project)
  else if (!detailed) body = t.generic(c.project)
  else {
    const detail = [c.item, c.amount && c.amount > 0 ? rs(c.amount) : ''].filter(Boolean).join(' · ')
    body = `${c.project}${detail ? `: ${detail}` : ''}${c.actor ? t.by(c.actor) : ''}`
  }
  return { title, body, tag: `activity-${c.event}-${c.id ?? c.project}`, url }
}

/** The activity switch that owns an instant event. Shared by delivery and tests so the settings cannot drift. */
export function wantsActivity(prefs: Prefs, event: ActivityEvent): boolean {
  if (event.startsWith('payment_')) return prefs.paymentActivity
  if (event.startsWith('phase_')) return prefs.phaseActivity
  if (event.startsWith('cash_')) return prefs.cashActivity
  if (event.startsWith('contract_')) return prefs.contractActivity
  if (event.startsWith('member_') || event === 'permissions_changed') return prefs.memberActivity
  return prefs.projectActivity
}

export interface AttentionPhase { id: string; name?: string | null; key?: string | null; budget?: number | null; done?: boolean | null }
export interface AttentionContract { id: string; title: string; amount: number; status: string; variations?: { amount?: number }[] | null }
export interface AttentionTransfer { member_id?: string | null; amount: number; kind: string; deleted_at?: number | null }
export interface AttentionInvite { id: string; expires_at?: string | null }
export interface AttentionInput {
  project: Project
  payments: Payment[]
  phases: AttentionPhase[]
  contracts: AttentionContract[]
  transfers: AttentionTransfer[]
  attachmentPaymentIds: Set<string>
  invites: AttentionInvite[]
  today: string
  nowMs: number
  sent: Set<string>
  userId: string
  permissions: Set<string>
  prefs: Prefs
}

const ATTN = {
  en: {
    pending: 'Approval still waiting', rejected: 'Rejected payment needs correction', proof: 'Receipt or proof is missing',
    finishSoon: 'Project target date is near', finishLate: 'Project target date has passed', invite: 'Invitation expires within 24 hours',
    phase80: 'Phase estimate 80% used', phase100: 'Phase estimate reached', contract: 'Contract is overpaid', cash: 'Project cash may be short',
  },
  ur: {
    pending: 'منظوری ابھی باقی ہے', rejected: 'مسترد ادائیگی درست کرنا باقی ہے', proof: 'رسید یا ثبوت موجود نہیں',
    finishSoon: 'پراجیکٹ کی آخری تاریخ قریب ہے', finishLate: 'پراجیکٹ کی آخری تاریخ گزر گئی', invite: 'دعوت 24 گھنٹے میں ختم ہوگی',
    phase80: 'مرحلے کے اندازے کا 80٪ خرچ ہو گیا', phase100: 'مرحلے کا اندازہ پورا ہو گیا', contract: 'معاہدے میں زیادہ ادائیگی ہوئی', cash: 'پراجیکٹ کیش کم پڑ سکتا ہے',
  },
} as const

/** Daily follow-ups. One-time thresholds carry a log key; unresolved work deliberately repeats once per day. */
export function buildAttentionMessages(x: AttentionInput, lang: Lang): Message[] {
  if (!x.prefs.attention) return []
  const t = ATTN[lang]
  const out: Message[] = []
  const owner = x.project.owner_id === x.userId
  const dayAgo = x.nowMs - 24 * 3600 * 1000
  const canApprove = owner || x.permissions.has('approvePayments')
  const canPayments = owner || x.permissions.has('viewLedger')
  const canPhases = owner || x.permissions.has('viewPhases')
  const canContracts = owner || x.permissions.has('viewContracts')

  const stalePending = x.payments.filter((p) => p.approval === 'pending' && (p.created_at ?? x.nowMs) <= dayAgo)
  if (canApprove && stalePending.length) out.push({ title: t.pending, body: `${x.project.name}: ${stalePending.length}`, tag: `pending-${x.project.id}-${x.today}`, url: '/ledger?approval=pending' })
  const staleRejected = x.payments.filter((p) => p.approval === 'rejected' && p.added_by === x.userId && (p.created_at ?? x.nowMs) <= dayAgo)
  if (staleRejected.length) out.push({ title: t.rejected, body: `${x.project.name}: ${list(staleRejected, lang)}`, tag: `rejected-${x.project.id}-${x.today}`, url: '/ledger?approval=rejected' })

  if (owner || canPayments) {
    const missing = x.payments.filter((p) => p.id && (p.status === 'paid' || p.status === 'advance') && p.approval !== 'pending' && p.approval !== 'rejected' && (p.created_at ?? x.nowMs) <= dayAgo && !x.attachmentPaymentIds.has(p.id))
    if (missing.length) out.push({ title: t.proof, body: `${x.project.name}: ${missing.length}`, tag: `proof-${x.project.id}-${x.today}`, url: '/ledger?missing=receipt' })
  }

  if (owner && x.project.target_finish) {
    if (x.project.target_finish < x.today) out.push({ title: t.finishLate, body: `${x.project.name}: ${x.project.target_finish}`, tag: `finish-late-${x.project.id}-${x.today}`, url: '/' })
    else if (x.project.target_finish <= addDays(x.today, 7)) out.push({ title: t.finishSoon, body: `${x.project.name}: ${x.project.target_finish}`, tag: `finish-soon-${x.project.id}-${x.today}`, url: '/' })
  }
  if (owner) {
    const expiring = x.invites.filter((i) => i.expires_at && i.expires_at > new Date(x.nowMs).toISOString() && i.expires_at <= new Date(x.nowMs + 24 * 3600 * 1000).toISOString())
    if (expiring.length) out.push({ title: t.invite, body: `${x.project.name}: ${expiring.length}`, tag: `invite-${x.project.id}-${x.today}`, url: '/settings/project' })
  }

  if (canPhases) for (const ph of x.phases.filter((p) => !p.done && p.budget && p.budget > 0)) {
    const spent = x.payments.filter((p) => p.phase_id === ph.id && (p.status === 'paid' || p.status === 'advance') && p.approval !== 'pending' && p.approval !== 'rejected').reduce((s, p) => s + p.amount, 0)
    const pct = spent / (ph.budget ?? 1)
    const name = ph.name || ph.key || 'Phase'
    const key = pct >= 1 ? `phase100-${ph.id}` : `phase80-${ph.id}`
    if (pct >= 0.8 && !x.sent.has(key)) out.push({ title: pct >= 1 ? t.phase100 : t.phase80, body: `${x.project.name}: ${name} · ${Math.round(pct * 100)}%`, tag: key, url: `/phases/${ph.id}`, logKey: key })
  }

  if (canContracts) for (const c of x.contracts.filter((v) => v.status === 'active')) {
    const agreed = c.amount + (c.variations ?? []).reduce((s, v) => s + Number(v.amount ?? 0), 0)
    const paid = x.payments.filter((p) => p.contract_id === c.id && (p.status === 'paid' || p.status === 'advance') && p.approval !== 'pending' && p.approval !== 'rejected').reduce((s, p) => s + p.amount, 0)
    if (paid > agreed) out.push({ title: t.contract, body: `${x.project.name}: ${c.title} · ${rs(paid - agreed)}`, tag: `contract-over-${c.id}-${x.today}`, url: `/contracts/${c.id}` })
  }

  const members = new Set(x.transfers.map((v) => v.member_id).filter((v): v is string => Boolean(v)))
  for (const member of members) {
    if (!owner && member !== x.userId) continue
    const tr = x.transfers.filter((v) => !v.deleted_at && v.member_id === member)
    const given = tr.filter((v) => v.kind === 'advance' || v.kind === 'topup').reduce((s, v) => s + v.amount, 0)
    const returned = tr.filter((v) => v.kind === 'return').reduce((s, v) => s + v.amount, 0)
    const used = x.payments.filter((p) => p.paid_by === member && (p.status === 'paid' || p.status === 'advance') && p.approval !== 'pending' && p.approval !== 'rejected').reduce((s, p) => s + Math.max(0, p.project_cash_amount ?? 0), 0)
    const needed = x.payments.filter((p) => p.paid_by === member && p.status === 'planned' && p.date >= x.today && p.date <= addDays(x.today, 7)).reduce((s, p) => s + p.amount, 0)
    const short = Math.max(0, needed - Math.max(0, given - returned - used))
    if (short > 0) out.push({ title: t.cash, body: `${x.project.name}: ${rs(short)}`, tag: `cash-short-${member}-${x.today}`, url: '/cash-forecast' })
  }
  return out
}

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
  const [project] = await rest<{ name: string; owner_id: string }[]>(`projects?select=name,owner_id&id=eq.${p.project_id}`)
  let members: { user_id: string }[]
  if (event === 'pending') {
    const allowed = await restAll<{ user_id: string; enabled: boolean }>(`member_permissions?select=user_id,enabled&project_id=eq.${p.project_id}&permission=eq.approvePayments&enabled=eq.true`)
    members = [...new Set([project?.owner_id, ...allowed.map((m) => m.user_id)].filter((id): id is string => Boolean(id)))].map((user_id) => ({ user_id }))
  } else if (p.added_by && /^[0-9a-f-]{36}$/i.test(p.added_by)) {
    members = [{ user_id: p.added_by }]
  } else {
    // Legacy entries stored a display name instead of the creator's id.
    members = await rest<{ user_id: string }[]>(`project_members?select=user_id&project_id=eq.${p.project_id}&role=eq.builder`)
  }
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

interface ActivityRequest {
  event: ActivityEvent
  project_id: string
  record_id?: string
  actor_id?: string | null
  subject_id?: string | null
  subject_name?: string | null
}

const detailPermission = (event: ActivityEvent): string | undefined =>
  event.startsWith('payment_') ? 'viewLedger'
    : event.startsWith('phase_') ? 'viewPhases'
      : event.startsWith('contract_') ? 'viewContracts'
        : event.startsWith('cash_') ? 'viewSettlement' : undefined

/** Sends one project change to the affected active members. One invocation fans out to all their enabled devices. */
async function runActivityEvent(req: ActivityRequest): Promise<Response> {
  const [project] = await rest<{ id: string; name: string; owner_id: string }[]>(
    `projects?select=id,name,owner_id&id=eq.${encodeURIComponent(req.project_id)}`,
  )
  if (!project) return json({ sent: 0, skipped: 'project not found' })
  const members = await restAll<{ user_id: string; display_name?: string | null; email?: string | null }>(
    `project_members?select=user_id,display_name,email&project_id=eq.${project.id}`,
  )
  const memberName = (id?: string | null): string | undefined => {
    const m = members.find((x) => x.user_id === id)
    return m?.display_name || m?.email || undefined
  }
  const actor = memberName(req.actor_id) ?? undefined

  let subject = req.subject_name || memberName(req.subject_id)
  let item: string | undefined
  let amount: number | undefined
  let pending = false
  let cashMember: string | undefined
  if (req.record_id && req.event.startsWith('payment_')) {
    const [row] = await rest<{ purpose: string; amount: number; approval?: string | null }[]>(
      `payments?select=purpose,amount,approval&id=eq.${encodeURIComponent(req.record_id)}`,
    )
    item = row?.purpose; amount = row?.amount; pending = row?.approval === 'pending'
  } else if (req.record_id && req.event.startsWith('phase_')) {
    const [row] = await rest<{ name?: string | null; key?: string | null }[]>(`phases?select=name,key&id=eq.${encodeURIComponent(req.record_id)}`)
    item = row?.name || row?.key || undefined
  } else if (req.record_id && req.event.startsWith('contract_')) {
    const [row] = await rest<{ title: string; amount: number }[]>(`contracts?select=title,amount&id=eq.${encodeURIComponent(req.record_id)}`)
    item = row?.title; amount = row?.amount
  } else if (req.record_id && req.event.startsWith('cash_')) {
    const [row] = await rest<{ amount: number; kind: string; member_id?: string | null }[]>(`transfers?select=amount,kind,member_id&id=eq.${encodeURIComponent(req.record_id)}`)
    item = row?.kind; amount = row?.amount; cashMember = row?.member_id ?? req.subject_id ?? undefined
    subject ||= memberName(cashMember)
  }
  if (req.event === 'member_joined') item = subject || undefined

  let targets: string[]
  if (req.event === 'member_removed' || req.event === 'permissions_changed') targets = req.subject_id ? [req.subject_id] : []
  else if (req.event.startsWith('cash_')) targets = [project.owner_id, cashMember].filter((x): x is string => Boolean(x))
  else targets = members.map((m) => m.user_id)
  targets = [...new Set(targets)].filter((id) => id !== req.actor_id)
  if (!targets.length) return json({ sent: 0, recipients: 0 })

  const permission = detailPermission(req.event)
  const permissionRows = permission
    ? await restAll<{ user_id: string; enabled: boolean }>(
        `member_permissions?select=user_id,enabled&project_id=eq.${project.id}&permission=eq.${permission}&user_id=in.(${targets.join(',')})`,
      )
    : []
  const detailedFor = (userId: string) => userId === project.owner_id || !permission || permissionRows.some((p) => p.user_id === userId && p.enabled)
  const approvers = pending
    ? await restAll<{ user_id: string; enabled: boolean }>(`member_permissions?select=user_id,enabled&project_id=eq.${project.id}&permission=eq.approvePayments`)
    : []
  const hasApproval = (id: string) => id === project.owner_id || approvers.some((p) => p.user_id === id && p.enabled)
  const subs = await loadSubs(`user_id=in.(${targets.join(',')})`)
  const send = await pusher()
  let sent = 0
  for (const s of subs) {
    if (!wantsActivity(prefsOf(s.prefs), req.event)) continue
    // A pending entry already gives approvers the stronger approval notification.
    if (pending && hasApproval(s.user_id)) continue
    const message = buildActivityMessage({ event: req.event, project: project.name, actor, subject: subject || undefined, item, amount, id: req.record_id }, s.lang, detailedFor(s.user_id))
    if ((await send(s, message)) === 'sent') sent++
  }
  return json({ sent, devices: subs.length, recipients: targets.length })
}

/** One run of the hourly job: serves the devices whose reminder hour it is (Pakistan time). */
async function runDaily(hourOverride?: number): Promise<Response> {
  const now = new Date()
  const today = karachiToday(now)
  const hour = typeof hourOverride === 'number' && Number.isInteger(hourOverride) && hourOverride >= 0 && hourOverride <= 23 ? hourOverride : karachiHour(now)
  const projects = await restAll<Project>('projects?select=id,name,budget,owner_id,target_finish&deleted_at=is.null')
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
    const [payments, phases, contracts, transfers, attachments, invites, permissions] = await Promise.all([
      restAll<Payment>(`payments?select=id,purpose,amount,date,status,approval,added_by,created_at,phase_id,contract_id,paid_by,project_cash_amount&project_id=eq.${project.id}&deleted_at=is.null&status=in.(planned,paid,advance)`),
      restAll<AttentionPhase>(`phases?select=id,name,key,budget,done&project_id=eq.${project.id}&deleted_at=is.null`),
      restAll<AttentionContract>(`contracts?select=id,title,amount,status,variations&project_id=eq.${project.id}&deleted_at=is.null`),
      restAll<AttentionTransfer>(`transfers?select=member_id,amount,kind,deleted_at&project_id=eq.${project.id}`),
      restAll<{ payment_id: string }>(`attachments?select=payment_id&project_id=eq.${project.id}&deleted_at=is.null`),
      restAll<AttentionInvite>(`project_invites?select=id,expires_at&project_id=eq.${project.id}&accepted_at=is.null`),
      restAll<{ user_id: string; permission: string; enabled: boolean }>(`member_permissions?select=user_id,permission,enabled&project_id=eq.${project.id}&enabled=eq.true`),
    ])
    const projectLog = log.filter((l) => l.project_id === project.id).map((l) => l.key)
    const toLog = new Set<string>()
    for (const s of recipients) {
      const dev = deviceId(s.endpoint)
      const sentKeys = sentFor(projectLog, dev)
      const prefs = prefsOf(s.prefs)
      const userPermissions = new Set(permissions.filter((p) => p.user_id === s.user_id && p.enabled).map((p) => p.permission))
      const messages = [
        ...buildMessages(project, payments, today, sentKeys, s.lang, prefs),
        ...buildAttentionMessages({ project, payments, phases, contracts, transfers, attachmentPaymentIds: new Set(attachments.map((a) => a.payment_id)), invites, today, nowMs: now.getTime(), sent: sentKeys, userId: s.user_id, permissions: userPermissions, prefs }, s.lang),
      ]
      for (const m of messages) {
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
    const body = (await req.json().catch(() => ({}))) as { action?: string; event?: string; payment_id?: string; hour?: number; project_id?: string; record_id?: string; actor_id?: string | null; subject_id?: string | null; subject_name?: string | null }
    const secret = env('CRON_SECRET')
    const given = req.headers.get('x-cron-secret')
    if (given !== null) {
      // The scheduler is calling. Say plainly why it was refused (no secret values are ever shown).
      if (!secret) return json({ error: 'CRON_SECRET is not set for this function' }, 401)
      if (given !== secret) return json({ error: 'cron secret does not match' }, 401)
      if (body.action === 'daily') return await runDaily(body.hour)
      if (body.action === 'payment-event' && body.payment_id && ['pending', 'approved', 'rejected'].includes(body.event ?? ''))
        return await runApprovalEvent(body.event as ApprovalEvent, body.payment_id)
      if (body.action === 'activity-event' && body.project_id && body.event)
        return await runActivityEvent(body as ActivityRequest)
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
