import type { Payment } from '../db/types'
import type { Key } from '../i18n/en'
import { isSpent, type Alert } from './stats'

/** What a payment can be missing: a receipt photo, a vendor or payee, or the bank details of a transfer. */
export type Missing = 'receipt' | 'vendor' | 'bank'
export const MISSING: Missing[] = ['receipt', 'vendor', 'bank']

/** A paid or advance payment that counts, with no receipt photo. */
export const missingReceipt = (p: Payment, receiptIds: ReadonlySet<string>): boolean => isSpent(p) && !receiptIds.has(p.id)

/** A payment that was not skipped or removed and names neither a vendor nor a payee. */
export const missingVendor = (p: Payment): boolean => !p.deletedAt && p.status !== 'skipped' && !p.vendorId && !(p.payeeName ?? '').trim()

/** A bank transfer that counts, with neither a bank nor an account written down. */
export const missingBank = (p: Payment): boolean => isSpent(p) && p.mode === 'bank' && !(p.bankName ?? '').trim() && !(p.bankAccount ?? '').trim()

export function isMissing(kind: Missing, p: Payment, receiptIds: ReadonlySet<string>): boolean {
  return kind === 'receipt' ? missingReceipt(p, receiptIds) : kind === 'vendor' ? missingVendor(p) : missingBank(p)
}

export interface AttentionItem {
  id: string
  /** danger: act now; warning: look soon; info: tidy up when there is time. */
  tone: 'danger' | 'warning' | 'info'
  key: Key
  vars: Record<string, string | number>
  to: string
}

const RANK = { danger: 0, warning: 1, info: 2 } as const

/**
 * What Home lists under "Needs your attention": estimates that are clearly passed or nearly used up and contracts paid beyond what was agreed
 * (from the alerts the bell already has), then the tidy-up items: payments without a vendor, bank transfers without bank
 * details, and paid payments without a receipt photo. Approvals and due payments have their own cards on Home.
 * `receiptIds` is undefined until the receipts have been read, so "no receipt" is never claimed too early.
 */
export function attentionItems(
  alerts: Alert[],
  payments: Payment[],
  receiptIds: ReadonlySet<string> | undefined,
  /** Names of unfinished phases that have used their whole estimate (see fullPhases): one quiet row, not a row each. */
  fullPhaseNames: string[] = [],
): AttentionItem[] {
  const out: AttentionItem[] = []
  for (const a of alerts) {
    if (a.key === 'notif.contractOver') out.push({ id: a.id, tone: 'danger', key: a.key, vars: a.vars, to: a.to })
    else if (a.key === 'notif.phaseOver' || a.key === 'notif.projectOver') out.push({ id: a.id, tone: a.kind === 'error' ? 'danger' : 'warning', key: a.key, vars: a.vars, to: a.to })
    else if (a.key === 'notif.budget80' || a.key === 'notif.estimate80') out.push({ id: a.id, tone: 'warning', key: a.key, vars: a.vars, to: a.to })
  }
  // A phase at exactly its estimate is no alarm. If the work is done it only needs marking complete, which turns it green.
  if (fullPhaseNames.length === 1) out.push({ id: 'phases-full', tone: 'info', key: 'attn.phaseFull', vars: { name: fullPhaseNames[0] }, to: '/phases' })
  else if (fullPhaseNames.length > 1) out.push({ id: 'phases-full', tone: 'info', key: 'attn.phasesFull', vars: { count: fullPhaseNames.length }, to: '/phases' })
  const live = payments.filter((p) => !p.deletedAt)
  const noVendor = live.filter(missingVendor).length
  if (noVendor > 0) out.push({ id: 'missing-vendor', tone: 'info', key: 'attn.noVendor', vars: { count: noVendor }, to: '/ledger?missing=vendor' })
  const noBank = live.filter(missingBank).length
  if (noBank > 0) out.push({ id: 'missing-bank', tone: 'info', key: 'attn.noBank', vars: { count: noBank }, to: '/ledger?missing=bank' })
  if (receiptIds) {
    const noReceipt = live.filter((p) => missingReceipt(p, receiptIds)).length
    if (noReceipt > 0) out.push({ id: 'missing-receipt', tone: 'info', key: 'attn.noReceipt', vars: { count: noReceipt }, to: '/ledger?missing=receipt' })
  }
  return out.sort((a, b) => RANK[a.tone] - RANK[b.tone])
}
