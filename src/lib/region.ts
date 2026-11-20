import type { Lang } from '../db/types'

/**
 * Region and format choices: how dates, times, numbers and money are written, and which day the week starts on.
 * They belong to the device (Settings, Preferences) and the defaults are how the app always looked, so nothing
 * changes until someone chooses. One current value is kept here so plain functions such as `money()` can use it;
 * the app provider updates it whenever the saved setting changes and re-renders everything that shows it.
 */
export interface Region {
  /** First day of the week in lists of weekdays: 6 Saturday, 0 Sunday, 1 Monday. */
  weekStart: 6 | 0 | 1
  /** 12 hour (9:00 am) or 24 hour (09:00) clock. */
  clock: '12' | '24'
  /** 'short' is 15 Nov 2026, 'numeric' is 15/11/2026. */
  dateStyle: 'short' | 'numeric'
  /** 'thousands' is 1,300,000 and 'lakh' is 13,00,000. */
  grouping: 'thousands' | 'lakh'
  /** 'auto' writes Rs in amounts and lets field labels follow the language (روپے in Urdu). */
  currency: 'auto' | 'Rs' | 'PKR' | 'روپے'
}

export const DEFAULT_REGION: Region = { weekStart: 0, clock: '12', dateStyle: 'short', grouping: 'thousands', currency: 'auto' }

export const WEEK_STARTS: Region['weekStart'][] = [6, 0, 1]
export const CLOCKS: Region['clock'][] = ['12', '24']
export const DATE_STYLES: Region['dateStyle'][] = ['short', 'numeric']
export const GROUPINGS: Region['grouping'][] = ['thousands', 'lakh']
export const CURRENCIES: Region['currency'][] = ['auto', 'Rs', 'PKR', 'روپے']

/** Complete choices from whatever was saved: anything missing or not one of the allowed values uses the default. */
export function regionFrom(raw: unknown): Region {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const pick = <T,>(allowed: readonly T[], v: unknown, fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)
  return {
    weekStart: pick(WEEK_STARTS, r.weekStart, DEFAULT_REGION.weekStart),
    clock: pick(CLOCKS, r.clock, DEFAULT_REGION.clock),
    dateStyle: pick(DATE_STYLES, r.dateStyle, DEFAULT_REGION.dateStyle),
    grouping: pick(GROUPINGS, r.grouping, DEFAULT_REGION.grouping),
    currency: pick(CURRENCIES, r.currency, DEFAULT_REGION.currency),
  }
}

let current: Region = DEFAULT_REGION
export const getRegion = (): Region => current
export const setRegion = (raw: unknown): void => {
  current = regionFrom(raw)
}

/**
 * A whole number with separators, in the chosen grouping: 1,300,000 or 13,00,000.
 * Decimals (at most `decimals`, trailing zeros dropped) are kept for quantities such as 2.5 bags.
 */
export function groupNumber(n: number, grouping: Region['grouping'] = current.grouping, decimals = 0): string {
  if (!Number.isFinite(n)) return '0'
  const fixed = Math.abs(n).toFixed(decimals)
  const [whole, frac = ''] = fixed.split('.')
  let head: string
  if (grouping === 'lakh' && whole.length > 3) {
    const tail = whole.slice(-3)
    head = `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}`
  } else {
    head = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
  const digits = frac.replace(/0+$/, '')
  const sign = n < 0 && (Number(whole) > 0 || digits) ? '-' : ''
  return `${sign}${head}${digits ? `.${digits}` : ''}`
}

/**
 * The currency word. In amounts 'auto' means Rs; in field labels it follows the language.
 * (`forLabel` is for text like "Amount (Rs)".)
 */
export function currencyLabel(lang: Lang, forLabel = false, region: Region = current): string {
  if (region.currency !== 'auto') return region.currency
  return forLabel && lang === 'ur' ? 'روپے' : 'Rs'
}

/** The weekdays (0 Sunday to 6 Saturday) in the order the week is shown, starting from the chosen first day. */
export const weekdayOrder = (start: number = current.weekStart): number[] => Array.from({ length: 7 }, (_, i) => (start + i) % 7)

/** Position of a weekday in the shown week: 0 for the first day. */
export const weekdayRank = (day: number, start: number = current.weekStart): number => (((day - start) % 7) + 7) % 7
