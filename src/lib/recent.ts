import type { Category, Payment, Role } from '../db/types'

/*
 * What the Add payment screen learns from payments already in the project: the entries just made (the list beside the form),
 * and, once a vendor is chosen, what was true the last time that vendor was paid.
 */

const norm = (s: string | undefined): string => (s ?? '').trim().toLowerCase()

/** The payments entered most recently (by the time they were entered, so a back-dated entry shows too), newest first. Weekly-plan payments and removed ones are left out. */
export function recentEntries(payments: Payment[], limit: number, excludeId?: string): Payment[] {
  return payments
    .filter((p) => !p.deletedAt && !p.planId && p.id !== excludeId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}

/** The latest payment really made to a vendor (paid or an advance, not removed or turned down). Newest date first, then the one entered last. */
export function lastPaymentTo(payments: Payment[], vendorId: string, excludeId?: string): Payment | undefined {
  return payments
    .filter((p) => p.vendorId === vendorId && p.id !== excludeId && !p.deletedAt && (p.status === 'paid' || p.status === 'advance') && p.approval !== 'rejected')
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0]
}

/**
 * What a vendor's last payment suggests for a new one. Category and who paid are right nearly every time (98% and 92% on the sample
 * data), so they are filled in. The phase is right three times in four, but a wrong one charges the wrong budget without a sign,
 * so it is only suggested. The mode (cash or bank) is not suggested at all: a vendor is paid both ways, and it was barely better
 * than the plain default.
 */
export function vendorDefaults(last: Payment): { category?: Category; paidBy: Role; phaseId?: string } {
  return { category: last.category === 'misc' ? undefined : last.category, paidBy: last.paidBy, phaseId: last.phaseId }
}

const DAY = 86_400_000
const dayOf = (iso: string): number => Date.parse(`${iso}T00:00:00Z`)

/** A payment to the same vendor for the same item within a week either side of this date: possibly the same payment entered twice. */
export function possibleDouble(
  payments: Payment[],
  draft: { vendorId: string; purpose: string; date: string; excludeId?: string },
): Payment | undefined {
  if (!draft.vendorId || !norm(draft.purpose) || !draft.date) return undefined
  const at = dayOf(draft.date)
  return payments
    .filter(
      (p) =>
        p.vendorId === draft.vendorId &&
        p.id !== draft.excludeId &&
        !p.deletedAt &&
        p.status !== 'skipped' &&
        p.approval !== 'rejected' &&
        norm(p.purpose) === norm(draft.purpose) &&
        Math.abs(dayOf(p.date) - at) <= 7 * DAY,
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0]
}
