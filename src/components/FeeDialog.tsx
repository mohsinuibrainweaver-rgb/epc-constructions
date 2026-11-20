import { useEffect, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field, GroupField } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { saveFee } from '@/db/actions'
import { usePhases } from '@/db/hooks'
import type { FeeBasis, PhaseFeeKind } from '@/db/types'
import type { Key } from '@/i18n/en'
import { groupDigits, parseAmount, todayISO } from '@/lib/format'

const BASES: FeeBasis[] = ['tbd', 'fixed', 'percent', 'perPhase', 'retainer']
type PhaseRow = { kind: '' | PhaseFeeKind; value: string }

/** Sets how the builder's fee is worked out. It can stay "decided at the end". */
export function FeeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, project, phaseName } = useApp()
  const toast = useToast()
  const phases = usePhases(project?.id)
  const [basis, setBasis] = useState<FeeBasis>('tbd')
  const [amount, setAmount] = useState('')
  const [percent, setPercent] = useState('')
  const [rAmount, setRAmount] = useState('')
  const [rStart, setRStart] = useState('')
  const [rEnd, setREnd] = useState('')
  const [rows, setRows] = useState<Record<string, PhaseRow>>({})
  const [errors, setErrors] = useState<{ amount?: string; percent?: string; rAmount?: string; rStart?: string; phases?: string }>({})

  useEffect(() => {
    if (!open || !project) return
    setBasis(project.feeBasis ?? 'tbd')
    setAmount(project.feeAmount ? groupDigits(String(project.feeAmount)) : '')
    setPercent(project.feePercent ? String(project.feePercent) : '')
    setRAmount(project.retainerAmount ? groupDigits(String(project.retainerAmount)) : '')
    setRStart(project.retainerStart ?? todayISO())
    setREnd(project.retainerEnd ?? '')
    setRows(
      Object.fromEntries(
        phases.map((p) => [p.id, { kind: p.feeKind ?? '', value: p.feeValue ? (p.feeKind === 'fixed' ? groupDigits(String(p.feeValue)) : String(p.feeValue)) : '' } as PhaseRow]),
      ),
    )
    setErrors({})
  }, [open, project, phases])

  const setRow = (id: string, patch: Partial<PhaseRow>) => setRows((r) => ({ ...r, [id]: { ...(r[id] ?? { kind: '', value: '' }), ...patch } }))

  const submit = async () => {
    if (!project) return
    const next: typeof errors = {}
    if (basis === 'fixed' && parseAmount(amount) <= 0) next.amount = t('stl.errFeeAmount')
    if (basis === 'percent' && !(Number(percent) > 0 && Number(percent) <= 100)) next.percent = t('stl.errFeePercent')
    if (basis === 'retainer') {
      if (parseAmount(rAmount) <= 0) next.rAmount = t('stl.errFeeAmount')
      if (!rStart) next.rStart = t('stl.errRetainerStart')
    }
    const phaseFees = phases.map((p) => {
      const r = rows[p.id] ?? { kind: '', value: '' }
      const value = r.kind === 'fixed' ? parseAmount(r.value) : Number(r.value)
      return { id: p.id, kind: r.kind || undefined, value: r.kind ? value : undefined }
    })
    if (basis === 'perPhase' && phaseFees.some((f) => f.kind && !(f.value && f.value > 0 && (f.kind !== 'percent' || f.value <= 100)))) next.phases = t('stl.errPhaseFee')
    setErrors(next)
    if (Object.keys(next).length) {
      requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"], [data-phase-error]') as HTMLElement | null)?.focus())
      return
    }
    await saveFee(project.id, {
      basis,
      amount: parseAmount(amount) || undefined,
      percent: percent ? Number(percent) : undefined,
      retainer: { amount: parseAmount(rAmount) || undefined, start: rStart || undefined, end: rEnd || undefined },
      phases: phaseFees,
    })
    toast.show({ kind: 'success', message: t('stl.feeSaved') })
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={t('stl.feeEdit')}
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
        <GroupField label={t('stl.feeBasis')}>
          {(labelId) => (
            <PillRadioGroup aria-labelledby={labelId} value={basis} onValueChange={(v) => setBasis(v as FeeBasis)} className="grid">
              {BASES.map((b) => (
                <PillRadioItem key={b} value={b} className="justify-start">
                  {t(`stl.feeOpt.${b}` as Key)}
                </PillRadioItem>
              ))}
            </PillRadioGroup>
          )}
        </GroupField>
        <p className="text-sm text-muted-foreground">{t(`stl.feeHelp.${basis}` as Key)}</p>

        {basis === 'fixed' && (
          <Field label={t('stl.feeAmount')} error={errors.amount}>
            <Input className="tabular" inputMode="numeric" value={amount} onChange={(e) => setAmount(groupDigits(e.target.value))} />
          </Field>
        )}
        {basis === 'percent' && (
          <Field label={t('stl.feePercentValue')} error={errors.percent}>
            <Input inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^0-9.]/g, ''))} />
          </Field>
        )}

        {basis === 'retainer' && (
          <>
            <Field label={t('stl.retainerAmount')} error={errors.rAmount}>
              <Input className="tabular" inputMode="numeric" value={rAmount} onChange={(e) => setRAmount(groupDigits(e.target.value))} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('stl.retainerStart')} error={errors.rStart}>
                <Input type="date" value={rStart} onChange={(e) => setRStart(e.target.value)} />
              </Field>
              <Field label={t('stl.retainerEnd')} hint={t('stl.retainerEndHint')}>
                <Input type="date" value={rEnd} min={rStart || undefined} onChange={(e) => setREnd(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        {basis === 'perPhase' && (
          <div className="grid gap-3">
            {errors.phases && (
              <p role="alert" data-phase-error tabIndex={-1} className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">
                {errors.phases}
              </p>
            )}
            {phases.map((p) => {
              const r = rows[p.id] ?? { kind: '', value: '' }
              return (
                <fieldset key={p.id} className="grid gap-2 rounded-xl border p-3">
                  <legend className="px-1 text-sm font-bold">{phaseName(p)}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Dropdown aria-label={`${phaseName(p)}: ${t('stl.feePhaseKind')}`} value={r.kind} onChange={(e) => setRow(p.id, { kind: e.target.value as '' | PhaseFeeKind, value: '' })}>
                      <option value="">{t('stl.feePhaseNone')}</option>
                      <option value="fixed">{t('stl.feePhaseFixed')}</option>
                      <option value="percent">{t('stl.feePhasePercent')}</option>
                    </Dropdown>
                    {r.kind && (
                      <Input
                        aria-label={`${phaseName(p)}: ${r.kind === 'fixed' ? t('stl.feeAmount') : t('stl.feePercentValue')}`}
                        className="tabular"
                        inputMode={r.kind === 'fixed' ? 'numeric' : 'decimal'}
                        value={r.value}
                        onChange={(e) => setRow(p.id, { value: r.kind === 'fixed' ? groupDigits(e.target.value) : e.target.value.replace(/[^0-9.]/g, '') })}
                      />
                    )}
                  </div>
                </fieldset>
              )
            })}
          </div>
        )}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}
