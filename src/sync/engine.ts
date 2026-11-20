/* eslint-disable @typescript-eslint/no-explicit-any */
import { db, onLocalWrite, remoteTx } from '../db/db'
import type { Attachment, Project, ProjectFile } from '../db/types'
import { BUCKET, supabase } from './supabase'
import { TABLES, type TableDef } from './mapping'

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
          const path = `${a.projectId}/${a.id}.jpg`
          await upload(path, a.blob)
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
      let payload = original
      const dropped: string[] = []
      let sent = false
      for (let attempt = 0; attempt < 12 && !sent; attempt++) {
        const { error } = await supabase!.from(remoteName(def)).upsert(payload, { onConflict: 'id' })
        if (!error) {
          sent = true
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
  await remoteTx([db.attachments], () => db.attachments.update(a.id, { blob: data }).then(() => undefined))
  return data
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
    await push()
    await pull()
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
  for (const def of [...TABLES.map((d) => d.remote ?? d.name), 'project_members']) {
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
