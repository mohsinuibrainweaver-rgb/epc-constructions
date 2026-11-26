/** What a person types or pastes for an invite code, reduced to the characters of the code itself (upper case, at most 12). */
export const cleanInviteCode = (raw: string): string => raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)

/** A code the way it is shown and sent: three groups of four, ABCD-EFGH-IJKL. A partly typed code is grouped as far as it goes. */
export const groupInviteCode = (raw: string): string => (cleanInviteCode(raw).match(/.{1,4}/g) ?? []).join('-')

/** A complete code is 12 characters. */
export const isCompleteInviteCode = (raw: string): boolean => cleanInviteCode(raw).length === 12

/** The app page that accepts an invitation. Signed-out recipients always start on Create account and can switch to Sign in. */
export const inviteJoinLink = (origin: string, code: string, autoAccept = false): string => {
  const url = new URL('/join', origin)
  url.searchParams.set('type', 'create')
  url.searchParams.set('invite', cleanInviteCode(code))
  if (autoAccept) url.searchParams.set('accept', 'auto')
  return url.toString()
}

/** A shareable invite URL. In production it passes through a public Edge Function so WhatsApp and other link crawlers
 * receive the project's name and thumbnail as Open Graph metadata before the browser is redirected to the normal join page. */
export const inviteLink = (origin: string, code: string): string => {
  const appUrl = new URL(origin)
  if (appUrl.hostname === 'localhost' || appUrl.hostname === '127.0.0.1') return inviteJoinLink(origin, code)

  const url = new URL('/api/invite', origin)
  url.searchParams.set('invite', cleanInviteCode(code))
  // A changed preview URL makes social apps fetch fresh Open Graph metadata instead of reusing an old generic card.
  url.searchParams.set('preview', '3')
  return url.toString()
}
