import type { MaterialLine, MaterialUnit } from '../db/types'
import { groupNumber } from './region'

/** Quantity times rate, in whole rupees. */
export const lineAmount = (quantity: number, rate: number): number => Math.round(quantity * rate)

/** Same item written differently ("Cement ", "cement") is one item. */
export const itemKey = (item: string): string => item.trim().toLowerCase().replace(/\s+/g, ' ')

export interface PriceRow {
  key: string
  item: string
  unit: MaterialUnit
  count: number
  quantity: number
  spent: number
  last: number
  lastDate: string
  min: number
  max: number
  /** Total spent divided by total quantity: the true average rate paid. */
  average: number
  /** Last rate against the one before it: positive means the price went up. */
  change: number | undefined
}

/** One row per item and unit, built from non-deleted lines. */
export function priceRows(lines: MaterialLine[]): PriceRow[] {
  const groups = new Map<string, MaterialLine[]>()
  for (const l of lines) {
    if (l.deletedAt) continue
    const k = `${itemKey(l.item)}|${l.unit}`
    groups.set(k, [...(groups.get(k) ?? []), l])
  }
  const rows: PriceRow[] = []
  for (const [key, group] of groups) {
    const byDate = [...group].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    const last = byDate[byDate.length - 1]
    const prev = byDate[byDate.length - 2]
    const quantity = group.reduce((s, l) => s + l.quantity, 0)
    const spent = group.reduce((s, l) => s + l.amount, 0)
    rows.push({
      key,
      item: last.item,
      unit: last.unit,
      count: group.length,
      quantity,
      spent,
      last: last.rate,
      lastDate: last.date,
      min: Math.min(...group.map((l) => l.rate)),
      max: Math.max(...group.map((l) => l.rate)),
      average: quantity > 0 ? spent / quantity : 0,
      change: prev && prev.rate > 0 ? ((last.rate - prev.rate) / prev.rate) * 100 : undefined,
    })
  }
  return rows.sort((a, b) => b.spent - a.spent)
}

/** Reads "1,250.5" or "16.5" as a number; anything unreadable is 0. */
export const parseDecimal = (raw: string): number => {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const [whole, ...rest] = cleaned.split('.')
  const n = Number(rest.length ? `${whole || '0'}.${rest.join('')}` : whole)
  return Number.isFinite(n) ? n : 0
}

/** Rate or quantity for display: up to 2 decimals, no trailing zeros. */
export const num = (n: number): string => groupNumber(n, undefined, 2)
