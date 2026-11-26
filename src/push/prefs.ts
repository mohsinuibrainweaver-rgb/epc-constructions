import type { Lang } from '@/db/types'
import { getRegion, type Region } from '@/lib/region'

/** The kinds of reminder a device can switch on or off. Mirrors `Prefs` in the send-reminders function. */
export const PUSH_TYPES = ['activity', 'due', 'attention', 'budget80', 'budget100', 'approvalRequests', 'approvalDecisions'] as const
export type PushType = (typeof PUSH_TYPES)[number]
export type PushPrefs = Record<PushType, boolean>

export const DEFAULT_PUSH_PREFS: PushPrefs = {
  activity: true,
  due: true,
  attention: true,
  budget80: true,
  budget100: true,
  approvalRequests: true,
  approvalDecisions: true,
}
export const DEFAULT_REMINDER_HOUR = 9

/** One tap to a sensible setup. Recommended is everything. */
export const PUSH_PRESETS = {
  recommended: DEFAULT_PUSH_PREFS,
  minimal: { activity: false, due: false, attention: true, budget80: false, budget100: true, approvalRequests: true, approvalDecisions: true },
  approvals: { activity: false, due: false, attention: false, budget80: false, budget100: false, approvalRequests: true, approvalDecisions: true },
} as const satisfies Record<string, PushPrefs>
export type PushPreset = keyof typeof PUSH_PRESETS
export const PUSH_PRESET_IDS = Object.keys(PUSH_PRESETS) as PushPreset[]

/** What the database holds (missing or odd values mean yes), as a complete set of choices. */
export function prefsFrom(raw: unknown): PushPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = { ...DEFAULT_PUSH_PREFS }
  for (const k of PUSH_TYPES) if (r[k] === false) out[k] = false
  return out
}

/** The preset these choices match exactly, or 'custom'. */
export function presetOf(p: PushPrefs): PushPreset | 'custom' {
  return PUSH_PRESET_IDS.find((id) => PUSH_TYPES.every((k) => PUSH_PRESETS[id][k] === p[k])) ?? 'custom'
}

export const countOn = (p: PushPrefs): number => PUSH_TYPES.filter((k) => p[k]).length

export const hourFrom = (raw: unknown): number => (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : DEFAULT_REMINDER_HOUR)

/** The hours offered for the daily reminder: waking hours, plus the saved one if it lies outside them. */
export const reminderHours = (current: number): number[] => {
  const hours = Array.from({ length: 18 }, (_, i) => i + 5) // 5 am to 10 pm
  return hours.includes(current) ? hours : [...hours, current].sort((a, b) => a - b)
}

/** "9:00 am" in English (12 hour clock; in Urdu the time of day is said in words) or "09:00" (24 hour clock). */
export function hourLabel(h: number, lang: Lang, style: Region['clock'] = getRegion().clock): string {
  if (style === '24') return `${String(h).padStart(2, '0')}:00`
  const clock = `${h % 12 || 12}:00`
  if (lang === 'en') return `${clock} ${h < 12 ? 'am' : 'pm'}`
  const part = h < 4 ? 'رات' : h < 12 ? 'صبح' : h < 16 ? 'دوپہر' : h < 20 ? 'شام' : 'رات'
  return `${clock} ${part}`
}
