/* eslint-disable @typescript-eslint/no-explicit-any */
// Edits that were replaced by a newer edit from another phone.
//
// The server keeps the newer version of a row and ignores an older write without telling the sender. The sync engine
// now notices this (the row is missing from what the server says it wrote), brings the newer row down, and keeps this
// device's version here so the person can look at it and put it back.
import type { Table } from 'dexie'
import { db, now, remoteTx } from '../db/db'
import type { Conflict, ConflictTable } from '../db/types'
import type { Key } from '../i18n/en'

/** Ids that were sent but are missing from what the server says it wrote: the server kept a newer version of them. */
export function staleIds(sent: { id: string }[], written: { id: string }[] | null | undefined): string[] {
  // No answer from the server means no information: say nothing is stale, so behaviour stays what it always was.
  if (!written) return []
  const ok = new Set(written.map((r) => r.id))
  return sent.map((r) => r.id).filter((id) => !ok.has(id))
}

const isBlob = (v: unknown): boolean => typeof Blob !== 'undefined' && v instanceof Blob

/** A copy of the row that is safe to keep: no photos or files, no sync bookkeeping. */
export function snapshot(row: Record<string, any>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k, v]) => k !== 'dirty' && !isBlob(v)))
}

export type FieldKind = 'money' | 'date' | 'text' | 'status' | 'mode' | 'state' | 'other'

interface FieldSpec {
  key: string
  label: Key
  kind: FieldKind
}

/** The details a person recognises in a row. Rows that differ only elsewhere are reported as "other details". */
const FIELDS: FieldSpec[] = [
  { key: 'amount', label: 'conflict.f.amount', kind: 'money' },
  { key: 'budget', label: 'conflict.f.budget', kind: 'money' },
  { key: 'date', label: 'conflict.f.date', kind: 'date' },
  { key: 'purpose', label: 'conflict.f.what', kind: 'text' },
  { key: 'title', label: 'conflict.f.what', kind: 'text' },
  { key: 'name', label: 'conflict.f.what', kind: 'text' },
  { key: 'item', label: 'conflict.f.what', kind: 'text' },
  { key: 'status', label: 'conflict.f.status', kind: 'status' },
  { key: 'mode', label: 'conflict.f.mode', kind: 'mode' },
  { key: 'quantity', label: 'conflict.f.quantity', kind: 'text' },
  { key: 'rate', label: 'conflict.f.rate', kind: 'text' },
  { key: 'phone', label: 'conflict.f.phone', kind: 'text' },
  { key: 'note', label: 'conflict.f.note', kind: 'text' },
]

/** Bookkeeping that always differs between two versions and means nothing to a person. */
const META = new Set(['id', 'projectId', 'createdAt', 'updatedAt', 'dirty', 'deletedAt'])

export interface FieldDiff {
  key: string
  label: Key
  kind: FieldKind
  mine: unknown
  current: unknown
}

const blank = (v: unknown): boolean => v === undefined || v === null || v === ''
const same = (a: unknown, b: unknown): boolean => (blank(a) && blank(b)) || JSON.stringify(a) === JSON.stringify(b)

/** What differs between this device's version and the current one. Empty when the two are the same for the person. */
export function diffFields(mine: Record<string, any>, current: Record<string, any> | undefined): FieldDiff[] {
  const cur = current ?? {}
  const out: FieldDiff[] = []
  for (const f of FIELDS) {
    if (!same(mine[f.key], cur[f.key])) out.push({ ...f, mine: mine[f.key], current: cur[f.key] })
  }
  // A row that is gone from this device counts as deleted.
  const mineDeleted = Boolean(mine.deletedAt)
  const currentDeleted = current === undefined || Boolean(cur.deletedAt)
  if (mineDeleted !== currentDeleted) out.push({ key: 'deletedAt', label: 'conflict.f.state', kind: 'state', mine: mineDeleted, current: currentDeleted })
  if (out.length === 0) {
    const shown = new Set(FIELDS.map((f) => f.key))
    const keys = new Set([...Object.keys(mine), ...Object.keys(cur)])
    const elsewhere = [...keys].some((k) => !META.has(k) && !shown.has(k) && !isBlob(mine[k]) && !isBlob(cur[k]) && !same(mine[k], cur[k]))
    if (elsewhere) out.push({ key: 'other', label: 'conflict.f.other', kind: 'other', mine: undefined, current: undefined })
  }
  return out
}

const tableOf = (name: ConflictTable): Table<any, string> => (db as any)[name]

/**
 * Remembers this device's versions of rows the server refused. A row whose current version looks the same to the
 * person is not worth a notice and is skipped.
 */
export async function recordConflicts(table: ConflictTable, sent: Record<string, any>[], current: Map<string, Record<string, any>>): Promise<number> {
  let n = 0
  for (const row of sent) {
    const mine = snapshot(row)
    if (diffFields(mine, current.get(row.id)).length === 0) continue
    await db.conflicts.put({ id: `${table}:${row.id}`, table, rowId: row.id, projectId: table === 'projects' ? row.id : row.projectId, mine, at: now() })
    n++
  }
  return n
}

/** Puts this device's version back as a new edit, which then wins over the other one. */
export async function restoreMine(c: Conflict): Promise<void> {
  const table = tableOf(c.table)
  const cur = await table.get(c.rowId)
  const next: Record<string, any> = { ...c.mine, id: c.rowId, updatedAt: now(), dirty: 1 }
  // Photos and files are never copied into a notice, so keep the ones this device has now.
  if (cur?.blob) next.blob = cur.blob
  if (cur?.thumbnail) next.thumbnail = cur.thumbnail
  await db.transaction('rw', [table, db.conflicts], async () => {
    await table.put(next)
    await db.conflicts.delete(c.id)
  })
  // The server keeps the row with the later time. This device's clock may be behind the other phone's, so make sure the
  // put-back edit is later than the version we replaced, or the server would refuse it again.
  const floor = (cur?.updatedAt ?? 0) + 1
  if (floor > now()) await remoteTx([table], () => table.update(c.rowId, { updatedAt: floor }).then(() => undefined))
}

/** Dismisses the notice and leaves the current version as it is. */
export async function keepCurrent(id: string): Promise<void> {
  await db.conflicts.delete(id)
}

export interface ConflictItem {
  conflict: Conflict
  current: Record<string, any> | undefined
}

/** The open notices, newest first, each with the row as it is now. */
export async function loadConflicts(): Promise<ConflictItem[]> {
  const list = await db.conflicts.orderBy('at').reverse().toArray()
  return Promise.all(list.map(async (conflict) => ({ conflict, current: await tableOf(conflict.table).get(conflict.rowId) })))
}
