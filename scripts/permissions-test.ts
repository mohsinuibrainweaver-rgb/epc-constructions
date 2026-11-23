// Checks what an investor and a builder may do. The same rules are enforced by the server (scripts/roles-test.ts).
// Run: npx vite-node scripts/permissions-test.ts
import assert from 'node:assert/strict'
import { can, canChangePayment, DEFAULT_PERMISSIONS, PERMISSIONS, type Action } from '../src/lib/permissions'

const ACTIONS: Action[] = ['approvePayments', 'editProject', 'deleteProject', 'editPhases', 'editContracts', 'editTransfers', 'editFee', 'managePeople']
for (const a of ACTIONS) {
  assert.equal(can('investor', a), true, `an investor can ${a}`)
  assert.equal(can('builder', a), false, `a builder cannot ${a}`)
}
assert.equal(can('builder', 'editContracts', { editContracts: true }), true, 'an owner can grant a builder permission')
assert.equal(can('investor', 'editProject', { editProject: false }), false, 'an owner can remove an investor permission')
assert.equal(can('builder', 'deleteProject', { deleteProject: false }, true), true, 'the project owner always bypasses role permissions')

// Every permission exposed on the Roles page uses the same defaults, overrides and owner bypass.
for (const { key } of PERMISSIONS) {
  assert.equal(can('investor', key), DEFAULT_PERMISSIONS.investor[key], `investor default: ${key}`)
  assert.equal(can('builder', key), DEFAULT_PERMISSIONS.builder[key], `builder default: ${key}`)
  assert.equal(can('investor', key, { [key]: false }), false, `investor permission can be removed: ${key}`)
  assert.equal(can('builder', key, { [key]: true }), true, `builder permission can be granted: ${key}`)
  assert.equal(can('builder', key, { [key]: false }, true), true, `owner bypass: ${key}`)
}

// Payments.
const paid = { status: 'paid' as const }
assert.equal(canChangePayment('investor', { ...paid, approval: 'approved' }), true)
assert.equal(canChangePayment('investor', { ...paid }), true)
assert.equal(canChangePayment('builder', { ...paid, approval: 'pending' }), true, 'his own entry that is waiting')
assert.equal(canChangePayment('builder', { ...paid, approval: 'rejected' }), true, 'one that was turned down (to correct it)')
assert.equal(canChangePayment('builder', { ...paid, approval: 'approved' }), false, 'an approved entry is closed')
assert.equal(canChangePayment('builder', { ...paid }), false, 'a paid entry the investor made himself')
assert.equal(canChangePayment('builder', { status: 'advance' }), false, 'an advance the investor made himself')
assert.equal(canChangePayment('builder', { status: 'advance', approval: 'pending' }), true)
assert.equal(canChangePayment('builder', { status: 'planned' }), true, 'a planned entry can be paid or moved')
assert.equal(canChangePayment('builder', { status: 'skipped' }), true)

console.log('permissions: all checks passed')
