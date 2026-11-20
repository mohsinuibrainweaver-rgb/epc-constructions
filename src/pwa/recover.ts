/**
 * After a new version is published, a phone can still hold the previous version's page while the files it
 * asks for have been replaced. The page then fails to load a screen (a "chunk"). The fix is always the same:
 * drop the cached copy of the app and load the current one. It is tried once, so it can never loop.
 */
const FLAG = 'epc-recovered-at'

export const isChunkError = (e: unknown): boolean => {
  const m = e instanceof Error ? e.message : String(e)
  return /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch dynamically|module script|error loading dynamically/i.test(m)
}

export async function reloadFresh(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations()
    await Promise.all((regs ?? []).map((r) => r.unregister()))
    if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  } catch {
    /* reloading is still worth trying */
  }
  location.reload()
}

/** Returns true when a recovery reload was started (at most once per 20 seconds). */
export function recoverOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(FLAG) ?? 0)
    if (Date.now() - last < 20_000) return false
    sessionStorage.setItem(FLAG, String(Date.now()))
  } catch {
    /* private mode: fall through and try once */
  }
  void reloadFresh()
  return true
}
