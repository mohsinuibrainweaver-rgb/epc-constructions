import { useEffect, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field, GroupField } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { Textarea } from '@/components/ui/textarea'
import { saveTransfer } from '@/db/actions'
import { TRANSFER_KINDS, type Transfer, type TransferKind } from '@/db/types'
import type { Key } from '@/i18n/en'
import { groupDigits, parseAmount, todayISO } from '@/lib/format'

/** An advance, top-up, reimbursement, return or fee payment between the investor and the builder. */
export function TransferDialog({ open, transfer, onClose }: { open: boolean; transfer?: Transfer; onClose: () => void }) {
  const { t, project } = useApp()
  const toast = useToast()
  const [kind, setKind] = useState<TransferKind>('advance')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setKind(transfer?.kind ?? 'advance')
    setAmount(transfer ? groupDigits(String(transfer.amount)) : '')
    setDate(transfer?.date ?? todayISO())
    setNote(transfer?.note ?? '')
    setError('')
  }, [open, transfer])

  const submit = async () => {
    if (!project) return
    const amt = parseAmount(amount)
    if (amt <= 0) {
      setError(t('stl.errAmount'))
      return
    }
    await saveTransfer({ id: transfer?.id, projectId: project.id, date: date || todayISO(), amount: amt, kind, note: note.trim() || undefined })
    toast.show({ kind: 'success', message: t('stl.saved') })
    onClose()
  }

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
        <Field label={t('stl.amount')} error={error}>
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
