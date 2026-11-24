import type { Contract, Payment, PaymentPlan } from '../db/types'
import { summarizeContract, unplannedBalance } from './contracts'
import { addDays } from './format'
import { weekdayOf } from './plans'
import { isPlanned } from './stats'

/** How far ahead the forecast looks, in weeks. */
export const FORECAST_WEEKS = 12

export interface ForecastItem {
  /** The day it is due. For something overdue this is its own (past) date. */
  date: string
  amount: number
  paidBy: string
  /** 'scheduled': a planned payment that exists. 'expected': a weekly plan's coming payment that is not created yet. */
  kind: 'scheduled' | 'expected'
  purpose: string
  vendorId?: string
  /** The planned payment (scheduled) or the plan (expected) it comes from. */
  paymentId?: string
  planId?: string
  overdue: boolean
}

export interface ForecastWeek {
  /** The first and last day of the week; weeks start today and run seven days each. */
  start: string
  end: string
  scheduled: number
  expected: number
}

export interface ContractBalance {
  contract: Contract
  /** What is left of the agreed total after what is paid, waiting for approval, and already planned. */
  amount: number
}

export interface Forecast {
  /** Planned payments whose day has passed: due now. */
  overdue: number
  weeks: ForecastWeek[]
  /** Planned payments dated after the weeks shown. */
  later: number
  /** Overdue, plus everything due in the next 7 and 30 days. */
  next7: number
  next30: number
  /** Of the next 30 days (and overdue), what the builder is to pay out of the cash he holds, and what the investor pays directly. */
  builderNext30: number
  investorNext30: number
  /** The same split for the next 7 days. */
  builderNext7: number
  investorNext7: number
  /** Active contracts' money that is not yet planned for any day. */
  unscheduled: ContractBalance[]
  unscheduledTotal: number
  /** Every item inside the weeks, plus the overdue ones, oldest first. */
  items: ForecastItem[]
}

export interface ForecastInput {
  payments: Payment[]
  plans: PaymentPlan[]
  contracts: Contract[]
  /** YYYY-MM-DD */
  today: string
  ownerId?: string
  weeks?: number
}

/**
 * What the next weeks will cost, from what is already written down: planned payments, the weekly plans' coming payments (which
 * the app only creates a week ahead, so the rest are projected here), and what is left on active contracts without a day.
 * Paid and approved money is not in it (it is spent); entries waiting for approval count against a contract as already coming.
 */
export function forecast({ payments, plans, contracts, today, ownerId, weeks = FORECAST_WEEKS }: ForecastInput): Forecast {
  const end = addDays(today, weeks * 7 - 1)
  const items: ForecastItem[] = []

  for (const p of payments) {
    if (!isPlanned(p)) continue
    items.push({ date: p.date, amount: p.amount, paidBy: p.paidBy, kind: 'scheduled', purpose: p.purpose, vendorId: p.vendorId, paymentId: p.id, planId: p.planId, overdue: p.date < today })
  }

  // A weekly plan's payments are created a week ahead. Past that, every matching weekday is expected, unless a payment for that
  // plan and day already exists (paid, skipped, planned or removed: the app never creates it again).
  const made = new Set(payments.filter((p) => p.planId).map((p) => `${p.planId}|${p.date}`))
  for (const plan of plans) {
    if (!plan.active || plan.deletedAt) continue
    for (let d = today > plan.startDate ? today : plan.startDate; d <= end; d = addDays(d, 1)) {
      if (weekdayOf(d) !== plan.weekday || made.has(`${plan.id}|${d}`)) continue
      items.push({ date: d, amount: plan.amount, paidBy: plan.paidBy, kind: 'expected', purpose: plan.purpose, vendorId: plan.vendorId, planId: plan.id, overdue: false })
    }
  }

  const sorted = items.filter((i) => i.date <= end).sort((a, b) => a.date.localeCompare(b.date) || a.purpose.localeCompare(b.purpose))
  const overdueItems = sorted.filter((i) => i.overdue)
  const weekList: ForecastWeek[] = Array.from({ length: weeks }, (_, k) => ({ start: addDays(today, k * 7), end: addDays(today, k * 7 + 6), scheduled: 0, expected: 0 }))
  for (const i of sorted) {
    if (i.overdue) continue
    const w = weekList[Math.min(weeks - 1, Math.floor(daysBetween(today, i.date) / 7))]
    if (i.kind === 'scheduled') w.scheduled += i.amount
    else w.expected += i.amount
  }

  const upTo = (days: number): ForecastItem[] => sorted.filter((i) => i.overdue || i.date <= addDays(today, days - 1))
  const n7 = upTo(7)
  const n30 = upTo(30)
  const total = (xs: ForecastItem[]): number => xs.reduce((s, i) => s + i.amount, 0)
  const ownerPays = (payer: string) => payer === 'investor' || Boolean(ownerId && payer === ownerId)

  const unscheduled: ContractBalance[] = contracts
    .filter((c) => !c.deletedAt && c.status === 'active')
    .map((contract) => {
      const s = summarizeContract(contract, payments)
      return { contract, amount: unplannedBalance(s) }
    })
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  return {
    overdue: total(overdueItems),
    weeks: weekList,
    later: payments.filter((p) => isPlanned(p) && p.date > end).reduce((s, p) => s + p.amount, 0),
    next7: total(n7),
    next30: total(n30),
    builderNext30: total(n30.filter((i) => !ownerPays(i.paidBy))),
    investorNext30: total(n30.filter((i) => ownerPays(i.paidBy))),
    builderNext7: total(n7.filter((i) => !ownerPays(i.paidBy))),
    investorNext7: total(n7.filter((i) => ownerPays(i.paidBy))),
    unscheduled,
    unscheduledTotal: unscheduled.reduce((s, x) => s + x.amount, 0),
    items: sorted,
  }
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000)
}

export interface CashAdvice {
  /** The cash the builder holds that belongs to the investor (0 when he holds none). */
  holds: number
  /** What the builder is to pay in the next 30 days. */
  needs: number
  /** How much more the investor has to send so the builder can pay it (0 when he has enough). */
  topUp: number
  /** Cash left with the builder after paying it (0 when short). */
  leftOver: number
}

/**
 * Whether the cash the builder holds covers what he is to pay in the next 30 days. `builderBalance` is the Settlement's figure:
 * negative means the builder holds that much of the investor's money.
 */
export function cashAdvice(builderBalance: number, builderNext30: number, explicitCashHeld?: number): CashAdvice {
  const holds = explicitCashHeld === undefined ? Math.max(0, -builderBalance) : Math.max(0, explicitCashHeld)
  return { holds, needs: builderNext30, topUp: Math.max(0, builderNext30 - holds), leftOver: Math.max(0, holds - builderNext30) }
}

/**
 * The new money the investor has to put up over the next 30 days: what he pays directly, plus what he must still send the builder so
 * that the builder can pay his part from his cash. (The cash the builder already holds was given earlier, so it is not counted again.)
 */
export const cashToArrange = (investorNext30: number, advice: CashAdvice): number => investorNext30 + advice.topUp
