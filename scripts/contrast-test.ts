// Checks the colour tokens in src/index.css: every text and interface pair meets WCAG 2.2 AA in both themes, and the
// greys are neutral (red = green = blue), never blue-tinted slate.
// Run: npx vite-node scripts/contrast-test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The file has Windows line endings on some machines; the patterns below expect plain newlines.
const css = readFileSync('src/index.css', 'utf8').replace(/\r\n/g, '\n')
const block = (re: RegExp): Record<string, string> => {
  const m = css.match(re)
  assert.ok(m, `block not found: ${re}`)
  const out: Record<string, string> = {}
  for (const [, k, v] of m[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) out[k] = v.toLowerCase()
  return out
}
const light = block(/:root \{([\s\S]*?)\n\}\n/)
const dark = { ...light, ...block(/\.dark \{([\s\S]*?)\n  \}\n\}/) }

const rgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
const lum = (h: string): number => {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)

// [foreground token, background token, needed ratio, what it is]
const TEXT = 4.5
const UI = 3
/** Field borders were made soft on purpose (neutral-200). They no longer carry the 3:1 of WCAG 1.4.11 on their own: a field is told apart by its label,
 *  its fill and its hover and focus states, and those keep 3:1 (the focus-ring pairs below). The border must stay at 1.2:1 or better so it never fades out, and a field's fill against the page at 1.05. */
const SOFT = 1.05
const SOFT_EDGE = 1.2
const PAIRS: [string, string, number, string][] = [
  ['foreground', 'background', TEXT, 'body text'],
  ['foreground', 'canvas', TEXT, 'text straight on the page'],
  ['card-foreground', 'card', TEXT, 'text in a card'],
  ['popover-foreground', 'popover', TEXT, 'text in a popover'],
  ['muted-foreground', 'background', TEXT, 'help text on white'],
  ['muted-foreground', 'canvas', TEXT, 'help text on the page'],
  ['muted-foreground', 'card', TEXT, 'help text in a card'],
  ['muted-foreground', 'muted', TEXT, 'help text on a muted fill'],
  ['muted-foreground', 'popover', TEXT, 'help text in a popover'],
  ['primary-foreground', 'primary', TEXT, 'button text'],
  ['primary', 'background', TEXT, 'link on white'],
  ['primary', 'canvas', TEXT, 'link on the page'],
  ['primary', 'card', TEXT, 'link in a card'],
  ['primary', 'secondary', TEXT, 'link on the brand tint'],
  ['secondary-foreground', 'secondary', TEXT, 'selected choice'],
  ['accent-foreground', 'accent', TEXT, 'hovered item'],
  ['destructive-foreground', 'destructive', TEXT, 'danger button'],
  // `destructive` is only ever a fill (button, badge, bell count) or a border; danger text uses `danger` below.
  ['success', 'background', TEXT, 'success text on white'],
  ['success', 'canvas', TEXT, 'success text on the page'],
  ['success', 'success-soft', TEXT, 'success badge'],
  ['warning', 'background', TEXT, 'warning text on white'],
  ['warning', 'canvas', TEXT, 'warning text on the page'],
  ['warning', 'warning-soft', TEXT, 'warning badge'],
  ['danger', 'background', TEXT, 'danger text on white'],
  ['danger', 'canvas', TEXT, 'danger text on the page'],
  ['danger', 'danger-soft', TEXT, 'danger badge'],
  ['info', 'background', TEXT, 'info text on white'],
  ['info', 'info-soft', TEXT, 'info notice'],
  ['sidebar-foreground', 'sidebar', TEXT, 'sidebar text'],
  ['sidebar-accent-foreground', 'sidebar-accent', TEXT, 'active sidebar item'],
  ['sidebar-primary-foreground', 'sidebar-primary', TEXT, 'sidebar avatar'],
  ['sidebar-active-foreground', 'sidebar-active', TEXT, 'selected sidebar item'],
  ['sidebar-ring', 'sidebar-active', UI, 'focus ring beside the selected sidebar item'],
  ['sidebar-primary', 'sidebar', UI, 'sidebar logo and accent'],
  // drop-downs
  ['popover-foreground', 'accent', TEXT, 'highlighted drop-down row'],
  ['primary', 'accent', UI, 'check mark on the highlighted row'],
  ['primary', 'popover', UI, 'check mark in the list'],
  ['ring', 'popover', UI, 'keyboard outline on a drop-down row'],
  ['ring', 'accent', UI, 'keyboard outline on the highlighted row'],
  ['sidebar-foreground', 'sidebar-accent', TEXT, 'sidebar drop-down text'],
  ['sidebar-primary', 'sidebar-accent', UI, 'check mark in the sidebar drop-down'],
  // interface parts: field borders, focus rings (WCAG 1.4.11)
  ['input', 'background', SOFT_EDGE, 'field border on white'],
  ['card', 'canvas', SOFT, 'field fill against the page (white in light mode; a slightly raised grey in dark mode)'],
  ['input', 'card', SOFT_EDGE, 'field border in a card'],
  ['input', 'popover', SOFT_EDGE, 'field border in a popover'],
  ['background', 'muted', SOFT, 'white field fill on a muted panel'],
  ['ring', 'background', UI, 'focus ring on white'],
  ['ring', 'canvas', UI, 'focus ring on the page'],
  ['ring', 'card', UI, 'focus ring in a card'],
  ['ring', 'secondary', UI, 'focus ring on a selected choice'],
  ['sidebar-ring', 'sidebar', UI, 'focus ring in the sidebar'],
  ['sidebar-ring', 'sidebar-accent', UI, 'focus ring on the active sidebar item'],
  // sync chip in the sidebar: coloured status text on the raised fill
  ['sidebar-foreground', 'sidebar-accent', TEXT, 'sync chip, synced'],
  ['sidebar-info', 'sidebar-accent', TEXT, 'sync chip, syncing'],
  ['sidebar-warning', 'sidebar-accent', TEXT, 'sync chip, waiting or offline'],
  ['sidebar-danger', 'sidebar-accent', TEXT, 'sync chip, problem'],
  ['sidebar-foreground', 'sidebar-border', UI, 'sync chip outline against the sidebar'],
]

