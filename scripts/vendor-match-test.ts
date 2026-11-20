// Checks finding a vendor's name inside typed text (Add payment). Run: npx vite-node scripts/vendor-match-test.ts
import assert from 'node:assert/strict'
import { matchVendor } from '../src/lib/vendorMatch'

const vendors = [
  { id: 'ih', name: 'Ihtisham' },
  { id: 'as', name: 'Amjad Sethi' },
  { id: 'eh', name: 'Ehsan' },
  { id: 'al', name: 'Ali' },
  { id: 'ma', name: 'Malik Builders' },
  { id: 'mab', name: 'Malik' },
  { id: 'xx', name: 'Jo' },
]
const id = (text: string) => matchVendor(text, vendors)?.id

// The names as they were hidden in the old sheet's purposes.
assert.equal(id('Ihtisham wood work'), 'ih')
assert.equal(id('amjad sethi sb mazdoori'), 'as')
assert.equal(id('plumber payment (Ehsan)'), 'eh')
assert.equal(id('  EHSAN   ka   saman '), 'eh', 'case and spacing do not matter')
assert.equal(id('Ihtisham, wood-work'), 'ih', 'punctuation does not matter')

// Whole words only.
assert.equal(id('Salim cement'), undefined, '"Ali" is not inside "Salim"')
assert.equal(id('Malika paint'), undefined, '"Malik" is not inside "Malika"')
assert.equal(id('Ali ka saman'), 'al')
assert.equal(id('Ihtishams wood'), undefined)

// A full name is needed: one word of a two-word name is not enough, and the longest name wins.
assert.equal(id('Amjad mazdoori'), undefined, 'only "Amjad" of "Amjad Sethi"')
assert.equal(id('Sethi saman'), undefined)
assert.equal(id('Malik Builders advance'), 'ma', 'the longer name beats "Malik"')
assert.equal(id('Malik advance'), 'mab')

// Too short, empty, or nothing there.
assert.equal(id('Jo ka kaam'), undefined, 'a name under three letters is never matched')
assert.equal(id(''), undefined)
assert.equal(id('   '), undefined)
assert.equal(id('cement bags'), undefined)
assert.equal(matchVendor('anything', []), undefined)

// Other scripts work too (Urdu names).
assert.equal(matchVendor('احسان کی مزدوری', [{ id: 'u', name: 'احسان' }])?.id, 'u')
assert.equal(matchVendor('احسانی کی مزدوری', [{ id: 'u', name: 'احسان' }]), undefined)

console.log('vendor match: all checks passed')
