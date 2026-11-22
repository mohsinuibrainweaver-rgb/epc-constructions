/**
 * Avatar colours for a list. Each colour belongs to a family (the greens are emerald, teal and lime, and so on), and a list never puts
 * the same family within two rows of itself, nor the same colour within four rows. A vendor keeps the colour its id prefers whenever that
 * does not clash with the rows just above it, so colours stay steady from visit to visit and change only when a neighbour would match.
 * Classes are written out in full so Tailwind finds them: light fill (colour-100) with the icon in colour-500; softer tint and lighter icon in dark mode.
 */
export type Family = 'green' | 'blue' | 'violet' | 'pink' | 'orange'

export interface AvatarColour {
  family: Family
  classes: string
}

export const PALETTE: AvatarColour[] = [
  { family: 'blue', classes: 'bg-blue-100 text-blue-500 dark:bg-blue-500/20 dark:text-blue-300' },
  { family: 'orange', classes: 'bg-orange-100 text-orange-500 dark:bg-orange-500/20 dark:text-orange-300' },
  { family: 'green', classes: 'bg-emerald-100 text-emerald-500 dark:bg-emerald-500/20 dark:text-emerald-300' },
  { family: 'violet', classes: 'bg-violet-100 text-violet-500 dark:bg-violet-500/20 dark:text-violet-300' },
  { family: 'pink', classes: 'bg-rose-100 text-rose-500 dark:bg-rose-500/20 dark:text-rose-300' },
  { family: 'blue', classes: 'bg-cyan-100 text-cyan-500 dark:bg-cyan-500/20 dark:text-cyan-300' },
  { family: 'orange', classes: 'bg-amber-100 text-amber-500 dark:bg-amber-500/20 dark:text-amber-300' },
  { family: 'violet', classes: 'bg-indigo-100 text-indigo-500 dark:bg-indigo-500/20 dark:text-indigo-300' },
  { family: 'green', classes: 'bg-teal-100 text-teal-500 dark:bg-teal-500/20 dark:text-teal-300' },
  { family: 'pink', classes: 'bg-fuchsia-100 text-fuchsia-500 dark:bg-fuchsia-500/20 dark:text-fuchsia-300' },
  { family: 'blue', classes: 'bg-sky-100 text-sky-500 dark:bg-sky-500/20 dark:text-sky-300' },
  { family: 'green', classes: 'bg-lime-100 text-lime-600 dark:bg-lime-500/20 dark:text-lime-300' },
]

/** How many rows above a row to look for the same family, and for the same exact colour. */
export const FAMILY_GAP = 2
export const COLOUR_GAP = 4

/** The colour an id prefers (djb2 hash), as a position in PALETTE. */
export function preferredIndex(id: string): number {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0
  return h % PALETTE.length
}

/** The colour for each id of a list, by id. Compute it once from the whole list and look rows up, so a thing keeps one colour wherever it is shown. */
export function colourMap(ids: string[]): Map<string, string> {
  const colours = assignColours(ids)
  return new Map(ids.map((id, i) => [id, colours[i]]))
}

/** One colour class string for each id, in the order given. */
export function assignColours(ids: string[]): string[] {
  const chosen: number[] = []
  for (const id of ids) {
    const above = chosen.slice(-COLOUR_GAP)
    const nearFamilies = new Set(chosen.slice(-FAMILY_GAP).map((i) => PALETTE[i].family))
    const start = preferredIndex(id)
    let pick = -1
    for (let k = 0; k < PALETTE.length; k++) {
      const i = (start + k) % PALETTE.length
      if (!above.includes(i) && !nearFamilies.has(PALETTE[i].family)) {
        pick = i
        break
      }
    }
    chosen.push(pick === -1 ? start : pick) // cannot happen with five families; keeps the list working all the same
  }
  return chosen.map((i) => PALETTE[i].classes)
}
