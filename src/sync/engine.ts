/* eslint-disable @typescript-eslint/no-explicit-any */
import { db, onLocalWrite, remoteTx } from '../db/db'
import type { Attachment, Project, ProjectFile } from '../db/types'
import { BUCKET, supabase } from './supabase'
import { TABLES, type TableDef } from './mapping'
import { recordConflicts, staleIds } from './conflicts'
import { fillDefaults } from './payload'
import { mimeForPath, storageExt } from '../lib/media'

export type SyncState = 'off' | 'signedOut' | 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  /** A newer part of the schema is missing on the server; the rest still syncs. */
  warning?: string
  state: SyncState
  /** Rows changed on this device that the server has not received yet. */
  pending: number
  lastSync?: number
  error?: string
}

let status: SyncStatus = { state: 'off', pending: 0 }
const subs = new Set<() => void>()
const set = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch }
  subs.forEach((f) => f())
}
export const getStatus = (): SyncStatus => status
export const subscribe = (f: () => void): (() => void) => {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

let userId: string | null = null
let running = false
let again = false
let pushTimer: ReturnType<typeof setTimeout> | undefined
let pullTimer: ReturnType<typeof setTimeout> | undefined
let stops: (() => void)[] = []

/** Rows taken off this device during the current sync because the server refused them (see reconcileRejected). */
let refusedNow = 0
const refusedListeners = new Set<(n: number) => void>()
/** Called with how many changes the server did not accept, so the person is told instead of finding out later. */
export const onRefused = (f: (n: number) => void): (() => void) => {
  refusedListeners.add(f)
  return () => {
    refusedListeners.delete(f)
  }
}

const EPOCH = '1970-01-01T00:00:00+00:00'
const PAGE = 1000

export async function countPending(): Promise<number> {
  const counts = await Promise.all(TABLES.map((d) => d.table.where('dirty').equals(1).count()))
  return counts.reduce((a, b) => a + b, 0)
}

const message = (e: unknown): string => {
  if (e && typeof e === 'object' && 'message' in e) {
    const x = e as { message: unknown; code?: unknown; details?: unknown; hint?: unknown }
    return [String(x.message), x.code ? `[${String(x.code)}]` : '', x.details ? String(x.details) : '', x.hint ? String(x.hint) : '']
      .filter(Boolean)
      .join(' ')
  }
  return String(e)
}

/** Names the table in a failure so a problem on the server side is easy to find. */
const named = (table: string, error: unknown): Error => new Error(`${table}: ${message(error)}`)

const codeOf = (e: unknown): string => (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '')

/** The server has not got this table yet (the updated schema.sql was not run). */
const isMissingTable = (e: unknown): boolean => ['PGRST205', '42P01'].includes(codeOf(e))

/** Column name out of "Could not find the 'x' column of 'y' in the schema cache". */
const missingColumn = (e: unknown): string | undefined =>
  codeOf(e) === 'PGRST204' ? /'([^']+)' column/.exec(message(e))?.[1] : undefined

const warnings = new Set<string>()
const warn = (what: string) => {
  warnings.add(what)
  set({ warning: [...warnings].join(', ') })
}

async function upload(path: string, blob: Blob, contentType?: string): Promise<void> {
  const { error } = await supabase!.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type || contentType || 'image/jpeg',
  })
  if (error) throw named('storage', error)
}

const remoteName = (def: TableDef): string => def.remote ?? def.name

