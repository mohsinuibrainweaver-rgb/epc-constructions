import { db } from '../db/db'
import { deviceVerdict } from '../lib/device-owner'
import { countPending } from './engine'
import { supabase } from './supabase'

/** The account this phone's data belongs to. */
const OWNER = 'device.userId'
/** Settings about the phone itself, which stay when another account takes it over. */
const KEEP = new Set(['language', 'region'])

export type DeviceCheck = { state: 'checking' } | { state: 'ok' } | { state: 'foreign'; projects: number; pending: number }

export async function readDeviceOwner(): Promise<string | undefined> {
  return (await db.settings.get(OWNER))?.value as string | undefined
}

/** Empties this phone and hands it to `uid`: every table, and every setting except language and region. */
export async function takeOverDevice(uid: string): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) if (t.name !== 'settings') await t.clear()
    const keys = (await db.settings.toCollection().primaryKeys()) as string[]
    await db.settings.bulkDelete(keys.filter((k) => !KEEP.has(k)))
    await db.settings.put({ key: OWNER, value: uid })
  })
}

/**
 * Run when an account signs in, before anything syncs. Says whether the data on this phone is this account's; if it is another
 * account's, nothing is shown or sent until the person decides (see the DeviceOwner screen).
 */
export async function checkDevice(uid: string): Promise<DeviceCheck> {
  const marker = await readDeviceOwner()
  const projects = await db.projects.toArray()
  const synced = projects.filter((p) => p.ownerId).map((p) => p.id)
  let visibleIds: string[] | undefined
  if (!marker && synced.length > 0 && supabase) {
    const { data, error } = await supabase.from('projects').select('id').in('id', synced)
    if (!error) visibleIds = (data ?? []).map((r) => r.id as string)
  }
  const verdict = deviceVerdict({ marker, uid, syncedProjectIds: synced, visibleIds })
  if (verdict === 'unknown') return { state: 'ok' }
  if (verdict === 'mine' || verdict === 'adopt') {
    if (marker !== uid) await db.settings.put({ key: OWNER, value: uid })
    return { state: 'ok' }
  }
  const live = projects.filter((p) => !p.deletedAt).length
  const pending = await countPending()
  // Nothing of the other account is left here, so there is nothing to lose or to ask about.
  if (live === 0 && pending === 0) {
    await takeOverDevice(uid)
    return { state: 'ok' }
  }
  return { state: 'foreign', projects: live, pending }
}
