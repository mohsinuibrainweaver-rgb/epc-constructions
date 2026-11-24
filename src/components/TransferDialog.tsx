import { useEffect, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field, GroupField } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { Textarea } from '@/components/ui/textarea'
import { saveTransfer } from '@/db/actions'
import { TRANSFER_KINDS, type Transfer, type TransferKind } from '@/db/types'
import type { Key } from '@/i18n/en'
import { groupDigits, money, parseAmount, todayISO } from '@/lib/format'
import { memberLabel } from '@/lib/members'
import { usePayments, useTransfers } from '@/db/hooks'
import { memberCashPosition } from '@/lib/pettyCash'

/** Project cash, reimbursement, return or fee money between the project owner and a specific member. */
export function TransferDialog({ open, transfer, onClose }: { open: boolean; transfer?: Transfer; onClose: () => void }) {
  const { t, project, membersOf } = useApp()
  const toast = useToast()
  const payments = usePayments(project?.id)
  const transfers = useTransfers(project?.id)
  const [kind, setKind] = useState<TransferKind>('advance')
  const [memberId, setMemberId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ amount?: string; member?: string }>({})

  useEffect(() => {
    if (!open) return
    setKind(transfer?.kind ?? 'advance')
    setMemberId(transfer?.memberId ?? '')
    setAmount(transfer ? groupDigits(String(transfer.amount)) : '')
    setDate(transfer?.date ?? todayISO())
    setNote(transfer?.note ?? '')
    setErrors({})
  }, [open, transfer])

  const submit = async () => {
    if (!project) return
    const amt = parseAmount(amount)
    if (amt <= 0) {
      setErrors({ amount: t('stl.errAmount') })
      return
    }
    if (!memberId) {
      setErrors({ member: t('cash.errMember') })
      return
    }
    const position = memberCashPosition(memberId, payments, transfers)
    const editableReturn = transfer?.memberId === memberId && transfer.kind === 'return' ? transfer.amount : 0
    const editableReimbursement = transfer?.memberId === memberId && transfer.kind === 'reimbursement' ? transfer.amount : 0
    if (kind === 'return' && amt > position.availableCash + editableReturn) {
      setErrors({ amount: t('cash.errReturn', { amount: money(Math.max(0, position.availableCash + editableReturn)) }) })
      return
    }
    if (kind === 'reimbursement' && amt > position.reimbursementDue + editableReimbursement) {
      setErrors({ amount: t('cash.errReimburse', { amount: money(Math.max(0, position.reimbursementDue + editableReimbursement)) }) })
      return
    }
    await saveTransfer({ id: transfer?.id, projectId: project.id, memberId, date: date || todayISO(), amount: amt, kind, note: note.trim() || undefined })
    toast.show({ kind: 'success', message: t('stl.saved') })
    onClose()
  }

  const members = project ? membersOf(project.id).filter((member) => member.userId !== project.ownerId) : []

  return (
    <Dialog
      open={open}
      title={transfer ? t('stl.editTransfer') : t('stl.addTransfer')}
      description={t(kind === 'return' ? 'stl.builderToInvestor' : 'stl.investorToBuilder')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()}>{t('common.save')}</Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label={t('cash.member')} error={errors.member}>
          <Dropdown value={memberId} onChange={(event) => { setMemberId(event.target.value); setErrors({}) }} placeholder={t('cash.chooseMember')}>
            <option value="">{t('cash.chooseMember')}</option>
            {members.map((member) => <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>)}
          </Dropdown>
        </Field>
        <GroupField label={t('stl.kind')}>
          {(labelId) => (
            <PillRadioGroup aria-labelledby={labelId} value={kind} onValueChange={(v) => setKind(v as TransferKind)} className="grid">
              {TRANSFER_KINDS.map((k) => (
                <PillRadioItem key={k} value={k} className="justify-start">
                  {t(`xfer.${k}` as Key)}
                </PillRadioItem>
              ))}
            </PillRadioGroup>
          )}
        </GroupField>
        <Field label={t('stl.amount')} error={errors.amount}>
          <Input className="tabular" inputMode="numeric" value={amount} onChange={(e) => setAmount(groupDigits(e.target.value))} autoComplete="off" />
        </Field>
        <Field label={t('stl.date')}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('stl.note')}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}