async function push(): Promise<void> {
  for (const def of TABLES) {
    const rows = await def.table.where('dirty').equals(1).toArray()
    if (rows.length === 0) continue

    // Photos go to storage first, then their row is sent with the storage path.
    if (def.name === 'attachments') {
      for (const a of rows as Attachment[]) {
        if (a.blob && !a.path && !a.deletedAt) {
          const path = `${a.projectId}/${a.id}.${storageExt(a)}`
          await upload(path, a.blob, mimeForPath(path))
          a.path = path
          await remoteTx([db.attachments], () => db.attachments.update(a.id, { path }).then(() => undefined))
        }
      }
    }
    // Documents and progress photos: same idea, stored under the project folder.
    if (def.name === 'files') {
      for (const f of rows as ProjectFile[]) {
        if (f.blob && !f.path && !f.deletedAt) {
          const ext = (/\.([A-Za-z0-9]{1,8})$/.exec(f.name)?.[1] ?? 'bin').toLowerCase()
          const path = `${f.projectId}/files/${f.id}.${ext}`
          await upload(path, f.blob, f.mime)
          f.path = path
          await remoteTx([db.files], () => db.files.update(f.id, { path }).then(() => undefined))
        }
      }
    }
    let skipped = false
    for (let i = 0; i < rows.length && !skipped; i += 100) {
      const chunk = rows.slice(i, i + 100)
      const original = chunk.map((r) => def.toRemote(r, userId!))
      // `original` is what the rows really say; `payload` is what is sent (same, plus defaults for columns that cannot be NULL).
      let payload = fillDefaults(original, def.defaults)
      const dropped: string[] = []
      let sent = false
      // Which rows the server really wrote. A row it ignored (a newer edit was already there) is missing from this list.
      let written: { id: string }[] | null = null
      for (let attempt = 0; attempt < 12 && !sent; attempt++) {
        const { data, error } = await supabase!.from(remoteName(def)).upsert(payload, { onConflict: 'id' }).select('id')
        if (!error) {
          sent = true
          written = data as { id: string }[] | null
          break
        }
        const col = missingColumn(error)
        if (col) {
          // An older server schema: drop the newer column and send the rest.
          warn(col)
          dropped.push(col)
          payload = payload.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => k !== col)))
          continue
        }
        if (def.optional && isMissingTable(error)) {
          warn(remoteName(def))
          skipped = true // the rest of the tables still sync
          break
        }
        throw named(def.name, error)
      }
      if (skipped) break
      if (!sent) throw named(def.name, new Error('could not send'))
      // The server kept a newer version of some rows: bring that version down and keep ours in a notice, so the
      // edit is never lost without the person knowing.
      const stale = staleIds(chunk, written)
      if (stale.length) await reconcileRejected(def, chunk.filter((r) => stale.includes(r.id)))
      // Mark clean only if the row was not edited again while it was being sent.
      await remoteTx([def.table], async () => {
        for (const [idx, r] of chunk.entries()) {
          // A row whose newer column could not be stored stays waiting, so it is sent again after the schema update.
          const lost = dropped.some((c) => original[idx][c] !== null && original[idx][c] !== undefined)
          await def.table.where('id').equals(r.id).modify((x: any) => {
            if (x.updatedAt === r.updatedAt && !lost) x.dirty = 0
            if (def.name === 'projects' && !x.ownerId) x.ownerId = userId
          })
        }
      })
    }

    if (skipped) continue

    // A thumbnail is uploaded only after its project row exists on the server: storage access is
    // granted to project members, and the creator becomes a member when the project row is inserted.
    if (def.name === 'projects') {
      for (const p of rows as Project[]) {
        if (p.thumbnail && !p.thumbnailPath && !p.deletedAt) {
          const path = `${p.id}/thumbnail.jpg`
          await upload(path, p.thumbnail)
          await db.projects.update(p.id, { thumbnailPath: path }) // normal update: the next push sends the path
        }
      }
    }
  }
}

async function applyRows(def: TableDef, rows: any[]): Promise<void> {
  await remoteTx([def.table], async () => {
    for (const r of rows) {
      const remote = def.fromRemote(r)
      const local = await def.table.get(remote.id)
      // An unsent edit on this device (newer, or the same version still waiting for a column the server lacks) wins.
      if (local && local.dirty === 1 && local.updatedAt >= remote.updatedAt) continue
      if (local && local.dirty !== 1 && local.updatedAt === remote.updatedAt) continue
      let merged = remote
      if (def.name === 'attachments') merged = { ...remote, blob: local?.blob }
      if (def.name === 'files') merged = { ...remote, blob: local?.blob }
      if (def.name === 'projects') {
        merged = { ...remote, thumbnail: local?.thumbnailPath === remote.thumbnailPath ? local?.thumbnail : undefined }
      }
      await def.table.put(merged)
    }
  })
}

/**
 * Rows the server refused because a newer edit was already there. Fetch the newer version so this device matches the
 * server, and remember our own version (see conflicts.ts) so the person can put it back.
 * If the newer version cannot be fetched this throws, the rows stay waiting, and the next sync tries again.
 */
async function reconcileRejected(def: TableDef, rows: any[]): Promise<void> {
  const { data, error } = await supabase!.from(remoteName(def)).select('*').in('id', rows.map((r) => r.id))
  if (error) throw named(def.name, error)
  const theirs = (data ?? []) as any[]
  await applyRows(def, theirs)
  // A row the server has no version of at all is a new row it refused (a builder adding something only an investor may add).
  // It would otherwise stay on this phone as if it were saved, so take it off and say so.
  const there = new Set(theirs.map((r) => r.id as string))
  const gone = rows.filter((r) => !there.has(r.id)).map((r) => r.id as string)
  if (gone.length) {
    await remoteTx([def.table], () => def.table.bulkDelete(gone))
    refusedNow += gone.length
  }
  rows = rows.filter((r) => there.has(r.id))
  if (def.name === 'attachments') return // a receipt photo is never edited by hand, so there is nothing to put back
  await recordConflicts(def.name, rows, new Map(theirs.map((r) => [r.id as string, def.fromRemote(r)])))
}

