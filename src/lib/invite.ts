/** What a person types or pastes for an invite code, reduced to the characters of the code itself (upper case, at most 12). */
export const cleanInviteCode = (raw: string): string => raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)

/** A code the way it is shown and sent: three groups of four, ABCD-EFGH-IJKL. A partly typed code is grouped as far as it goes. */
export const groupInviteCode = (raw: string): string => (cleanInviteCode(raw).match(/.{1,4}/g) ?? []).join('-')

/** A complete code is 12 characters. */
export const isCompleteInviteCode = (raw: string): boolean => cleanInviteCode(raw).length === 12

/** A shareable account/join link. `invite` stays separate from Supabase Auth's own `code` query parameter. */
export const inviteLink = (origin: string, code: string): string => {
  const url = new URL('/join', origin)
  url.searchParams.set('type', 'create')
  url.searchParams.set('invite', cleanInviteCode(code))
  return url.toString()
}
