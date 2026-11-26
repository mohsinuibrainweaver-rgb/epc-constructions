// Checks the password rules and strength used when creating an account. Run: npx vite-node scripts/password-test.ts
import assert from 'node:assert/strict'
import { checkPassword } from '../src/lib/password'

const s = (pw: string) => checkPassword(pw).strength
const ok = (pw: string) => checkPassword(pw).ok

// 1. Nothing typed: no strength shown, not allowed.
assert.equal(s(''), 'none')
assert.equal(checkPassword('').bars, 0)
assert.equal(ok(''), false)

// 2. Required rules: 8+ characters, both cases, a number.
assert.equal(ok('Abcdef1'), false, 'seven characters')
assert.equal(ok('abcdefg1'), false, 'no capital')
assert.equal(ok('ABCDEFG1'), false, 'no lower case')
assert.equal(ok('Abcdefgh'), false, 'no number')
assert.equal(ok('Abcdefg1'), true)
assert.equal(ok('abcdefg1!X'), true)

// 3. Anything not allowed is weak, however long.
assert.equal(s('abcdefghijklmnopqrstu'), 'weak')
assert.equal(s('Ab1'), 'weak')

// 4. Allowed passwords rise with a symbol and with length.
assert.equal(s('Abcdefg1'), 'fair')
assert.equal(s('Abcdefg1!'), 'good')
assert.equal(s('Abcdefg1!xyz'), 'strong')
assert.equal(s('Abcdefghij1k'), 'good', 'long without a symbol')

// 5. A common base still gets a warning, but a valid mixed password is not mislabeled as Weak.
assert.equal(ok('Password1'), true)
assert.equal(s('Password1'), 'fair')
assert.equal(checkPassword('Password1').common, true)
assert.equal(s('Qwerty123!'), 'fair')
assert.equal(s('Construction1!'), 'fair')
assert.equal(checkPassword('12345678').common, true)
assert.equal(checkPassword('aaaaaaaa').common, true)
assert.equal(checkPassword('Tr4ctor!Moon').common, false)
assert.equal(s('EndpointSecure@2026'), 'strong', 'a complex phrase must not be weak just because it starts with a known word')

// 6. Bars match the level, and the symbol rule is advice only.
assert.deepEqual(['Ab1', 'Abcdefg1', 'Abcdefg1!', 'Abcdefg1!xyz'].map((p) => checkPassword(p).bars), [1, 2, 3, 4])
assert.equal(checkPassword('Abcdefg1').rules.find((r) => r.id === 'symbol')!.required, false)

console.log('password: all checks passed')
