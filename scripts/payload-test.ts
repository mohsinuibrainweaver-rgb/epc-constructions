// Checks that a batch of rows with different columns is made uniform where the server needs it.
// Run: npx vite-node scripts/payload-test.ts
import assert from 'node:assert/strict'
import { fillDefaults } from '../src/sync/payload'
import { TABLES } from '../src/sync/mapping'
import type { Phase, Project } from '../src/db/types'

const defaults = { done: false }

// One phase marked complete, one never touched: the second gets done=false, so the server does not see NULL.
const a = { id: 'a', done: true, fee_kind: null }
const b = { id: 'b' }
let out = fillDefaults([a, b], defaults)
assert.deepEqual(out[0], a, 'a row that has the column is unchanged')
assert.deepEqual(out[1], { id: 'b', done: false }, 'a row without it gets the default')
assert.deepEqual(b, { id: 'b' }, 'the input rows are not changed')

// Columns that are not NOT NULL (fee_kind) are not invented.
assert.equal('fee_kind' in out[1], false)

// Nothing to do: no row has the column, one row only, no defaults.
const plain = [{ id: 'x' }, { id: 'y' }]
assert.equal(fillDefaults(plain, defaults), plain, 'no row has done: same array back')
const one = [{ id: 'x', done: true }]
assert.equal(fillDefaults(one, defaults), one)
assert.equal(fillDefaults([a, b], undefined)[1].done, undefined)

// A false that was set is kept, not replaced.
out = fillDefaults([{ id: 'p', done: false }, { id: 'q' }], defaults)
assert.equal(out[0].done, false)
assert.equal(out[1].done, false)

// The real mappings: the tables that have NOT NULL newer columns declare them.
const phases = TABLES.find((t) => t.name === 'phases')!
const projects = TABLES.find((t) => t.name === 'projects')!
const ph = (o: Partial<Phase>): Phase => ({ id: 'ph', projectId: 'p', order: 0, createdAt: 1, updatedAt: 1, ...o }) as Phase
const rows = [ph({ id: '1', done: true }), ph({ id: '2' }), ph({ id: '3', feeKind: 'fixed', feeValue: 10 })].map((p) => phases.toRemote(p, 'u'))
const sent = fillDefaults(rows, phases.defaults)
assert.ok(sent.every((r) => r.done === true || r.done === false), 'every phase row in a mixed batch carries done')
assert.equal(sent[1].done, false)
assert.equal(sent[2].done, false)
// The row itself (what decides "still dirty on an old server") is not changed by the fill.
assert.equal('done' in rows[1], false)

const pr = (o: Partial<Project>): Project => ({ id: 'pr', name: 'n', location: '', currency: 'PKR', type: 'house', createdAt: 1, updatedAt: 1, ...o }) as Project
const prows = [pr({ id: '1', feeBasis: 'percent', feePercent: 8 }), pr({ id: '2' })].map((p) => projects.toRemote(p, 'u'))
assert.equal(fillDefaults(prows, projects.defaults)[1].fee_basis, 'tbd')

console.log('payload defaults: all checks passed')
