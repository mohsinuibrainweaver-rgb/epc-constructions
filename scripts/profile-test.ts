// Checks how a phone takes the name and role from the signed-in account. Run: npx vite-node scripts/profile-test.ts
import assert from 'node:assert/strict'
import { profileToApply, readProfile } from '../src/lib/profile'

assert.deepEqual(readProfile({ name: '  Mohsin ', role: 'investor' }), { name: 'Mohsin', role: 'investor' })
assert.deepEqual(readProfile({ name: '   ', role: 'admin' }), { name: undefined, role: undefined }, 'blank names and unknown roles are ignored')
assert.deepEqual(readProfile(undefined), { name: undefined, role: undefined })
assert.deepEqual(readProfile({ name: 5, role: null }), { name: undefined, role: undefined })

// The account wins over what the phone has (left over from another account).
assert.deepEqual(profileToApply({ name: 'Mohsin', role: 'investor' }, { userName: 'test', role: 'builder' }), { userName: 'Mohsin', role: 'investor' })
// Nothing to change when they already match.
assert.deepEqual(profileToApply({ name: 'Mohsin', role: 'investor' }, { userName: 'Mohsin', role: 'investor' }), {})
// An older account with no profile leaves the phone as it is.
assert.deepEqual(profileToApply({}, { userName: 'test', role: 'builder' }), {})
// A phone with nothing yet takes what the account has.
assert.deepEqual(profileToApply({ name: 'Mohsin' }, {}), { userName: 'Mohsin' })

console.log('profile: all checks passed')
