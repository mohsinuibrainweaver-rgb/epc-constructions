import type { Lang } from '../db/types'
import { currencyLabel, getRegion, groupNumber, type Region } from './region'

/**
 * Whole rupees in the chosen writing (Settings, Preferences): Rs 225,500 by default, or 2,25,500 with lakh grouping,
 * or PKR in front, or روپے after the number.
 */
export const money = (n: number | undefined): string => formatMoney(n, getRegion())

/** A price per unit: whole rupees from Rs 100 up, and up to two decimals below that (Rs 16.5 per brick stays 16.5). */
export const moneyRate = (n: number | undefined): string => formatMoney(n, getRegion(), (n ?? 0) < 100 ? 2 : 0)

/** The same, in a given writing (for showing examples of each choice). */
export const formatMoney = (n: number | undefined, r: Region, decimals = 0): string => {
  const value = decimals > 0 ? groupNumber(n ?? 0, r.grouping, decimals) : groupNumber(Math.round(n ?? 0), r.grouping)
  const cur = currencyLabel('en', false, r)
  return r.currency === 'روپے' ? `${value} ${cur}` : `${cur} ${value}`
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Today as YYYY-MM-DD in the device's own time zone. */
export const todayISO = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const locale = (lang: Lang): string => (lang === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB')

export const formatDate = (iso: string | undefined, lang: Lang, style: Region['dateStyle'] = getRegion().dateStyle): string => {
  if (!iso) return ''
  if (style === 'numeric' && /^\d{4}-\d{2}-\d{2}/.test(iso)) return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${iso}T00:00:00`))
}

export const formatMonth = (key: string, lang: Lang): string =>
  new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric' }).format(
    new Date(`${key}-01T00:00:00`),
  )

/** A day in few characters, for chart axes: 21 Nov. */
export const formatDayShort = (iso: string, lang: Lang): string =>
  new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short' }).format(new Date(`${iso}T00:00:00`))

/** A month in few characters, for chart axes: Nov 26. */
export const formatMonthShort = (key: string, lang: Lang): string =>
  new Intl.DateTimeFormat(locale(lang), { month: 'short', year: '2-digit' }).format(new Date(`${key}-01T00:00:00`))

export const monthKey =(iso: string): string => iso.slice(0, 7)

export const parseAmount = (raw: string): number => {
  const digits = raw.replace(/[^0-9]/g, '')
  return digits ? Number(digits) : 0
}

export const groupDigits = (raw: string): string => {
  const n = parseAmount(raw)
  return n ? groupNumber(n) : ''
}

/** A time of day in the chosen clock: 9:05 am or 09:05. */
export const formatTime = (d: Date, lang: Lang, clock: Region['clock'] = getRegion().clock): string =>
  new Intl.DateTimeFormat(locale(lang), { hour: clock === '24' ? '2-digit' : 'numeric', minute: '2-digit', hour12: clock === '12' }).format(d)

export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

export const interpolate = (text: string, vars?: Record<string, string | number>): string =>
  vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : text

export const csvEscape = (v: unknown): string => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const download = (name: string, data: BlobPart, type: string): void => {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Name of a weekday (0 = Sunday) in the app language. */
export const weekdayName = (n: number, lang: Lang): string =>
  new Intl.DateTimeFormat(locale(lang), { weekday: 'long' }).format(new Date(2024, 0, 7 + n))

/** 1.2 MB, 340 KB. Wrapped in a left-to-right isolate so it does not flip inside Urdu text. */
export const fileSize = (bytes: number): string =>
  `\u2066${bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`}\u2069`
