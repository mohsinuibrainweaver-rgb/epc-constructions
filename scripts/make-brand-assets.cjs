// Builds the mark-only logo files and the app icons from the two supplied logo files in src/assets/brand.
// Run: node scripts/make-brand-assets.cjs   (needs sharp)
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const root = path.resolve(__dirname, '..')
const brand = path.join(root, 'src/assets/brand')
const icons = path.join(root, 'public/icons')

/** The mark is the first two paths of the logo file (the indigo stack and the dot above it); the rest is the wordmark. */
const markOf = (file) => {
  const svg = fs.readFileSync(path.join(brand, file), 'utf8')
  const paths = [...svg.matchAll(/<path [^>]*?\/>/g)].slice(0, 2).map((m) => m[0])
  if (paths.length !== 2) throw new Error('unexpected logo layout in ' + file)
  return `<svg width="196" height="293" viewBox="0 0 196 293" fill="none" xmlns="http://www.w3.org/2000/svg">\n${paths.join('\n')}\n</svg>\n`
}

const markColored = markOf('endpoint-construction-logo.svg')
fs.writeFileSync(path.join(brand, 'endpoint-construction-mark.svg'), markColored)
fs.writeFileSync(path.join(brand, 'endpoint-construction-mark-white.svg'), markOf('endpoint-construction-logo-white.svg'))

/** A square icon: the mark at `share` of the height, centred on `bg` (transparent when bg is undefined). */
const icon = async (size, share, bg, out) => {
  const h = Math.round(size * share)
  const mark = await sharp(Buffer.from(markColored), { density: 600 }).resize({ height: h }).png().toBuffer()
  const { width: w } = await sharp(mark).metadata()
  await sharp({ create: { width: size, height: size, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png()
    .toFile(path.join(icons, out))
}

;(async () => {
  const white = { r: 255, g: 255, b: 255, alpha: 1 }
  const tint = { r: 238, g: 240, b: 255, alpha: 1 }
  await icon(512, 0.66, white, 'icon-512.png')
  await icon(192, 0.66, white, 'icon-192.png')
  await icon(180, 0.66, white, 'apple-touch-icon.png')
  await icon(64, 0.86, undefined, 'favicon-64.png')
  await icon(512, 0.5, tint, 'maskable-512.png')
  await icon(192, 0.5, tint, 'maskable-192.png')
  console.log('brand assets written')
})()
