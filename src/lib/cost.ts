// The plot and the construction, side by side. Pure, so it can be checked on its own (scripts/plot-phases-test.ts).

export interface CostSplit {
  /** What the plot cost. */
  plot: number
  /** Construction money paid so far (the payments that count as spent). */
  constructionSpent: number
  /** Plot plus construction paid so far. */
  totalSoFar: number
  /** The construction budget, when there is one. */
  budget: number | undefined
  /** Plot plus the construction budget: what the whole thing is planned to cost. Undefined without a budget. */
  totalPlanned: number | undefined
}

/** undefined when no plot cost was entered, so a project without one looks exactly as before. */
export function costSplit(plotCost: number | null | undefined, constructionSpent: number, budget: number | null | undefined): CostSplit | undefined {
  if (!plotCost || !(plotCost > 0)) return undefined
  const b = budget && budget > 0 ? budget : undefined
  return {
    plot: plotCost,
    constructionSpent,
    totalSoFar: plotCost + constructionSpent,
    budget: b,
    totalPlanned: b === undefined ? undefined : plotCost + b,
  }
}
