import { addDays } from './format'

/** Weekday (0 = Sunday) of a YYYY-MM-DD date. */
export const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00`).getDay()

/**
 * The dates a weekly plan still has to create a payment for: every matching weekday from the day after
 * the last one created (or the plan's start) up to a week ahead of today. A plan that was never opened
 * for a long time only catches up on the last 4 weeks, so it never floods the list.
 */
export function planDueDates(
  plan: { weekday: number; startDate: string; generatedThrough?: string },
  today: string,
  aheadDays = 7,
): string[] {
  const horizon = addDays(today, aheadDays)
  const floor = addDays(today, -28)
  let from = plan.generatedThrough ? addDays(plan.generatedThrough, 1) : plan.startDate
  if (from < floor) from = floor
  if (from < plan.startDate) from = plan.startDate
  const out: string[] = []
  for (let d = from; d <= horizon && out.length < 12; d = addDays(d, 1)) {
    if (weekdayOf(d) === plan.weekday) out.push(d)
  }
  return out
}

/**
 * The same plan and date always give the same id, so two phones that both create this week's payment
 * end up with one row after they sync, not two. The id is a version-5 style UUID built from a SHA-1 hash.
 */
export async function deterministicId(seed: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(seed))).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
