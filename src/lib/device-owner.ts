/**
 * Whose data is on this phone. The app keeps everything in the browser, so when a different account signs in on the same
 * phone the old account's projects are still there. The server never shows them to the new account, but this phone would.
 */
export type DeviceVerdict =
  /** This phone was last used by this same account. */
  | 'mine'
  /** The phone has no owner yet and nothing in it that belongs to another account: it now belongs to this account. */
  | 'adopt'
  /** The phone holds another account's data. */
  | 'foreign'
  /** It cannot be told yet (the server could not be asked): carry on and ask again next time. */
  | 'unknown'

export function deviceVerdict(x: {
  /** The account this phone was last used by, when it is known. */
  marker?: string
  uid: string
  /** Local projects that have reached the server at some point (they carry an owner). */
  syncedProjectIds: string[]
  /** Of those, the ones the server shows to this account; undefined when the server could not be asked. */
  visibleIds?: string[]
}): DeviceVerdict {
  if (x.marker) return x.marker === x.uid ? 'mine' : 'foreign'
  // No owner recorded (a phone from before this check). Data that never left the phone belongs to whoever signs in first,
  // which is how a local-only install moves to an account. Data that did reach the server belongs to someone who can see it.
  if (x.syncedProjectIds.length === 0) return 'adopt'
  if (!x.visibleIds) return 'unknown'
  const seen = new Set(x.visibleIds)
  return x.syncedProjectIds.every((id) => seen.has(id)) ? 'adopt' : 'foreign'
}
