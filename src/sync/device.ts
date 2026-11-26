import { db } from '../db/db'
import { deviceVerdict } from '../lib/device-owner'
import { supabase } from './supabase'

/** The account this phone's data belongs to. */
const OWNER = 'device.userId'
/** Settings about the phone itself, which stay when another account takes it over. */
const KEEP = new Set(['language', 'region'])
/** How long to wait for the server when checking whose data this is. */
const ASK_MS = 8000

export type DeviceCheck = { state: 'checking' } | { state: 'ok' } | { state: 'foreign'; projects: number; pending: number }

export async function readDeviceOwner(): Promise<string | undefined> {
  return (await db.settings.get(OWNER))?.value as string | undefined
}

/** Clears all account/project data from this browser. Language and region are device preferences, so they remain. */
export async function clearDeviceData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) if (t.name !== 'settings') await t.clear()
    const keys = (await db.settings.toCollection().primaryKeys()) as string[]
    await db.settings.bulkDelete(keys.filter((k) => !KEEP.has(k)))
  })
  try {
    // Form memory can describe the previous account's activity, so it must not cross a sign-out boundary.
    localStorage.removeItem('epc.lastCategory')
  } catch {
    /* Storage may be unavailable in private browsing. */
  }
}

/** Empties this phone and hands it to `uid`: every table, and every setting except language and region. */
export async function takeOverDevice(uid: string): Promise<void> {
  await clearDeviceData()
  await db.settings.put({ key: OWNER, value: uid })
}

/**
 * Run when an account signs in, before anything syncs. If this browser still has another account's local cache, clear that
 * cache automatically and hand the browser to the signed-in account. The previous account's synced data remains on the server.
 */
export async function checkDevice(uid: string): Promise<DeviceCheck> {
  const marker = await readDeviceOwner()
  const projects = await db.projects.toArray()
  const synced = projects.filter((p) => p.ownerId).map((p) => p.id)
  let visibleIds: string[] | undefined
  if (!marker && synced.length > 0 && supabase) {
    const ask = supabase.from('projects').select('id').in('id', synced).then(({ data, error }) => (error ? undefined : (data ?? []).map((r) => r.id as string)))
    // A server that does not answer must not keep the screen blank: carry on and ask again at the next sign-in.
    visibleIds = await Promise.race([ask, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ASK_MS))]).catch(() => undefined)
  }
  const verdict = deviceVerdict({ marker, uid, syncedProjectIds: synced, visibleIds })
  if (verdict === 'unknown') return { state: 'ok' }
  if (verdict === 'mine' || verdict === 'adopt') {
    if (marker !== uid) await db.settings.put({ key: OWNER, value: uid })
    return { state: 'ok' }
  }
  // Never block the new account behind an ownership warning. Only the browser cache is cleared here; no server rows are deleted.
  await takeOverDevice(uid)
  return { state: 'ok' }
}
