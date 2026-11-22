// Checks the avatar colours of a list. Run: npx vite-node scripts/avatar-colours-test.ts
import assert from 'node:assert/strict'
import { assignColours, COLOUR_GAP, FAMILY_GAP, PALETTE, preferredIndex } from '../src/lib/avatarColours'

const familyOf = (classes: string) => PALETTE.find((c) => c.classes === classes)!.family
const ids = (n: number, tag = 'v') => Array.from({ length: n }, (_, i) => `${tag}-${i}-${(i * 2654435761) % 99991}`)

// 1. Over many lists of many sizes: no family within FAMILY_GAP rows, no exact colour within COLOUR_GAP rows.
for (const n of [1, 2, 3, 5, 8, 13, 40, 120]) {
  for (const tag of ['a', 'b', 'c', 'uuid', 'vendor']) {
    const colours = assignColours(ids(n, tag))
    assert.equal(colours.length, n)
    colours.forEach((c, i) => {
      for (let d = 1; d <= Math.max(FAMILY_GAP, COLOUR_GAP) && i - d >= 0; d++) {
        if (d <= FAMILY_GAP) assert.notEqual(familyOf(c), familyOf(colours[i - d]), `same family ${d} rows apart (n=${n}, ${tag}, row ${i})`)
        if (d <= COLOUR_GAP) assert.notEqual(c, colours[i - d], `same colour ${d} rows apart (n=${n}, ${tag}, row ${i})`)
      }
    })
  }
}

// 2. The three greens are never close to each other.
const greens = PALETTE.filter((c) => c.family === 'green').map((c) => c.classes)
assert.equal(greens.length, 3)
const big = assignColours(ids(60, 'g'))
const greenRows = big.map((c, i) => (greens.includes(c) ? i : -1)).filter((i) => i >= 0)
greenRows.slice(1).forEach((row, k) => assert.ok(row - greenRows[k] > FAMILY_GAP, `greens only ${row - greenRows[k]} rows apart`))

// 3. Same input, same output; and a vendor keeps its preferred colour when nothing above it clashes.
assert.deepEqual(assignColours(ids(20, 'x')), assignColours(ids(20, 'x')))
const first = ids(1, 'solo')[0]
assert.equal(assignColours([first])[0], PALETTE[preferredIndex(first)].classes)

// 4. The colours are spread out, not all one or two.
assert.ok(new Set(assignColours(ids(60, 'spread'))).size >= 8, 'too few colours used')

console.log('avatar colours: all checks passed')
