import { useEffect, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field, GroupField } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { Textarea } from '@/components/ui/textarea'
import { saveContract, saveVariation } from '@/db/actions'
import { useVendors, usePhases } from '@/db/hooks'
import { CONTRACT_STATUSES, type Contract, type ContractStatus, type ContractVariation } from '@/db/types'
import type { Key } from '@/i18n/en'
import { groupDigits, parseAmount, todayISO } from '@/lib/format'

/** Adds or edits a contract: what was agreed, with whom, for which phase, and for how much. */
export function ContractDialog({ open, contract, onClose, onSaved }: { open: boolean; contract?: Contract; onClose: () => void; onSaved?: (id: string) => void }) {
  const { t, project, phaseName } = useApp()
  const toast = useToast()
  const vendors = useVendors(project?.id)
  const phases = usePhases(project?.id)
  const [title, setTitle] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [phaseId, setPhaseId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [status, setStatus] = useState<ContractStatus>('active')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ title?: string; amount?: string }>({})

  useEffect(() => {
    if (!open) return
    setTitle(contract?.title ?? '')
    setVendorId(contract?.vendorId ?? '')
    setPhaseId(contract?.phaseId ?? '')
    setAmount(contract ? groupDigits(String(contract.amount)) : '')
    setDate(contract?.date ?? todayISO())
    setStatus(contract?.status ?? 'active')
    setNote(contract?.note ?? '')
    setErrors({})
  }, [open, contract])

  const submit = async () => {
    if (!project) return
    const next: typeof errors = {}
    if (!title.trim()) next.title = t('contract.errTitle')
    if (parseAmount(amount) <= 0) next.amount = t('contract.errAmount')
    setErrors(next)
    if (Object.keys(next).length) {
      requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus())
      return
    }
    const id = await saveContract({
      id: contract?.id,
      projectId: project.id,
      title,
      vendorId: vendorId || undefined,
      phaseId: phaseId || undefined,
      amount: parseAmount(amount),
      date: date || todayISO(),
      status,
      note,
    })
    toast.show({ kind: 'success', message: t('contract.saved') })
    onSaved?.(id)
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={contract ? t('contract.edit') : t('contract.add')}
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
        <Field label={t('contract.titleField')} hint={t('contract.titleHint')} error={errors.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
        </Field>
        <Field label={t('contract.amount')} hint={t('contract.amountHint')} error={errors.amount}>
          <Input className="tabular" inputMode="numeric" value={amount} onChange={(e) => setAmount(groupDigits(e.target.value))} autoComplete="off" />
        </Field>
        <Field label={t('contract.vendor')}>
          <Dropdown value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">{t('contract.noVendor')}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Dropdown>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('contract.phase')}>
            <Dropdown value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
              <option value="">{t('contract.noPhase')}</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {phaseName(p)}
                </option>
              ))}
            </Dropdown>
          </Field>
          <Field label={t('contract.date')}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {contract && (
          <GroupField label={t('contract.status')}>
            {(labelId) => (
              <PillRadioGroup aria-labelledby={labelId} value={status} onValueChange={(v) => setStatus(v as ContractStatus)}>
                {CONTRACT_STATUSES.map((s) => (
                  <PillRadioItem key={s} value={s}>
                    {t(`contract.status.${s}` as Key)}
                  </PillRadioItem>
                ))}
              </PillRadioGroup>
            )}
          </GroupField>
        )}
        <Field label={t('contract.note')}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}

/** Adds or edits a variation: extra work that raises the contract, or a deduction that lowers it. */
export function VariationDialog({ open, contractId, variation, onClose }: { open: boolean; contractId: string; variation?: ContractVariation; onClose: () => void }) {
  const { t } = useApp()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [sign, setSign] = useState<'add' | 'deduct'>('add')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [errors, setErrors] = useState<{ title?: string; amount?: string }>({})

  useEffect(() => {
    if (!open) return
    setTitle(variation?.title ?? '')
    setSign(variation && variation.amount < 0 ? 'deduct' : 'add')
    setAmount(variation ? groupDigits(String(Math.abs(variation.amount))) : '')
    setDate(variation?.date ?? todayISO())
    setErrors({})
  }, [open, variation])

  const submit = async () => {
    const next: typeof errors = {}
    if (!title.trim()) next.title = t('contract.errTitle')
    if (parseAmount(amount) <= 0) next.amount = t('contract.errAmount')
    setErrors(next)
    if (Object.keys(next).length) {
      requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus())
      return
    }
    await saveVariation(contractId, { id: variation?.id, title: title.trim(), amount: (sign === 'deduct' ? -1 : 1) * parseAmount(amount), date: date || todayISO() })
    toast.show({ kind: 'success', message: t('contract.variationSaved') })
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={variation ? t('contract.editVariation') : t('contract.addVariation')}
      description={t('contract.variationHint')}
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
        <Field label={t('contract.titleField')} error={errors.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
        </Field>
        <GroupField label={t('contract.variationKind')}>
          {(labelId) => (
            <PillRadioGroup aria-labelledby={labelId} value={sign} onValueChange={(v) => setSign(v as 'add' | 'deduct')}>
              <PillRadioItem value="add">{t('contract.extra')}</PillRadioItem>
              <PillRadioItem value="deduct">{t('contract.deduction')}</PillRadioItem>
            </PillRadioGroup>
          )}
        </GroupField>
        <Field label={t('contract.variationAmount')} error={errors.amount}>
          <Input className="tabular" inputMode="numeric" value={amount} onChange={(e) => setAmount(groupDigits(e.target.value))} autoComplete="off" />
        </Field>
        <Field label={t('contract.date')}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}