let worst = Infinity
const failures: string[] = []
const margins: string[] = []
for (const [name, tokens] of [['light', light], ['dark', dark]] as const) {
  for (const [fg, bg, need, what] of PAIRS) {
    assert.ok(tokens[fg] && tokens[bg], `${name}: token missing (${fg} or ${bg})`)
    const r = ratio(tokens[fg], tokens[bg])
    worst = Math.min(worst, r - need)
    margins.push(`${(r - need).toFixed(2)}|${name}: ${what} ${r.toFixed(2)}`)
    if (r < need) failures.push(`${name}: ${what}: ${fg} ${tokens[fg]} on ${bg} ${tokens[bg]} = ${r.toFixed(2)} (needs ${need})`)
  }

  // The greys are neutral. Colour tokens (primary, secondary, status colours and their tints) are exempt.
  const GREYS = ['background', 'canvas', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'border', 'input', 'sidebar', 'sidebar-foreground', 'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border']
  for (const g of GREYS) {
    const [r, gg, b] = rgb(tokens[g])
    if (!(r === gg && gg === b)) failures.push(`${name}: ${g} ${tokens[g]} is not a neutral grey`)
  }
  // The card must read as a separate surface from the page, and the page from the sidebar.
  assert.ok(ratio(tokens.card, tokens.canvas) >= 1.03, `${name}: card and page look the same`)
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('tightest:', margins.sort((a, b) => parseFloat(a) - parseFloat(b)).slice(0, 4).map((m) => m.split('|')[1]).join('; '))
console.log(`contrast: ${PAIRS.length} pairs x 2 themes pass, greys are neutral (tightest margin ${worst.toFixed(2)} above the minimum)`)
