import type { Payment, Transfer } from '../src/db/types'
import { memberCashPosition, totalProjectCashHeld } from '../src/lib/pettyCash'
import { isSpent } from '../src/lib/stats'
import { TABLES } from '../src/sync/mapping'

const member = 'member-a'
const other = 'member-b'
let stamp = 1

const payment = (amount: number, projectCashAmount: number | undefined, approval: Payment['approval'] = 'approved', paidBy = member): Payment => ({
  id: `p-${stamp}`,
  projectId: 'project',
  date: '2026-11-24',
  amount,
  category: 'material',
  purpose: 'Verification payment',
  status: 'paid',
  mode: 'cash',
  paidBy,
  projectCashAmount,
  addedBy: paidBy,
  approval,
  createdAt: stamp,
  updatedAt: stamp++,
})

const transfer = (amount: number, kind: Transfer['kind'], memberId: string | null = member): Transfer => ({
  id: `t-${stamp}`,
  projectId: 'project',
  memberId,
  date: '2026-11-24',
  amount,
  kind,
  createdAt: stamp,
  updatedAt: stamp++,
})

const equal = (actual: number, expected: number, label: string) => {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`)
}

const transfers = [
  transfer(200_000, 'advance'),
  transfer(30_000, 'return'),
  transfer(40_000, 'reimbursement'),
  transfer(999_000, 'advance', other),
  transfer(888_000, 'advance', null), // legacy/unassigned: must never be guessed onto this member
]
const payments = [
  payment(100_000, 100_000), // wholly from project cash
  payment(30_000, 0), // wholly from the member's own pocket
  payment(50_000, 20_000), // split: 20k project cash, 30k own money
  payment(25_000, 25_000, 'pending'), // reserves cash but does not confirm spending
  payment(40_000, 40_000, 'rejected'), // rejected: no effect
  payment(10_000, undefined), // legacy member payment remains own-pocket
  payment(700_000, 700_000, 'approved', other), // another member: isolated
]

const position = memberCashPosition(member, payments, transfers)
equal(position.given, 200_000, 'cash given')
equal(position.spentFromProjectCash, 120_000, 'confirmed project cash used')
equal(position.returned, 30_000, 'cash returned')
equal(position.cashHeld, 50_000, 'cash still held')
equal(position.pendingCashUse, 25_000, 'pending project cash')
equal(position.availableCash, 25_000, 'available after pending reservation')
equal(position.spentFromOwnFunds, 70_000, 'member own-pocket spending')
equal(position.reimbursed, 40_000, 'reimbursed amount')
equal(position.reimbursementDue, 30_000, 'reimbursement still due')

const reportedExpense = payments.filter(isSpent).reduce((total, row) => total + row.amount, 0)
equal(reportedExpense, 890_000, 'reports count approved payments only and never cash transfers')

const otherPosition = memberCashPosition(other, payments, transfers)
equal(otherPosition.given, 999_000, 'other member cash is separate')
equal(otherPosition.cashHeld, 299_000, 'other member cash balance')
equal(totalProjectCashHeld('owner', payments, transfers), 1_227_000, 'forecast uses explicit member cash plus untouched legacy net cash')

const paymentMapping = TABLES.find((definition) => definition.name === 'payments')!
const transferMapping = TABLES.find((definition) => definition.name === 'transfers')!
const paymentPayload = paymentMapping.toRemote(payments[2], 'member-a')
const transferPayload = transferMapping.toRemote(transfers[0], 'owner')
equal(Number(paymentPayload.project_cash_amount), 20_000, 'payment sync carries the project-cash part')
if (transferPayload.member_id !== member) throw new Error('transfer sync did not carry the member id')

console.log('Petty-cash verification passed: full cash, own funds, split, pending, rejected, return, reimbursement, legacy and member isolation.')
