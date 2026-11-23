// Checks the plot cost (kept apart from the construction budget, and how it is sent to the server) and starting a new project
// with a copy of another project's phases.
// Run: npx vite-node scripts/plot-phases-test.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { costSplit } from '../src/lib/cost'
import { db } from '../src/db/db'
import { createProject, PHASE_KEYS, updateProject } from '../src/db/actions'
import { TABLES } from '../src/sync/mapping'
import type { Project } from '../src/db/types'

// 1. The split: nothing without a plot cost, then plot, construction paid, the two together, and the planned total when there is a budget.
assert.equal(costSplit(undefined, 500, 1000), undefined)
assert.equal(costSplit(null, 500, 1000), undefined)
assert.equal(costSplit(0, 500, 1000), undefined)
assert.deepEqual(costSplit(8_000_000, 639_090, 15_000_000), { plot: 8_000_000, constructionSpent: 639_090, totalSoFar: 8_639_090, budget: 15_000_000, totalPlanned: 23_000_000 })
assert.deepEqual(costSplit(8_000_000, 0, undefined), { plot: 8_000_000, constructionSpent: 0, totalSoFar: 8_000_000, budget: undefined, totalPlanned: undefined })
assert.equal(costSplit(8_000_000, 100, 0)!.totalPlanned, undefined, 'a zero budget is no budget')

// 2. Sending a project: the plot cost column is sent only once there is something to say (so a server without the column is not disturbed),
// and a cleared cost is sent as null so the other phone hears about it.
const def = TABLES.find((d) => d.name === 'projects')!
const base: Project = { id: 'p1', name: 'House', location: '', currency: 'PKR', type: 'house', createdAt: 1, updatedAt: 1 }
assert.ok(!('plot_cost' in def.toRemote(base, 'u')), 'never set: not sent')
assert.equal(def.toRemote({ ...base, plotCost: 8_000_000 }, 'u').plot_cost, 8_000_000)
assert.equal(def.toRemote({ ...base, plotCost: null }, 'u').plot_cost, null, 'cleared: sent as null')
assert.equal(def.toRemote({ ...base, plotCost: 8_000_000, budget: 15_000_000 }, 'u').budget, 15_000_000, 'the construction budget stays its own column')
const row = def.toRemote({ ...base, plotCost: 8_000_000 }, 'u')
assert.equal(def.fromRemote(row).plotCost, 8_000_000)
assert.equal(def.fromRemote({ ...row, plot_cost: '8000000' }).plotCost, 8_000_000, 'a bigint arrives as text')
assert.equal(def.fromRemote({ ...row, plot_cost: null }).plotCost, undefined)
const { plot_cost: _gone, ...older } = row
assert.equal(def.fromRemote(older).plotCost, undefined, 'a server without the column')

// 3. A project keeps both numbers; clearing the plot cost is saved as null.
const a = await createProject({ name: 'Block D', location: '', plotCost: 8_000_000, budget: 15_000_000 }, 'standard')
const projA = (await db.projects.get(a))!
assert.equal(projA.plotCost, 8_000_000)
assert.equal(projA.budget, 15_000_000)
await updateProject(a, { plotCost: null })
assert.equal((await db.projects.get(a))!.plotCost, null)
await updateProject(a, { plotCost: 9_000_000 })
assert.equal((await db.projects.get(a))!.plotCost, 9_000_000)

// 4. The standard list, a blank one, and a copy of another project's phases.
const phasesOf = async (id: string) => (await db.phases.where('projectId').equals(id).toArray()).filter((p) => !p.deletedAt).sort((x, y) => x.order - y.order)
const std = await phasesOf(a)
assert.equal(std.length, PHASE_KEYS.length)
assert.equal((await phasesOf(await createProject({ name: 'Blank', location: '' }, 'blank'))).length, 0)

// Make project A's list its own: rename one, give one a budget and mark it finished, remove one, add a custom one.
await db.phases.update(std[0].id, { name: 'Plot clearing', budget: 500_000, done: true, feeKind: 'fixed', feeValue: 10_000 })
await db.phases.update(std[3].id, { deletedAt: 5 })
await db.phases.add({ id: 'custom', projectId: a, name: 'Boundary wall', order: 99, createdAt: 1, updatedAt: 1 })
const expected = (await phasesOf(a)).map((p) => ({ key: p.key, name: p.name }))
assert.equal(expected.length, PHASE_KEYS.length - 1 + 1)

const b = await createProject({ name: 'Block E', location: '' }, { copyFrom: a })
const copied = await phasesOf(b)
assert.deepEqual(copied.map((p) => ({ key: p.key, name: p.name })), expected, 'same names, same order (the removed one is not copied)')
assert.deepEqual(copied.map((p) => p.order), copied.map((_, i) => i), 'orders are 0, 1, 2 ...')
assert.ok(copied.every((p) => p.projectId === b && p.budget === undefined && !p.done && p.feeKind === undefined && p.feeValue === undefined), 'budgets, fees and progress are not copied')
const sourceIds = new Set((await phasesOf(a)).map((p) => p.id))
assert.ok(copied.every((p) => !sourceIds.has(p.id)), 'every copied phase is a new row')
// The first phase of A was renamed and given a budget: the copy has the name only.
assert.equal(copied[0].name, 'Plot clearing')
assert.equal(copied[0].budget, undefined)
// A is untouched.
assert.equal((await phasesOf(a)).length, expected.length)
assert.equal((await db.phases.get(std[0].id))!.budget, 500_000)

// Copying from a project that has no phases (or does not exist) gives an empty list, not an error.
assert.equal((await phasesOf(await createProject({ name: 'Empty copy', location: '' }, { copyFrom: 'nope' }))).length, 0)

console.log('plot cost and copied phases: all checks passed')
