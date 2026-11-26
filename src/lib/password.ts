/**
 * Password rules and strength for creating an account. Signing in is not checked here: an older, shorter password still works.
 *
 * Required to create an account: 8 or more characters, a lower-case and an upper-case letter, and a number.
 * A symbol and 12 or more characters are not required, but they raise the strength.
 */

export const MIN_NEW_PASSWORD = 8

export type RuleId = 'length' | 'case' | 'number' | 'symbol'

export interface PasswordRule {
  id: RuleId
  met: boolean
  /** Counts toward being allowed. A symbol is advice only. */
  required: boolean
}

export type Strength = 'none' | 'weak' | 'fair' | 'good' | 'strong'
export const STRENGTH_STEPS: Strength[] = ['weak', 'fair', 'good', 'strong']

export interface PasswordCheck {
  rules: PasswordRule[]
  /** Every required rule is met. */
  ok: boolean
  strength: Strength
  /** How many of the four bars are filled (0 to 4). */
  bars: number
  /** The password is one that is guessed first (a common word, a run of one character, 12345678). */
  common: boolean
}

// Passwords tried first by anyone guessing. Compared in lower case, with the digits and symbols after a word removed.
const COMMON = ['password', 'passw0rd', 'qwerty', 'qwertyuiop', 'letmein', 'welcome', 'admin', 'iloveyou', 'abc123', 'monkey', 'dragon', 'pakistan', 'construction', 'endpoint', 'house']

const isCommon = (pw: string): boolean => {
  const p = pw.toLowerCase()
  if (/^(.)\1+$/.test(p)) return true // aaaaaaaa
  if ('0123456789'.includes(p) || '9876543210'.includes(p) || 'abcdefghijklmnopqrstuvwxyz'.includes(p)) return true // 12345678, abcdefgh
  const word = p.replace(/[^a-z]/g, '')
  return COMMON.some((c) => word === c)
}

export function checkPassword(pw: string): PasswordCheck {
  const rules: PasswordRule[] = [
    { id: 'length', met: pw.length >= MIN_NEW_PASSWORD, required: true },
    { id: 'case', met: /[a-z]/.test(pw) && /[A-Z]/.test(pw), required: true },
    { id: 'number', met: /\d/.test(pw), required: true },
    { id: 'symbol', met: /[^A-Za-z0-9]/.test(pw), required: false },
  ]
  const ok = rules.every((r) => !r.required || r.met)
  const common = pw.length > 0 && isCommon(pw)
  if (pw.length === 0) return { rules, ok, strength: 'none', bars: 0, common }

  const points = rules.filter((r) => r.met).length + (pw.length >= 12 ? 1 : 0) // 0 to 5
  let strength: Strength
  if (!ok) strength = 'weak'
  // A familiar word with the required mix is still guessable, but it is not equivalent to a password
  // that fails the rules. Keep the warning visible and cap it at Fair instead of incorrectly calling
  // every otherwise-complex variation Weak.
  else if (common) strength = 'fair'
  else if (points <= 3) strength = 'fair'
  else if (points === 4) strength = 'good'
  else strength = 'strong'
  return { rules, ok, strength, bars: STRENGTH_STEPS.indexOf(strength) + 1, common }
}
