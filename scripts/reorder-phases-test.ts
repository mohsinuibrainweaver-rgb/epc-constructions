// Checks saving a new phase order after a drag: the order follows the list, only moved phases are touched, deleted ones are left alone.
// Run: npx vite-node scripts/reorder-phases-test.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { db } from '../src/db/db'
import { addPhase, createProject, deletePhase, reorderPhases } from '../src/db/actions'

const project = await createProject({ name: 'P', location: '' }, 'blank')
const ids: string[] = []
for (const name of ['A', 'B', 'C', 'D', 'E']) ids.push(await addPhase(project, name))
const [a, b, c, d, e] = ids
const names = async () =>
  (await db.phases.where('projectId').equals(project).sortBy('order')).filter((p) => !p.deletedAt).map((p) => p.name).join('')

assert.equal(await names(), 'ABCDE')

// Drag E to the top.
await reorderPhases(project, [e, a, b, c, d])
assert.equal(await names(), 'EABCD', 'dragging E to the top puts it first and pushes the rest down')

// Drag B to the end.
await reorderPhases(project, [e, a, c, d, b])
assert.equal(await names(), 'EACDB')

// Only the phases whose place changed are touched (so sync sends little): drop C back where it is, nothing changes.
const before = await db.phases.toArray()
await new Promise((r) => setTimeout(r, 5))
await reorderPhases(project, [e, a, c, d, b])
const after = await db.phases.toArray()
assert.deepEqual(
  after.map((p) => p.updatedAt),
  before.map((p) => p.updatedAt),
  'saving the same order changes nothing',
)

// A deleted phase does not take a place, and the live ones still come out in the order that was saved.
await deletePhase(d)
await reorderPhases(project, [b, e, a, c])
assert.equal(await names(), 'BEAC')

// A phase from another project is ignored.
const other = await createProject({ name: 'Q', location: '' }, 'blank')
const stray = await addPhase(other, 'Z')
await reorderPhases(project, [stray, b, e, a, c])
assert.equal((await db.phases.get(stray))?.order, 0, "another project's phase keeps its own order")

console.log('reorder phases: all checks passed')
