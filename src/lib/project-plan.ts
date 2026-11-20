/** Small figures the project form shows while it is being filled in. Pure, so they can be tested. */

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** Whole days from start to finish, or undefined when either day is missing or the finish is before the start. */
export function plannedDays(start: string, finish: string): number | undefined {
  if (!start || !finish) return undefined
  const days = Math.round(dayNumber(finish) - dayNumber(start))
  return Number.isFinite(days) && days >= 0 ? days : undefined
}

/** The span as months when it is at least about six weeks, else days: { months } or { days }. */
export function plannedSpan(days: number): { months: number } | { days: number } {
  if (days < 45) return { days }
  return { months: Math.round(days / 30.4375) }
}

/** What the budget comes to for each square foot of covered area; undefined without both numbers. */
export function budgetPerSqft(budget: number, area: number): number | undefined {
  if (!(budget > 0) || !(area > 0)) return undefined
  return budget / area
}
