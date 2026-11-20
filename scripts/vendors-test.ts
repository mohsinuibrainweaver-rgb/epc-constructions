// Checks the figures, search and sort of the Vendors screens.
// Run: npx vite-node scripts/vendors-test.ts
import assert from 'node:assert/strict'
import { sortVendors, vendorFigures, vendorMatches } from '../src/lib/vendors'
import type { Contract, Payment } from '../src/db/types'

let n = 0
const pay = (o: Partial<Payment>): Payment =>
  ({ id: `p${++n}`, projectId: 'p1', date: '2026-11-01', amount: 100, category: 'labour', purpose: 'x', status: 'paid', mode: 'cash', paidBy: 'investor', addedBy: 'investor', createdAt: n, updatedAt: n, ...o }) as Payment
const contract = (o: Partial<Contract>): Contract =>
  ({ id: `c${++n}`, projectId: 'p1', title: 'T', amount: 1000, date: '2026-01-01', status: 'active', variations: [], createdAt: n, updatedAt: n, ...o }) as Contract

// ---- figures
const c1 = contract({ id: 'c1', vendorId: 'v1', amount: 1000 })
const c2 = contract({ id: 'c2', vendorId: 'v1', amount: 500, status: 'completed' }) // closed: not owed
const c3 = contract({ id: 'c3', vendorId: 'v1', amount: 200 }) // overpaid below: adds nothing
const c4 = contract({ id: 'c4', vendorId: 'v2', amount: 900 }) // someone else's
const c5 = contract({ id: 'c5', vendorId: 'v1', amount: 300, deletedAt: 9 }) // removed
const payments = [
  pay({ vendorId: 'v1', amount: 400, date: '2026-10-05', contractId: 'c1' }),
  pay({ vendorId: 'v1', amount: 100, status: 'advance', date: '2026-09-01', contractId: 'c1' }),
  pay({ vendorId: 'v1', amount: 250, date: '2026-10-20', contractId: 'c3' }), // c3 agreed 200
  pay({ vendorId: 'v1', amount: 60, status: 'planned', date: '2026-12-01' }),
  pay({ vendorId: 'v1', amount: 40, paidBy: 'builder', approval: 'pending', date: '2026-11-15' }),
  pay({ vendorId: 'v1', amount: 7, status: 'skipped', date: '2026-11-18' }),
  pay({ vendorId: 'v1', amount: 9, deletedAt: 5, date: '2026-11-19' }),
  pay({ vendorId: 'v2', amount: 77, date: '2026-11-10' }),
]
const f = vendorFigures('v1', payments, [c1, c2, c3, c4, c5])
assert.equal(f.paid, 750, 'paid and advance count; planned, waiting, skipped and removed do not')
assert.equal(f.planned, 60)
assert.equal(f.lastPaid, '2026-10-20', 'the latest paid and approved day: not the planned, waiting, skipped or removed ones')
assert.equal(f.owed, 500, 'c1: 1000 - 500 = 500 left; c3 is overpaid (0); the completed, removed and other vendor contracts add nothing')

// A vendor with nothing.
assert.deepEqual(vendorFigures('v9', payments, [c1]), { paid: 0, planned: 0, lastPaid: undefined, owed: 0 })

// ---- search
const rashid = { name: 'Ustad Rashid', phone: '0300-5551234' }
assert.equal(vendorMatches(rashid, 'Foreman', ''), true, 'nothing typed matches everything')
assert.equal(vendorMatches(rashid, 'Foreman', '  '), true)
assert.equal(vendorMatches(rashid, 'Foreman', 'rash'), true, 'name')
assert.equal(vendorMatches(rashid, 'Foreman', 'FOREM'), true, 'role as shown on screen, any case')
assert.equal(vendorMatches(rashid, 'Foreman', '555 1234'), true, 'phone, ignoring spaces and dashes')
assert.equal(vendorMatches(rashid, 'Foreman', '0300555'), true)
assert.equal(vendorMatches(rashid, 'Foreman', 'zzz'), false)
assert.equal(vendorMatches({ name: 'A', phone: undefined }, 'Painter', '03'), false, 'no phone: a number matches nothing')
assert.equal(vendorMatches(rashid, 'Foreman', '---'), false, 'only punctuation is not a phone search')

// ---- sort
const row = (name: string, paid: number, lastPaid?: string) => ({ v: { name }, f: { paid, planned: 0, lastPaid, owed: 0 } })
const rows = [row('Charlie', 100, '2026-10-01'), row('Alpha', 500, '2026-09-01'), row('Bravo', 500, undefined), row('Delta', 0, '2026-11-01')]
const names = (s: Parameters<typeof sortVendors>[1]) => sortVendors(rows, s).map((r) => r.v.name)
assert.deepEqual(names('name'), ['Alpha', 'Bravo', 'Charlie', 'Delta'])
assert.deepEqual(names('paid'), ['Alpha', 'Bravo', 'Charlie', 'Delta'], 'most paid first; equal amounts by name')
assert.deepEqual(names('recent'), ['Delta', 'Charlie', 'Alpha', 'Bravo'], 'latest payment first; never paid last')
assert.deepEqual(rows.map((r) => r.v.name), ['Charlie', 'Alpha', 'Bravo', 'Delta'], 'the input is not changed')

console.log('vendors: all checks passed')