async function pull(): Promise<void> {
  for (const def of TABLES) {
    const key = `sync.cursor.${def.name}`
    let cursor = ((await db.settings.get(key))?.value as string | undefined) ?? EPOCH
    for (;;) {
      const { data, error } = await supabase!
        .from(remoteName(def))
        .select('*')
        .gte('server_updated_at', cursor)
        .order('server_updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(PAGE)
      if (error) {
        if (def.optional && isMissingTable(error)) {
          warn(remoteName(def))
          break
        }
        throw named(def.name, error)
      }
      if (!data || data.length === 0) break
      await applyRows(def, data)
      const last = data[data.length - 1].server_updated_at as string
      const progressed = last > cursor
      cursor = last
      await db.settings.put({ key, value: cursor })
      if (data.length < PAGE || !progressed) break
    }
  }
}

/** Keeps this account's membership and individual project permissions available offline. */
export async function refreshMembership(): Promise<void> {
  if (!supabase || !userId) return
  const { data, error } = await supabase.from('project_members').select('project_id, role').eq('user_id', userId)
  if (error) return
  const rows = (data ?? []) as { project_id: string; role: string }[]
  const keep = new Set(rows.map((r) => `member.role.${r.project_id}`))
  const old = ((await db.settings.toCollection().primaryKeys()) as string[]).filter((k) => k.startsWith('member.role.') && !keep.has(k))
  await db.settings.bulkDelete(old)
  await db.settings.bulkPut(rows.map((r) => ({ key: `member.role.${r.project_id}`, value: r.role })))
  const projectIds = rows.map((r) => r.project_id)
  if (projectIds.length) {
    const [{ data: permissionRows }, { data: memberRows }] = await Promise.all([
      supabase.from('member_permissions').select('project_id, user_id, permission, enabled').eq('user_id', userId).in('project_id', projectIds),
      supabase.from('project_members').select('project_id, user_id, display_name, email').in('project_id', projectIds),
    ])
    if (permissionRows) {
      const byProject = new Map<string, Record<string, boolean>>()
      for (const row of permissionRows as { project_id: string; user_id: string; permission: string; enabled: boolean }[]) {
        const map = byProject.get(row.project_id) ?? {}
        map[row.permission] = row.enabled
        byProject.set(row.project_id, map)
      }
      await db.settings.bulkPut(projectIds.map((id) => ({ key: `member.permissions.${id}`, value: byProject.get(id) ?? {} })))
    }
    if (memberRows) {
      await db.settings.bulkPut(projectIds.map((id) => ({
        key: `project.members.${id}`,
        value: (memberRows as { project_id: string; user_id: string; display_name: string | null; email: string | null }[])
          .filter((member) => member.project_id === id)
          .map((member) => ({ userId: member.user_id, name: member.display_name ?? undefined, email: member.email ?? undefined })),
      })))
    }
  }
}

async function resetCursors(): Promise<void> {
  await db.settings.bulkDelete(TABLES.map((d) => `sync.cursor.${d.name}`))
}

/** Fetches photos and thumbnails that other people uploaded and this device does not have yet. */
async function backfillBlobs(): Promise<void> {
  const missing = (await db.attachments.toArray()).filter((a) => a.path && !a.blob && !a.deletedAt).slice(0, 20)
  for (const a of missing) await ensureAttachmentBlob(a)
  const photos = (await db.files.toArray()).filter((f) => f.kind === 'photo' && f.path && !f.blob && !f.deletedAt).slice(0, 20)
  for (const f of photos) await ensureFileBlob(f)
  const thumbs = (await db.projects.toArray()).filter((p) => p.thumbnailPath && !p.thumbnail && !p.deletedAt)
  for (const p of thumbs) {
    const { data } = await supabase!.storage.from(BUCKET).download(p.thumbnailPath!)
    if (data) await remoteTx([db.projects], () => db.projects.update(p.id, { thumbnail: data }).then(() => undefined))
  }
}

export async function ensureAttachmentBlob(a: Attachment): Promise<Blob | undefined> {
  if (a.blob) return a.blob
  if (!supabase || !a.path) return undefined
  const { data } = await supabase.storage.from(BUCKET).download(a.path)
  if (!data) return undefined
  // A video must keep its type or the player will not take it.
  const type = mimeForPath(a.path)
  const blob = data.type || !type ? data : new Blob([data], { type })
  await remoteTx([db.attachments], () => db.attachments.update(a.id, { blob }).then(() => undefined))
  return blob
}

/** Downloads a document or photo another person uploaded, the first time it is needed here. */
export async function ensureFileBlob(f: ProjectFile): Promise<Blob | undefined> {
  if (f.blob) return f.blob
  if (!supabase || !f.path) return undefined
  const { data } = await supabase.storage.from(BUCKET).download(f.path)
  if (!data) return undefined
  const blob = data.type ? data : new Blob([data], { type: f.mime })
  await remoteTx([db.files], () => db.files.update(f.id, { blob }).then(() => undefined))
  return blob
}

export async function syncNow(): Promise<void> {
  if (!supabase || !userId) return
  if (!navigator.onLine) {
    set({ state: 'offline', pending: await countPending() })
    return
  }
  if (running) {
    again = true
    return
  }
  running = true
  set({ state: 'syncing' })
  try {
    const { data: claimed, error } = await supabase.rpc('claim_invites')
    if (error) throw named('claim_invites', error)
    if (typeof claimed === 'number' && claimed > 0) await resetCursors() // new projects became visible
    refusedNow = 0
    await push()
    await pull()
    await refreshMembership()
    if (refusedNow > 0) refusedListeners.forEach((f) => f(refusedNow))
    set({ state: 'idle', pending: await countPending(), lastSync: Date.now(), error: undefined, warning: warnings.size ? [...warnings].join(', ') : undefined })
    void backfillBlobs().catch(() => undefined)
  } catch (e) {
    set({ state: 'error', error: message(e), pending: await countPending() })
  } finally {
    running = false
    if (again) {
      again = false
      void syncNow()
    }
  }
}

export type JoinResult = { ok: true; projectId: string } | { ok: false; reason: 'invalid' | 'offline' | 'notReady' | 'error'; message?: string }

/** Joins a project with the one-time code the investor sent, then brings the project down to this phone. */
export async function joinProject(code: string): Promise<JoinResult> {
  if (!supabase || !userId) return { ok: false, reason: 'error' }
  if (!navigator.onLine) return { ok: false, reason: 'offline' }
  const { data, error } = await supabase.rpc('join_project', { p_code: code })
  if (error) {
    if (/invalid_code/.test(error.message)) return { ok: false, reason: 'invalid' }
    // The server has not got join_project yet (the updated schema.sql was not run).
    if (codeOf(error) === 'PGRST202' || codeOf(error) === '42883') return { ok: false, reason: 'notReady' }
    return { ok: false, reason: 'error', message: error.message }
  }
  await resetCursors() // the project's rows are older than the cursors this phone already holds
  await refreshMembership()
  try {
    await pull()
  } catch {
    // the next sync brings the rest
  }
  return { ok: true, projectId: String(data) }
}

const schedule = (ms: number) => {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void syncNow(), ms)
}

