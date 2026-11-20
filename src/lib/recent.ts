import type { Category, MiscType, PayMode, Payment, Role } from '../db/types'

/** What a recent payment leaves behind for filling the Add payment form again. */
export interface PaymentTemplate {
  /** Same payee, purpose, category and phase: one template for all of them. */
  key: string
  purpose: string
  /** The amount of the most recent one; the person changes it. */
  amount: number
  category: Category
  miscType?: MiscType
  vendorId?: string
  payeeName?: string
  phaseId?: string
  contractId?: string
  mode: PayMode
  /** The bank and account of a transfer (not its reference, which is different every time). */
  bankName?: string
  bankAccount?: string
  paidBy: Role
}

/** Things that still exist, so a template never points at a vendor, phase or contract that is gone or closed. */
export interface KnownRefs {
  vendors: ReadonlySet<string>
  phases: ReadonlySet<string>
  /** Contracts that are still open. */
  openContracts: ReadonlySet<string>
}

const norm = (s: string | undefined): string => (s ?? '').trim().toLowerCase()

/**
 * The payments worth repeating: the latest of each distinct (payee, purpose, category, phase), newest first.
 * Left out: removed payments, planned and skipped ones (nothing was paid), rejected ones, and payments a weekly plan
 * created (they have their own flow).
 */
export function recentTemplates(payments: Payment[], known: KnownRefs, limit = 4): PaymentTemplate[] {
  const sorted = payments
    .filter((p) => !p.deletedAt && p.status !== 'skipped' && p.status !== 'planned' && p.approval !== 'rejected' && !p.planId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const out = new Map<string, PaymentTemplate>()
  for (const p of sorted) {
    const vendorId = p.vendorId && known.vendors.has(p.vendorId) ? p.vendorId : undefined
    const phaseId = p.phaseId && known.phases.has(p.phaseId) ? p.phaseId : undefined
    const key = [vendorId ?? `payee:${norm(p.payeeName)}`, norm(p.purpose), p.category, phaseId ?? ''].join('|')
    if (out.has(key)) continue
    out.set(key, {
      key,
      purpose: p.purpose,
      amount: p.amount,
      category: p.category,
      miscType: p.miscType,
      vendorId,
      payeeName: vendorId ? undefined : p.payeeName?.trim() || undefined,
      phaseId,
      contractId: p.contractId && known.openContracts.has(p.contractId) ? p.contractId : undefined,
      mode: p.mode,
      bankName: p.mode === 'bank' ? p.bankName || undefined : undefined,
      bankAccount: p.mode === 'bank' ? p.bankAccount || undefined : undefined,
      paidBy: p.paidBy,
    })
    if (out.size >= limit) break
  }
  return [...out.values()]
}
