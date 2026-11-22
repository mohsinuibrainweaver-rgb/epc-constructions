// Checks column sorting of the tables. Run: npx vite-node scripts/sort-test.ts
import assert from 'node:assert/strict'
import { ariaSort, nextSort, sortRows, type SortState } from '../src/lib/sort'

type Key = 'name' | 'amount'
type Row = { id: number; name?: string; amount?: number }
const val = (r: Row, k: Key) => (k === 'name' ? r.name : r.amount)
const ids = (rows: Row[]) => rows.map((r) => r.id)

// 1. A click goes up, then down, then back to the original order; another column starts at up.
let s: SortState<Key> = null
s = nextSort(s, 'name')
assert.deepEqual(s, { key: 'name', dir: 'asc' })
s = nextSort(s, 'name')
assert.deepEqual(s, { key: 'name', dir: 'desc' })
s = nextSort(s, 'name')
assert.equal(s, null)
assert.deepEqual(nextSort({ key: 'name', dir: 'desc' }, 'amount'), { key: 'amount', dir: 'asc' })

// 2. Numbers sort as numbers, not as text (9 before 10, 100 last).
const nums: Row[] = [{ id: 1, amount: 100 }, { id: 2, amount: 9 }, { id: 3, amount: 10 }]
assert.deepEqual(ids(sortRows(nums, { key: 'amount', dir: 'asc' }, val)), [2, 3, 1])
assert.deepEqual(ids(sortRows(nums, { key: 'amount', dir: 'desc' }, val)), [1, 3, 2])

// 3. Text sorts without regard to case, with digits read as numbers.
const names: Row[] = [{ id: 1, name: 'plot 10' }, { id: 2, name: 'Plot 2' }, { id: 3, name: 'Apple' }, { id: 4, name: 'banana' }]
assert.deepEqual(ids(sortRows(names, { key: 'name', dir: 'asc' }, val)), [3, 4, 2, 1])
assert.deepEqual(ids(sortRows(names, { key: 'name', dir: 'desc' }, val)), [1, 2, 4, 3])

// 4. A row with nothing in the column is last, up or down.
const gaps: Row[] = [{ id: 1, name: 'b' }, { id: 2 }, { id: 3, name: 'a' }, { id: 4, name: '' }]
assert.deepEqual(ids(sortRows(gaps, { key: 'name', dir: 'asc' }, val)), [3, 1, 2, 4])
assert.deepEqual(ids(sortRows(gaps, { key: 'name', dir: 'desc' }, val)), [1, 3, 2, 4])
const zero: Row[] = [{ id: 1, amount: 0 }, { id: 2 }, { id: 3, amount: 5 }]
assert.deepEqual(ids(sortRows(zero, { key: 'amount', dir: 'asc' }, val)), [1, 3, 2], 'zero is a value, not a gap')

// 5. Ties keep their order, in both directions; the input is not changed; no sort gives the same array back.
const ties: Row[] = [{ id: 1, amount: 5 }, { id: 2, amount: 5 }, { id: 3, amount: 1 }, { id: 4, amount: 5 }]
assert.deepEqual(ids(sortRows(ties, { key: 'amount', dir: 'asc' }, val)), [3, 1, 2, 4])
assert.deepEqual(ids(sortRows(ties, { key: 'amount', dir: 'desc' }, val)), [1, 2, 4, 3])
assert.deepEqual(ids(ties), [1, 2, 3, 4])
assert.equal(sortRows(ties, null, val), ties)

// 6. aria-sort says which column is sorted and which way.
assert.equal(ariaSort({ key: 'name', dir: 'asc' }, 'name'), 'ascending')
assert.equal(ariaSort({ key: 'name', dir: 'desc' }, 'name'), 'descending')
assert.equal(ariaSort({ key: 'name', dir: 'asc' }, 'amount'), 'none')
assert.equal(ariaSort<Key>(null, 'name'), 'none')

console.log('sort: all checks passed')
