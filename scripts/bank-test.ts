// Checks the bank details of a transfer: the list line, filling from the vendor, and how they travel to the server.
// Run: npx vite-node scripts/bank-test.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { bankFromVendor, bankLine, lastDigits } from '../src/lib/bank'
import { TABLES } from '../src/sync/mapping'

// lastDigits ignores spaces and dashes.
assert.equal(lastDigits('PK36 HABB 0000 0011 2345 6702'), '6702')
assert.equal(lastDigits('0123-456-789'), '6789')
assert.equal(lastDigits(''), '')
assert.equal(lastDigits(undefined), '')
assert.equal(lastDigits(null), '')

// The line for lists: bank name and the end of the account, never the whole number.
const iso = (s: string) => s.replace(/[⁦⁩]/g, '')
assert.equal(iso(bankLine({ bankName: 'HBL', bankAccount: 'PK36HABB0000001123456702' })), 'HBL · …6702')
assert.equal(bankLine({ bankName: 'HBL' }), 'HBL')
assert.equal(iso(bankLine({ bankAccount: '0123456789' })), '…6789')
assert.equal(bankLine({}), '')
assert.equal(bankLine({ bankName: null, bankAccount: null }), '', 'a cleared value shows nothing')
assert.equal(bankLine({ bankName: '  ', bankAccount: '' }), '')
assert.ok(!bankLine({ bankName: 'HBL', bankAccount: 'PK36HABB0000001123456702' }).includes('PK36'), 'the full number is not in the list line')

// Filling from the vendor: only what is empty; what was typed stays.
const vendor = { bankName: 'Meezan Bank', bankAccount: '0123456789' }
assert.deepEqual(bankFromVendor(vendor, { name: '', account: '' }), { name: 'Meezan Bank', account: '0123456789' })
assert.deepEqual(bankFromVendor(vendor, { name: 'HBL', account: '' }), { name: 'HBL', account: '0123456789' })
assert.deepEqual(bankFromVendor(vendor, { name: '', account: '999' }), { name: 'Meezan Bank', account: '999' })
assert.deepEqual(bankFromVendor(vendor, { name: 'HBL', account: '999' }), { name: 'HBL', account: '999' })
assert.deepEqual(bankFromVendor({ bankName: null }, { name: '', account: '' }), { name: '', account: '' })
assert.deepEqual(bankFromVendor(undefined, { name: 'HBL', account: '' }), { name: 'HBL', account: '' })

// Sync: the columns are sent only once something was set (an older server keeps working), null when removed.
const payments = TABLES.find((t) => t.name === 'payments')!
const vendors = TABLES.find((t) => t.name === 'vendors')!
const pay = (extra: Record<string, unknown>) =>
  ({ id: 'p', projectId: 'p1', date: '2026-11-01', amount: 1, category: 'labour', purpose: 'x', status: 'paid', mode: 'bank', paidBy: 'investor', addedBy: '', createdAt: 1, updatedAt: 1, ...extra }) as never
const ven = (extra: Record<string, unknown>) => ({ id: 'v', projectId: 'p1', name: 'Ihtisham', role: 'carpenter', createdAt: 1, updatedAt: 1, ...extra }) as never
const row = (l: never) => payments.toRemote(l, 'u') as Record<string, unknown>
const vrow = (l: never) => vendors.toRemote(l, 'u') as Record<string, unknown>

assert.equal('bank_name' in row(pay({})), false, 'no bank details: the columns are not sent')
assert.equal('bank_ref' in row(pay({})), false)
const sent = row(pay({ bankName: 'HBL', bankAccount: 'PK36', bankRef: 'TXN-1' }))
assert.deepEqual([sent.bank_name, sent.bank_account, sent.bank_ref], ['HBL', 'PK36', 'TXN-1'])
const part = row(pay({ bankName: 'HBL' }))
assert.deepEqual([part.bank_name, part.bank_account, part.bank_ref], ['HBL', null, null], 'only the bank name: the rest are sent empty')
const cleared = row(pay({ bankName: null, bankAccount: null, bankRef: null }))
assert.deepEqual([cleared.bank_name, cleared.bank_account, cleared.bank_ref], [null, null, null], 'removed details reach the server as null')

// Back from the server: null and missing both mean none.
const back = payments.fromRemote({ ...sent, created_at: 1, updated_at: 1 } as never) as Record<string, unknown>
assert.deepEqual([back.bankName, back.bankAccount, back.bankRef], ['HBL', 'PK36', 'TXN-1'])
const none = payments.fromRemote({ ...cleared, created_at: 1, updated_at: 1 } as never) as Record<string, unknown>
assert.deepEqual([none.bankName, none.bankAccount, none.bankRef], [undefined, undefined, undefined])
assert.equal((payments.fromRemote({ ...row(pay({})), created_at: 1, updated_at: 1 } as never) as Record<string, unknown>).bankName, undefined, 'an older server without the columns')

// The vendor's bank name travels the same way.
assert.equal('bank_name' in vrow(ven({})), false)
assert.equal(vrow(ven({ bankName: 'Meezan Bank' })).bank_name, 'Meezan Bank')
assert.equal(vrow(ven({ bankName: null })).bank_name, null)
assert.equal((vendors.fromRemote({ ...vrow(ven({ bankName: 'Meezan Bank' })), created_at: 1, updated_at: 1 } as never) as Record<string, unknown>).bankName, 'Meezan Bank')

console.log('bank details: all checks passed')
