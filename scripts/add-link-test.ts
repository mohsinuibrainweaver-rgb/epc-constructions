// Checks where the "Add payment" buttons in the app's header lead from each page.
// Run: npx vite-node scripts/add-link-test.ts
import assert from 'node:assert/strict'
import { addPaymentPath } from '../src/lib/addLink'

assert.equal(addPaymentPath('/vendors/abc-123'), '/add?vendor=abc-123')
assert.equal(addPaymentPath('/phases/p1'), '/add?phase=p1')
assert.equal(addPaymentPath('/contracts/c9/'), '/add?contract=c9', 'a trailing slash is the same page')
assert.equal(addPaymentPath('/'), '/add')
assert.equal(addPaymentPath('/vendors'), '/add', 'the list is not one vendor')
assert.equal(addPaymentPath('/phases'), '/add')
assert.equal(addPaymentPath('/ledger'), '/add')
assert.equal(addPaymentPath('/vendors/abc/edit'), '/add', 'only the page of one vendor, phase or contract')
assert.equal(addPaymentPath('/add'), '/add')
assert.equal(addPaymentPath('/payments/xyz'), '/add', 'editing a payment is not adding one')
assert.equal(addPaymentPath('/vendors/a b'), '/add?vendor=a%20b', 'the id is written safely')

console.log('add link: all checks passed')
