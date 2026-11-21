import type { MaterialLine, MaterialUnit, Payment } from '../db/types'
import { groupDigits, parseAmount } from './format'
import { groupNumber } from './region'
import { isSpent } from './stats'

/*
 * Materials live on the payment: a payment with a quantity and a unit is a purchase, and the rate is worked out from the
 * money actually paid (amount divided by quantity). There is no separate list of purchases to keep in step with the ledger.
 */

/** Same item written differently ("Cement ", "cement") is one item. */
export const itemKey = (item: string): string => item.trim().toLowerCase().replace(/\s+/g, ' ')

/** A payment that says how much was bought. */
export type Purchase = Payment & { quantity: number; unit: MaterialUnit }
export const hasQuantity = (p: Payment): p is Purchase => typeof p.quantity === 'number' && p.quantity > 0 && Boolean(p.unit)

/** What was really paid per unit. */
export const rateOf = (p: Purchase): number => p.amount / p.quantity

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

/** Payments that count as a purchase for prices: spent (not removed, planned or held back) and with a quantity. */
export const purchasesOf = (payments: Payment[]): Purchase[] => payments.filter((p): p is Purchase => isSpent(p) && hasQuantity(p))

/** One row per item and unit, built from the payments that count and carry a quantity. */
export function priceRows(payments: Payment[]): PriceRow[] {
  const groups = new Map<string, Purchase[]>()
  for (const p of purchasesOf(payments)) {
    const k = `${itemKey(p.purpose)}|${p.unit}`
    groups.set(k, [...(groups.get(k) ?? []), p])
  }
  const rows: PriceRow[] = []
  for (const [key, group] of groups) {
    const byDate = [...group].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    const last = byDate[byDate.length - 1]
    const prev = byDate[byDate.length - 2]
    const quantity = group.reduce((s, p) => s + p.quantity, 0)
    const spent = group.reduce((s, p) => s + p.amount, 0)
    const rates = group.map(rateOf)
    rows.push({
      key,
      item: last.purpose.trim(),
      unit: last.unit,
      count: group.length,
      quantity,
      spent,
      last: rateOf(last),
      lastDate: last.date,
      min: Math.min(...rates),
      max: Math.max(...rates),
      average: quantity > 0 ? spent / quantity : 0,
      change: prev && rateOf(prev) > 0 ? ((rateOf(last) - rateOf(prev)) / rateOf(prev)) * 100 : undefined,
    })
  }
  return rows.sort((a, b) => b.spent - a.spent)
}

/** How much of the material spending the prices are based on: material payments that count, and those that carry a quantity. */
export function priceCoverage(payments: Payment[]): { withQuantity: number; total: number } {
  const material = payments.filter((p) => isSpent(p) && p.category === 'material')
  return { withQuantity: material.filter(hasQuantity).length, total: material.length }
}

/** The latest purchase of each item (any unit), for suggestions on the form. Newest first. */
export function knownItems(payments: Payment[]): Purchase[] {
  const seen = new Set<string>()
  const out: Purchase[] = []
  const sorted = purchasesOf(payments).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  for (const p of sorted) {
    const k = itemKey(p.purpose)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
  }
  return out
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

/** What the three boxes of a material payment hold while it is typed. */
export interface Entry {
  amount: string
  quantity: string
  rate: string
  /** True once the rate was the last of amount and rate to be typed: then a new quantity changes the amount, not the rate. */
  byRate: boolean
}

const plain = (n: number, decimals: number): string => String(Math.round(n * 10 ** decimals) / 10 ** decimals)

/**
 * The three boxes are tied together: amount = quantity x rate. What was paid (the amount) is the figure that must match the
 * ledger, so it wins: typing the amount or the quantity works out the rate. Typing the rate works out the amount, and from then
 * on a new quantity keeps that rate and changes the amount. A box that cannot be worked out yet is left as it is.
 */
export function solveEntry(entry: Entry, edited: 'amount' | 'quantity' | 'rate', value: string): Entry {
  const next: Entry = { ...entry, [edited]: edited === 'amount' ? groupDigits(value) : value }
  if (edited === 'amount') next.byRate = false
  if (edited === 'rate') next.byRate = true
  const amount = parseAmount(next.amount)
  const quantity = parseDecimal(next.quantity)
  const rate = parseDecimal(next.rate)
  if (edited === 'rate' || (edited === 'quantity' && next.byRate)) {
    if (quantity > 0 && rate > 0) next.amount = groupDigits(String(Math.round(quantity * rate)))
  } else if (quantity > 0 && amount > 0) {
    next.rate = plain(amount / quantity, 2)
  } else if (edited === 'quantity' && quantity > 0 && rate > 0 && amount === 0) {
    next.amount = groupDigits(String(Math.round(quantity * rate)))
  }
  return next
}

/** One-time move of the old Materials list onto the payments they were created with. */
export interface FoldPatch {
  quantity: number
  unit: MaterialUnit
  /** The old line was still waiting to be sent, so the payment is too. */
  dirty: boolean
}

/**
 * For each payment that an old material line points at, the quantity and unit to put on it. Lines that were deleted, that point
 * at no payment (or one that is gone or removed), or whose payment already has a quantity, are left out. If several lines point
 * at one payment the newest wins.
 */
export function foldMaterials(lines: MaterialLine[], payments: Payment[]): Map<string, FoldPatch> {
  const byId = new Map(payments.map((p) => [p.id, p]))
  const out = new Map<string, FoldPatch & { at: number }>()
  for (const l of lines) {
    if (l.deletedAt || !l.paymentId || !(l.quantity > 0)) continue
    const p = byId.get(l.paymentId)
    if (!p || p.deletedAt || (typeof p.quantity === 'number' && p.quantity > 0)) continue
    const have = out.get(l.paymentId)
    if (have && have.at >= l.updatedAt) continue
    out.set(l.paymentId, { quantity: l.quantity, unit: l.unit, dirty: l.dirty === 1, at: l.updatedAt })
  }
  return new Map([...out].map(([id, { at: _at, ...patch }]) => [id, patch]))
}
