// Builds the PWA icons from the official Endpoint Clients E mark (never redrawn,
// only placed on a square canvas). Run: node scripts/make-icons.mjs
import sharp from 'sharp'
import { readFile, mkdir } from 'node:fs/promises'

const mark = await readFile('src/assets/brand/endpoint-mark.svg')
const out = 'public/icons'
await mkdir(out, { recursive: true })

const MARK_W = 142
const MARK_H = 213

async function icon(size, markHeightRatio, background, file) {
  const markH = Math.round(size * markHeightRatio)
  const markW = Math.round((markH * MARK_W) / MARK_H)
  const glyph = await sharp(mark, { density: 600 })
    .resize(markW, markH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: glyph, left: Math.round((size - markW) / 2), top: Math.round((size - markH) / 2) }])
    .png()
    .toFile(`${out}/${file}`)
}

const white = { r: 255, g: 255, b: 255, alpha: 1 }
const tint = { r: 238, g: 240, b: 255, alpha: 1 }
const clear = { r: 0, g: 0, b: 0, alpha: 0 }

await icon(192, 0.66, white, 'icon-192.png')
await icon(512, 0.66, white, 'icon-512.png')
// Maskable icons keep the mark inside the central safe zone (about 60%).
await icon(192, 0.5, tint, 'maskable-192.png')
await icon(512, 0.5, tint, 'maskable-512.png')
await icon(180, 0.62, white, 'apple-touch-icon.png')
await icon(64, 0.9, clear, 'favicon-64.png')
console.log('icons written to', out)
