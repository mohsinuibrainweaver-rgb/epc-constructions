import { useEffect, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { ensurePlanPayments, savePlan } from '@/db/actions'
import { usePhases, useVendors } from '@/db/hooks'
import type { PaymentPlan } from '@/db/types'
import { groupDigits, parseAmount, todayISO, weekdayName } from '@/lib/format'
import { weekdayOrder } from '@/lib/region'

export function PlanDialog({ open, plan, onClose }: { open: boolean; plan?: PaymentPlan; onClose: () => void }) {
  const { t, lang, project, phaseName, userId, settings } = useApp()
  const toast = useToast()
  const vendors = useVendors(project?.id)
  const phases = usePhases(project?.id)
  const [purpose, setPurpose] = useState('')
  const [amount, setAmount] = useState('')
  const [weekday, setWeekday] = useState(4)
  const [vendorId, setVendorId] = useState('')
  const [phaseId, setPhaseId] = useState('')
  const [start, setStart] = useState(todayISO())
  const [errors, setErrors] = useState<{ purpose?: string; amount?: string }>({})

  useEffect(() => {
    if (!open) return
    setPurpose(plan?.purpose ?? '')
    setAmount(plan ? groupDigits(String(plan.amount)) : '')
    setWeekday(plan?.weekday ?? 4) // Thursday by default
    setVendorId(plan?.vendorId ?? '')
    setPhaseId(plan?.phaseId ?? '')
    setStart(plan?.startDate ?? todayISO())
    setErrors({})
  }, [open, plan])

  const submit = async () => {
    if (!project) return
    const amt = parseAmount(amount)
    const errs: typeof errors = {}
    if (!purpose.trim()) errs.purpose = t('plans.purposeRequired')
    if (amt <= 0) errs.amount = t('plans.amountRequired')
    setErrors(errs)
    if (Object.keys(errs).length) return
    await savePlan({
      id: plan?.id,
      projectId: project.id,
      purpose: purpose.trim(),
      amount: amt,
      weekday,
      vendorId: vendorId || undefined,
      phaseId: phaseId || undefined,
      category: plan?.category ?? 'labour',
      mode: plan?.mode ?? 'cash',
      paidBy: plan?.paidBy ?? userId ?? settings.role,
      startDate: start || todayISO(),
      active: plan?.active ?? true,
    })
    await ensurePlanPayments(project.id)
    toast.show({ kind: 'success', message: t('plans.saved') })
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={plan ? t('plans.edit') : t('plans.add')}
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
        <Field label={t('plans.purpose')} error={errors.purpose}>
          <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} autoFocus autoComplete="off" />
        </Field>
        <Field label={t('plans.amount')} error={errors.amount}>
          <Input className="tabular" inputMode="numeric" value={amount} onChange={(e) => setAmount(groupDigits(e.target.value))} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('plans.weekday')}>
            <Dropdown value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {weekdayOrder().map((d) => (
                <option key={d} value={d}>
                  {weekdayName(d, lang)}
                </option>
              ))}
            </Dropdown>
          </Field>
          <Field label={t('plans.start')}>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
        </div>
        <Field label={t('plans.vendor')}>
          <Dropdown value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">{t('pay.noVendor')}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Dropdown>
        </Field>
        <Field label={t('plans.phase')}>
          <Dropdown value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
            <option value="">{t('pay.noPhase')}</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {phaseName(p)}
              </option>
            ))}
          </Dropdown>
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}
