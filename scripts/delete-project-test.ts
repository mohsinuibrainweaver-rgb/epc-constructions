// Checks deleting a project: it is a soft delete, and the project that is open only changes when the open one is deleted.
// Run: npx vite-node scripts/delete-project-test.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { db } from '../src/db/db'
import { createProject, deleteProject } from '../src/db/actions'

const wait = () => new Promise((r) => setTimeout(r, 5))
const input = (name: string) => ({ name, location: '' })

// Three projects, each created a moment after the one before: C is the newest, then B, then A.
const a = await createProject(input('A'), 'blank')
await wait()
const b = await createProject(input('B'), 'blank')
await wait()
const c = await createProject(input('C'), 'blank')
const current = async () => (await db.settings.get('currentProjectId'))?.value
const live = async () => (await db.projects.toArray()).filter((p) => !p.deletedAt).map((p) => p.id).sort()

// B is open, and it is not the newest. Deleting A (not the open one) must leave B open; the old code opened C, the newest.
await db.settings.put({ key: 'currentProjectId', value: b })
await deleteProject(a)
assert.equal(await current(), b, 'the open project does not change when another one is deleted')
assert.deepEqual(await live(), [b, c].sort())
assert.ok((await db.projects.get(a))?.deletedAt, 'soft delete: the row stays, with a deletedAt, so the other phone learns of it')
assert.equal((await db.projects.get(a))?.dirty, 1, 'and it is waiting to be sent')

// Deleting the open one opens another (the most recently changed that is left).
await deleteProject(b)
assert.equal(await current(), c)

// Deleting the last one leaves nothing open.
await deleteProject(c)
assert.equal(await current(), undefined)
assert.deepEqual(await live(), [])

console.log('delete project: all checks passed')
