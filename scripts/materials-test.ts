import { foldMaterials, itemKey, knownItems, parseDecimal, priceCoverage, priceRows, solveEntry, type Entry } from '../src/lib/materials'
import type { MaterialLine, Payment } from '../src/db/types'

let fails = 0
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (!ok) fails++
  console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`)
}
let n = 0
// A material purchase is a payment with a quantity and a unit; the rate is amount / quantity.
const P = (o: Partial<Payment>): Payment => ({
  id: `p${++n}`, projectId: 'p', date: '2026-01-01', amount: 1, category: 'material', purpose: 'Cement', status: 'paid', mode: 'cash', paidBy: 'investor',
  addedBy: 'x', createdAt: n, updatedAt: n, ...o,
})

eq('key normalises', itemKey('  Cement   OPC '), 'cement opc')

const pays = [
  P({ date: '2026-01-01', quantity: 100, unit: 'bag', amount: 130000 }),
  P({ purpose: 'cement ', date: '2026-02-01', quantity: 100, unit: 'bag', amount: 140000 }),
  P({ date: '2026-03-01', quantity: 50, unit: 'bag', amount: 60000, deletedAt: 5 }), // in the bin: not counted
  P({ date: '2026-03-02', quantity: 50, unit: 'bag', amount: 60000, status: 'planned' }), // not paid yet: not counted
  P({ date: '2026-03-03', quantity: 50, unit: 'bag', amount: 60000, approval: 'pending' }), // waits for the investor: not counted
  P({ date: '2026-03-04', quantity: 50, unit: 'bag', amount: 60000, approval: 'rejected' }),
  P({ purpose: 'Cement', quantity: 1, unit: 'ton', amount: 5 }),
  P({ purpose: 'Labour for week', category: 'labour', amount: 90000 }), // no quantity: not a purchase
]
const rows = priceRows(pays)
eq('groups by item and unit', rows.length, 2)
const bag = rows.find((r) => r.unit === 'bag')!
eq('count ignores bin, planned, pending and rejected', bag.count, 2)
eq('last/min/max', [bag.last, bag.min, bag.max], [1400, 1300, 1400])
eq('weighted average', bag.average, 1350)
eq('change percent', Math.round(bag.change!), 8)
eq('the rate is what was paid, not a typed rate', priceRows([P({ quantity: 28000, unit: 'piece', amount: 406000 })])[0].last, 14.5)
eq('coverage: material payments that count, and those with a quantity', priceCoverage([...pays, P({ amount: 10 })]), { withQuantity: 3, total: 4 })
eq('known items: newest of each, any unit', knownItems(pays).map((p) => p.purpose), ['cement '])

// ---- the three boxes: amount = quantity x rate; what was paid wins
const E = (o: Partial<Entry> = {}): Entry => ({ amount: '', quantity: '', rate: '', byRate: false, ...o })
let e = solveEntry(E(), 'amount', '406000')
eq('amount alone: nothing to work out yet', [e.amount, e.quantity, e.rate], ['406,000', '', ''])
e = solveEntry(e, 'quantity', '28000')
eq('amount then quantity: the rate is worked out', e.rate, '14.5')
e = solveEntry(e, 'amount', '400000')
eq('a new amount (a discount) changes the rate, not the quantity', [e.quantity, e.rate], ['28000', '14.29'])
e = solveEntry(E(), 'quantity', '100')
e = solveEntry(e, 'rate', '1350')
eq('quantity then rate: the amount is worked out', [e.amount, e.byRate], ['135,000', true])
e = solveEntry(e, 'quantity', '120')
eq('once the rate was typed, a new quantity keeps the rate and changes the amount', [e.amount, e.rate], ['162,000', '1350'])
e = solveEntry(e, 'amount', '160000')
eq('typing the amount again hands the lead back to the amount', [e.byRate, e.rate], [false, '1333.33'])
e = solveEntry(E({ rate: '14.5' }), 'quantity', '1000')
eq('rate first, then quantity: the amount appears', e.amount, '14,500')
eq('a rate with decimals keeps them', solveEntry(E({ quantity: '3' }), 'rate', '16.5').amount, '50')
eq('unreadable text is zero', parseDecimal('abc'), 0)

// ---- the old Materials list is folded onto its payments, once
const L = (o: Partial<MaterialLine>): MaterialLine => ({ id: `l${++n}`, projectId: 'p', date: '2026-01-01', item: 'Cement', quantity: 10, unit: 'bag', rate: 100, amount: 1000, createdAt: 1, updatedAt: 1, ...o })
const A = P({ id: 'a' }), B = P({ id: 'b' }), C = P({ id: 'c', quantity: 5, unit: 'bag' }), D = P({ id: 'd', deletedAt: 9 })
const fold = foldMaterials(
  [
    L({ paymentId: 'a', quantity: 7, unit: 'trip', updatedAt: 1 }),
    L({ paymentId: 'a', quantity: 8, unit: 'trip', updatedAt: 3 }), // two lines for one payment: the newest wins
    L({ paymentId: 'b', deletedAt: 4 }), // a deleted line
    L({ paymentId: 'c' }), // the payment already has a quantity
    L({ paymentId: 'd' }), // the payment is in the bin
    L({}), // never had a payment
    L({ paymentId: 'zzz' }), // the payment is gone
    L({ paymentId: 'b', quantity: 0 }), // nothing was bought
  ],
  [A, B, C, D],
)
eq('only the newest line of a payment that has none is folded', [...fold], [['a', { quantity: 8, unit: 'trip', dirty: false }]])
eq('a line still waiting to be sent keeps its payment waiting too', foldMaterials([L({ paymentId: 'b', dirty: 1 })], [B]).get('b')?.dirty, true)

if (fails) { console.error(fails + ' failed'); process.exit(1) }
console.log('materials ok')
