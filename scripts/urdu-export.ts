// Writes every English and Urdu string, with the screen it belongs to, as JSON for the review sheet.
// Run: npx vite-node scripts/urdu-export.ts docs/urdu-review/strings.json
import { writeFileSync } from 'node:fs'
import { en } from '../src/i18n/en'
import { ur } from '../src/i18n/ur'

/** Which screen a key belongs to, by its prefix. The reviewer sees this to understand the context. */
const AREAS: [string[], string][] = [
  [['app', 'nav', 'more', 'a11y', 'common'], '1 Menu, buttons and general words'],
  [['welcome', 'auth'], '2 First screen and sign in'],
  [['projects', 'pf'], '3 Projects and the new-project form'],
  [['home'], '4 Home screen'],
  [['phases', 'phase'], '5 Phases (stages of the build)'],
  [['vendors', 'role'], '6 Vendors and their roles'],
  [['ledger'], '7 Ledger (list of payments)'],
  [['pay', 'status', 'mode', 'paidBy', 'cat', 'misc'], '8 Adding or editing a payment'],
  [['approval'], '9 Approval of the builder\'s entries'],
  [['plans', 'due'], '10 Weekly payments and due list'],
  [['stl', 'xfer'], '11 Settlement, advances and the builder fee'],
  [['mat', 'unit'], '12 Materials'],
  [['contract'], '13 Contracts'],
  [['stmt'], '14 Statements (print or PDF)'],
  [['files', 'ftype'], '15 Files and photos'],
  [['reports'], '16 Reports'],
  [['people', 'sync', 'pwa', 'err', 'set'], '17 Settings and sync'],
  [['soon'], '18 Other'],
  [['push', 'notif'], '20 Reminders and alerts (notifications)'],
]

/** Texts of the Settings screens that are about region and format get their own group, so the reviewer sees them together. */
const areaOf = (key: string): string => {
  if (key.startsWith('set.region.')) return '21 Region and format (dates, numbers, money)'
  return AREAS.find(([prefixes]) => prefixes.includes(key.split('.')[0]))?.[1] ?? '18 Other'
}
const placeholders = (s: string): string[] => [...new Set(s.match(/\{[a-zA-Z]+\}/g) ?? [])]

const rows = (Object.keys(en) as (keyof typeof en)[]).map((key) => ({
  key,
  area: areaOf(key),
  en: en[key] as string,
  ur: (ur as Record<string, string>)[key] ?? '',
  placeholders: placeholders(en[key] as string),
}))

const out = process.argv[2]
if (out) writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), rows }, null, 1))
console.log(`${rows.length} strings, ${rows.filter((r) => r.placeholders.length).length} with {placeholders}, ${new Set(rows.map((r) => r.area)).size} areas`)
const missing = rows.filter((r) => !r.ur)
if (missing.length) console.log('Missing Urdu:', missing.map((m) => m.key).join(', '))
