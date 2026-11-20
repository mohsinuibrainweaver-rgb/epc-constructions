import { addDays } from './format'

export type Every = 'week' | 'twoWeeks' | 'month'
export const EVERY: Every[] = ['week', 'twoWeeks', 'month']

const pad = (n: number): string => String(n).padStart(2, '0')

/** `iso` moved on by whole months, keeping the day of the month (the last day of a shorter month: 31 Jan + 1 month = 28 Feb). */
export function addMonths(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7)) - 1 + months
  const day = Number(iso.slice(8, 10))
  const year = y + Math.floor(m / 12)
  const month = ((m % 12) + 12) % 12
  const last = new Date(year, month + 1, 0).getDate()
  return `${year}-${pad(month + 1)}-${pad(Math.min(day, last))}`
}

/** The dates of `count` payments: the first on `first`, then every week, every two weeks or every month. Months are counted from the first date, so a 31st does not drift. */
export function instalmentDates(first: string, every: Every, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => (every === 'month' ? addMonths(first, i) : addDays(first, i * (every === 'week' ? 7 : 14))))
}

/**
 * `total` rupees split into `count` parts: each part rounded to the nearest 100 so the amounts look like amounts people pay, the last
 * one takes what is left so the parts add up exactly. Small totals fall back to plain whole-rupee parts. Never a negative part.
 */
export function splitAmount(total: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count))
  const sum = Math.max(0, Math.round(total))
  if (n === 1) return [sum]
  let each = Math.round(sum / n / 100) * 100
  if (each <= 0 || each * (n - 1) > sum) each = Math.floor(sum / n)
  const parts = Array.from({ length: n - 1 }, () => each)
  parts.push(sum - each * (n - 1))
  return parts
}

export interface InstalmentRow {
  date: string
  amount: number
}

/** The proposed schedule: the amount split in parts, one per date. */
export function proposeInstalments(total: number, count: number, first: string, every: Every): InstalmentRow[] {
  const amounts = splitAmount(total, count)
  const dates = instalmentDates(first, every, amounts.length)
  return amounts.map((amount, i) => ({ date: dates[i], amount }))
}
