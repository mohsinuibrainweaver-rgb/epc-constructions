/** 1, 2, 2.5 or 5 times a power of ten, at least `n`: a round number for the top of an axis. */
export const niceCeil = (n: number): number => {
  if (n <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(n))
  const m = n / pow
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * pow
}

const trim = (n: number): string => String(Math.round(n * 10) / 10)

/** A number for an axis label: 250K, 1.2M. */
export const compact = (n: number): string => (n >= 1e6 ? `${trim(n / 1e6)}M` : n >= 1e3 ? `${trim(n / 1e3)}K` : String(Math.round(n)))

/** An amount that stays on one line ("Rs 409,400" is not split after "Rs"). */
export const noBreak = (s: string): string => s.replace(/ /g, ' ')

/** Axis ticks 0, step, 2 step ... up to a round top that holds `highest`, in about three steps. */
export function axisTicks(highest: number): { top: number; ticks: number[]; step: number } {
  const step = niceCeil(Math.max(highest, 1) / 3)
  const top = Math.ceil(Math.max(highest, 1) / step) * step
  return { top, step, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step) }
}
