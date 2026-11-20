import { itemKey, lineAmount, priceRows } from '../src/lib/materials'
import type { MaterialLine } from '../src/db/types'

let fails = 0
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (!ok) fails++
  console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`)
}
const L = (o: Partial<MaterialLine>): MaterialLine => ({
  id: Math.random().toString(), projectId: 'p', date: '2026-01-01', item: 'Cement', quantity: 1, unit: 'bag', rate: 1, amount: 1,
  createdAt: 1, updatedAt: 1, ...o,
})

eq('amount rounds', lineAmount(1000, 16.5), 16500)
eq('amount rounds half', lineAmount(3, 16.5), 50)
eq('key normalises', itemKey('  Cement   OPC '), 'cement opc')

const rows = priceRows([
  L({ date: '2026-01-01', quantity: 100, rate: 1300, amount: 130000 }),
  L({ item: 'cement ', date: '2026-02-01', quantity: 100, rate: 1400, amount: 140000 }),
  L({ date: '2026-03-01', quantity: 50, rate: 1200, amount: 60000, deletedAt: 5 }),
  L({ item: 'Cement', unit: 'ton', quantity: 1, rate: 5, amount: 5 }),
])
eq('groups by item and unit', rows.length, 2)
const bag = rows.find((r) => r.unit === 'bag')!
eq('count ignores deleted', bag.count, 2)
eq('last/min/max', [bag.last, bag.min, bag.max], [1400, 1300, 1400])
eq('weighted average', bag.average, 1350)
eq('change percent', Math.round(bag.change!), 8)
if (fails) { console.error(fails + ' failed'); process.exit(1) }
console.log('materials ok')
