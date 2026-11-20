import { useEffect, useId, useMemo, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field, GroupField } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { Textarea } from '@/components/ui/textarea'
import { saveMaterial } from '@/db/actions'
import { useMaterials, usePhases } from '@/db/hooks'
import { MATERIAL_UNITS, type MaterialLine, type MaterialUnit, type PayMode, type Role } from '@/db/types'
import type { Key } from '@/i18n/en'
import { money, todayISO } from '@/lib/format'
import { itemKey, lineAmount, parseDecimal } from '@/lib/materials'

/** Adds or edits one material purchase: what, how much, at what rate. */
export function MaterialDialog({ open, line, onClose }: { open: boolean; line?: MaterialLine; onClose: () => void }) {
  const { t, project, settings, phaseName } = useApp()
  const toast = useToast()
  const phases = usePhases(project?.id)
  const lines = useMaterials(project?.id)
  const listId = useId()

  const [item, setItem] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<MaterialUnit>('bag')
  const [rate, setRate] = useState('')
  const [supplier, setSupplier] = useState('')
  const [phaseId, setPhaseId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [asPayment, setAsPayment] = useState(false)
  const [mode, setMode] = useState<PayMode>('cash')
  const [paidBy, setPaidBy] = useState<Role>(settings.role)
  const [errors, setErrors] = useState<{ item?: string; quantity?: string; rate?: string }>({})

  useEffect(() => {
    if (!open) return
    setItem(line?.item ?? '')
    setQuantity(line ? String(line.quantity) : '')
    setUnit(line?.unit ?? 'bag')
    setRate(line ? String(line.rate) : '')
    setSupplier(line?.supplier ?? '')
    setPhaseId(line?.phaseId ?? '')
    setDate(line?.date ?? todayISO())
    setNote(line?.note ?? '')
    setAsPayment(false)
    setMode('cash')
    setPaidBy(settings.role)
    setErrors({})
  }, [open, line, settings.role])

  /** Names already used, newest first, so the same item is typed the same way each time. */
  const names = useMemo(() => {
    const seen = new Map<string, string>()
    for (const l of lines) if (!seen.has(itemKey(l.item))) seen.set(itemKey(l.item), l.item)
    return [...seen.values()]
  }, [lines])

  const qty = parseDecimal(quantity)
  const rt = parseDecimal(rate)
  const total = lineAmount(qty, rt)

  /** Choosing a known item brings back its unit and last rate, which is what is usually bought again. */
  const onItem = (value: string) => {
    setItem(value)
    if (line) return
    const prev = lines.find((l) => itemKey(l.item) === itemKey(value))
    if (prev) {
      setUnit(prev.unit)
      if (!rate) setRate(String(prev.rate))
      if (!supplier && prev.supplier) setSupplier(prev.supplier)
    }
  }

  const submit = async () => {
    if (!project) return
    const next: typeof errors = {}
    if (!item.trim()) next.item = t('mat.errItem')
    if (qty <= 0) next.quantity = t('mat.errQty')
    if (rt <= 0) next.rate = t('mat.errRate')
    setErrors(next)
    if (Object.keys(next).length) {
      requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus())
      return
    }
    await saveMaterial({
      id: line?.id,
      projectId: project.id,
      date: date || todayISO(),
      item,
      quantity: qty,
      unit,
      rate: rt,
      supplier: supplier.trim() || undefined,
      phaseId: phaseId || undefined,
      note: note.trim() || undefined,
      asPayment: !line && asPayment ? { mode, paidBy, addedBy: settings.userName || settings.role, pending: settings.role === 'builder' } : undefined,
    })
    toast.show({ kind: 'success', message: t('mat.saved') })
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={line ? t('mat.edit') : t('mat.add')}
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
        <Field label={t('mat.item')} hint={t('mat.itemHint')} error={errors.item}>
          <Input list={listId} value={item} onChange={(e) => onItem(e.target.value)} autoComplete="off" />
        </Field>
        <datalist id={listId}>
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('mat.quantity')} error={errors.quantity}>
            <Input className="tabular" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={t('mat.unit')}>
            <Dropdown value={unit} onChange={(e) => setUnit(e.target.value as MaterialUnit)}>
              {MATERIAL_UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(`unit.${u}` as Key)}
                </option>
              ))}
            </Dropdown>
          </Field>
        </div>

        <Field label={t('mat.rate')} error={errors.rate}>
          <Input className="tabular" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} autoComplete="off" />
        </Field>

        <p className="flex items-center justify-between rounded-xl bg-muted p-3" role="status" aria-live="polite">
          <span className="text-sm font-semibold text-muted-foreground">{t('mat.total')}</span>
          <span className="tabular text-lg font-extrabold">{money(total)}</span>
        </p>

        <Field label={t('mat.supplier')}>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} autoComplete="off" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('mat.phase')}>
            <Dropdown value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
              <option value="">{t('mat.noPhase')}</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {phaseName(p)}
                </option>
              ))}
            </Dropdown>
          </Field>
          <Field label={t('mat.date')}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t('mat.note')}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {!line && (
          <div className="grid gap-3 rounded-xl border p-3">
            <div className="flex items-start gap-3">
              <Checkbox id={`${listId}-pay`} className="mt-1" checked={asPayment} onCheckedChange={(c) => setAsPayment(c === true)} />
              <label htmlFor={`${listId}-pay`} className="grid gap-0.5">
                <span className="font-semibold">{t('mat.asPayment')}</span>
                <span className="text-sm text-muted-foreground">{t('mat.asPaymentHint')}</span>
              </label>
            </div>
            {asPayment && (
              <div className="grid gap-4 sm:grid-cols-2">
                <GroupField label={t('pay.mode')}>
                  {(labelId) => (
                    <PillRadioGroup aria-labelledby={labelId} value={mode} onValueChange={(v) => setMode(v as PayMode)}>
                      {(['cash', 'bank'] as PayMode[]).map((m) => (
                        <PillRadioItem key={m} value={m}>
                          {t(`mode.${m}` as Key)}
                        </PillRadioItem>
                      ))}
                    </PillRadioGroup>
                  )}
                </GroupField>
                <GroupField label={t('pay.paidBy')}>
                  {(labelId) => (
                    <PillRadioGroup aria-labelledby={labelId} value={paidBy} onValueChange={(v) => setPaidBy(v as Role)}>
                      {(['investor', 'builder'] as Role[]).map((r) => (
                        <PillRadioItem key={r} value={r}>
                          {t(`paidBy.${r}` as Key)}
                        </PillRadioItem>
                      ))}
                    </PillRadioGroup>
                  )}
                </GroupField>
              </div>
            )}
          </div>
        )}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}

