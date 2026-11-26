import type { SupabaseClient } from '@supabase/supabase-js'

/** Only what these functions use, so a test can hand in a stand-in. */
export type AuthClient = Pick<SupabaseClient, 'auth'>

export const MIN_PASSWORD = 8

export type PasswordResult = 'ok' | 'tooShort' | 'mismatch' | 'same' | 'wrongCurrent' | 'weak' | 'failed'

/**
 * Changes the signed-in person's password.
 * The current password is checked first by signing in with it, so someone holding an unlocked phone cannot take over the
 * account. Nothing is sent for a password that is too short, does not match its repeat, or is the same as the old one.
 */
export async function changePassword(client: AuthClient, email: string, current: string, next: string, repeat: string): Promise<PasswordResult> {
  if (next.length < MIN_PASSWORD) return 'tooShort'
  if (next !== repeat) return 'mismatch'
  if (next === current) return 'same'

  const check = await client.auth.signInWithPassword({ email, password: current })
  if (check.error) return check.error.code === 'invalid_credentials' ? 'wrongCurrent' : 'failed'

  const { error } = await client.auth.updateUser({ password: next })
  if (!error) return 'ok'
  if (error.code === 'weak_password') return 'weak'
  if (error.code === 'same_password') return 'same'
  return 'failed'
}
