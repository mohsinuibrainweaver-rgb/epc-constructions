// Checks the colours of the statistics cards (the mesh gradients in src/index.css): their text, link and status colours must keep at least
// 4.5:1 (WCAG AA) on the darkest stop of every gradient, in light mode and in dark mode. A blend of stops is never darker than its darkest
// stop, so passing there covers the whole card. Run: npx vite-node scripts/mesh-contrast-test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const lum = (h: string) => {
  const [r, g, b] = rgb(h)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const ratio = (a: string, b: string) => {
  const x = lum(a)
  const y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const hex = (s: string) => s.toLowerCase()

// 1. Six palettes, four colours each, exactly as specified.
// Every data card now shares one soft neutral grey mesh; the six names are kept so cards can be told apart again later.
const NEUTRAL = ['#e8eaed', '#f3f4f6', '#e1e5ea', '#fafafc']
const SPEC: Record<string, string[]> = Object.fromEntries(['amethyst', 'arctic', 'champagne', 'rose', 'sage', 'periwinkle'].map((n) => [n, NEUTRAL]))
const palettes: Record<string, string[]> = {}
for (const name of Object.keys(SPEC)) {
  const m = [...css.matchAll(/((?:\.mesh-[\w-]+,\s*)*\.mesh-[\w-]+)\s*\{([^}]*)\}/g)].find((x) => new RegExp(`\\.mesh-${name}\\b`).test(x[1]) && x[2].includes('--mesh-c1'))
  assert.ok(m, `palette ${name} is in index.css`)
  palettes[name] = [1, 2, 3, 4].map((i) => hex(new RegExp(`--mesh-c${i}:\\s*(#[0-9a-fA-F]{6})`).exec(m![2])![1]))
  assert.deepEqual(palettes[name], SPEC[name], `${name} colours`)
}

// 2. The gradient class: four radial gradients over the fourth colour, sized to the whole box so no strip of the opposite side's colours
//    shows along a transparent border.
const g = /\.mesh-gradient\s*\{([^}]*)\}/.exec(css)![1]
const shorthand = /background:([^;]*);/.exec(g)![1]
assert.equal((shorthand.match(/radial-gradient\(/g) ?? []).length, 4)
assert.match(shorthand.trim(), /var\(--mesh-4\)$/, 'the fourth colour is the base under the gradients')
assert.match(g, /background-origin:\s*border-box/, 'gradient sized to the border box')
assert.match(g, /background-clip:\s*border-box/)

// 3. Text colours inside a card, from the stylesheet.
const block = (re: RegExp) => re.exec(css)![1]
const light = block(/\n\s*\.mesh-card\s*\{([^}]*)\}/)
const dark = block(/\.dark \.mesh-card\s*\{([^}]*)\}/)
const pick = (b: string, v: string) => hex(new RegExp(`--${v}:\\s*(#[0-9a-fA-F]{6})`).exec(b)![1])
const names = ['foreground', 'muted-foreground', 'primary', 'success', 'warning', 'danger', 'info']

// light: the stops are the palette mixed toward white by --mesh-strength; the darkest of them against each text colour
const strength = Number(/--mesh-strength:\s*(\d+)%/.exec(light)![1]) / 100
assert.ok(strength > 0 && strength <= 1, 'mesh strength is a percentage')
assert.match(light, /color-mix\(in oklab, var\(--mesh-c1\) var\(--mesh-strength\), white\)/)
const lift = (c: string) => '#' + rgb(c).map((v) => Math.round(v * strength + 255 * (1 - strength)).toString(16).padStart(2, '0')).join('')
for (const [name, stops] of Object.entries(palettes)) {
  for (const v of names) {
    const fg = pick(light, v)
    const worst = Math.min(...stops.map((s) => ratio(fg, lift(s))))
    assert.ok(worst >= 4.5, `light ${name}: --${v} ${fg} is only ${worst.toFixed(2)}:1`)
  }
}

// dark: the stops are mixed 26% into #0b0b0f (the same mix as in the stylesheet)
const mix = (c: string, pct: number) => {
  const base = [11, 11, 15]
  return '#' + rgb(c).map((v, i) => Math.round(v * pct + base[i] * (1 - pct)).toString(16).padStart(2, '0')).join('')
}
assert.match(css, /color-mix\(in oklab, var\(--mesh-c1\) 26%, #0b0b0f\)/)
for (const [name, stops] of Object.entries(palettes)) {
  for (const v of names) {
    const fg = pick(dark, v)
    // the lightest stop is the hardest background for light text
    const worst = Math.min(...stops.map((s) => ratio(fg, mix(s, 0.26))))
    assert.ok(worst >= 4.5, `dark ${name}: --${v} ${fg} is only ${worst.toFixed(2)}:1`)
  }
}

console.log(`mesh contrast: all ${Object.keys(palettes).length} palettes x ${names.length} colours x 2 themes pass AA`)
