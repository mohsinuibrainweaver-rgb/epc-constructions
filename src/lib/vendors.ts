import type { Contract, Payment, Vendor } from '../db/types'
import { summarizeContract } from './contracts'
import { isPlanned, isSpent, sum } from './stats'

export type VendorSort = 'name' | 'paid' | 'recent'
export const VENDOR_SORTS: VendorSort[] = ['name', 'paid', 'recent']

export interface VendorFigures {
  /** Paid and approved. */
  paid: number
  /** Planned, not paid yet. */
  planned: number
  /** The date of the latest paid and approved payment, if any. */
  lastPaid: string | undefined
  /** Left to pay on this vendor's active contracts (an overpaid contract adds nothing). */
  owed: number
}

/** What the Vendors list and a vendor's page show about one vendor. */
export function vendorFigures(vendorId: string, payments: Payment[], contracts: Contract[]): VendorFigures {
  const mine = payments.filter((p) => !p.deletedAt && p.vendorId === vendorId)
  const spent = mine.filter(isSpent)
  const dates = spent.map((p) => p.date).sort()
  const own = contracts.filter((c) => !c.deletedAt && c.status === 'active' && c.vendorId === vendorId)
  return {
    paid: sum(spent),
    planned: sum(mine.filter(isPlanned)),
    lastPaid: dates[dates.length - 1],
    owed: own.reduce((n, c) => n + Math.max(0, summarizeContract(c, payments).remaining), 0),
  }
}

/** Whether a vendor matches what was typed: its name, its role (as written on screen) or its phone number. */
export function vendorMatches(v: Pick<Vendor, 'name' | 'phone'>, roleLabel: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const digits = q.replace(/[^0-9]/g, '')
  return (
    v.name.toLowerCase().includes(q) ||
    roleLabel.toLowerCase().includes(q) ||
    (digits.length > 0 && (v.phone ?? '').replace(/[^0-9]/g, '').includes(digits))
  )
}

/** A new array in the chosen order: by name, by most paid, or by most recent payment (vendors never paid come last). */
export function sortVendors<T extends { v: Pick<Vendor, 'name'>; f: VendorFigures }>(rows: T[], sort: VendorSort): T[] {
  const byName = (a: T, b: T) => a.v.name.localeCompare(b.v.name)
  const by: Record<VendorSort, (a: T, b: T) => number> = {
    name: byName,
    paid: (a, b) => b.f.paid - a.f.paid || byName(a, b),
    recent: (a, b) => (b.f.lastPaid ?? '').localeCompare(a.f.lastPaid ?? '') || byName(a, b),
  }
  return [...rows].sort(by[sort])
}
