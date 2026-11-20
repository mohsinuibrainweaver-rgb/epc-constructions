import type { Role } from '../db/types'

/** What an account says about its owner: the name shown next to the entries they add, and their role. Kept in the account's metadata. */
export interface Profile {
  name?: string
  role?: Role
}

/** Reads the profile out of an account's metadata, ignoring anything that is not a usable value. */
export function readProfile(meta: unknown): Profile {
  const m = (meta ?? {}) as { name?: unknown; role?: unknown }
  const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim() : undefined
  const role = m.role === 'investor' || m.role === 'builder' ? m.role : undefined
  return { name, role }
}

/**
 * What to write on this phone so it matches the account: whatever the account says wins over what the phone has
 * (the phone may hold values left by another account). A value the account does not have yet is left alone.
 */
export function profileToApply(account: Profile, local: { userName?: string; role?: Role }): { userName?: string; role?: Role } {
  const out: { userName?: string; role?: Role } = {}
  if (account.name && account.name !== local.userName) out.userName = account.name
  if (account.role && account.role !== local.role) out.role = account.role
  return out
}