export function startSync(uid: string): void {
  if (!supabase) return
  stopSync()
  userId = uid
  set({ state: 'idle' })

  stops.push(onLocalWrite(() => {
    void countPending().then((n) => set({ pending: n }))
    schedule(1500)
  }))

  const online = () => void syncNow()
  const offline = () => void countPending().then((n) => set({ state: 'offline', pending: n }))
  const visible = () => {
    if (document.visibilityState === 'visible') void syncNow()
  }
  window.addEventListener('online', online)
  window.addEventListener('offline', offline)
  document.addEventListener('visibilitychange', visible)
  stops.push(() => {
    window.removeEventListener('online', online)
    window.removeEventListener('offline', offline)
    document.removeEventListener('visibilitychange', visible)
  })

  // Live updates: another phone saved something, so pull soon.
  const channel = supabase.channel('epc-sync')
  for (const def of [...TABLES.map((d) => d.remote ?? d.name), 'project_members', 'role_permissions']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: def }, () => {
      clearTimeout(pullTimer)
      pullTimer = setTimeout(() => void syncNow(), 500)
    })
  }
  channel.subscribe()
  stops.push(() => void supabase!.removeChannel(channel))

  const interval = setInterval(() => void syncNow(), 60_000)
  stops.push(() => clearInterval(interval))

  void syncNow()
}

export function stopSync(): void {
  stops.forEach((s) => s())
  stops = []
  clearTimeout(pushTimer)
  clearTimeout(pullTimer)
  userId = null
  set({ state: supabase ? 'signedOut' : 'off' })
}
