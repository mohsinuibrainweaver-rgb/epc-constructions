import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Loader2, Trash2, TriangleAlert, X } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Field, GroupField } from '@/components/common'
import { useToast } from '@/components/Toast'
import { VendorDialog } from '@/components/VendorDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { Textarea } from '@/components/ui/textarea'
import { ApprovalNotice } from '@/components/ApprovalActions'
import { db } from '@/db/db'
import { binPayment, restorePayment, savePayment } from '@/db/actions'
import { useAttachments, useContracts, usePayments, usePhases, useVendors } from '@/db/hooks'
import {
  CATEGORIES,
  MISC_TYPES,
  type Attachment,
  type Category,
  type MiscType,
  type PayMode,
  type PayStatus,
  type Role,
} from '@/db/types'
import type { Key } from '@/i18n/en'
import { approvalFields } from '@/lib/approval'
import { openContracts } from '@/lib/contracts'
import { groupDigits, parseAmount, todayISO } from '@/lib/format'
import { compressImage, useObjectUrl } from '@/lib/image'
import { ensureAttachmentBlob } from '@/sync/engine'

function Thumb({
  blob,
  attachment,
  label,
  onRemove,
}: {
  blob?: Blob
  attachment?: Attachment
  label: string
  onRemove: () => void
}) {
  // A photo another phone uploaded is downloaded the first time it is shown.
  const known = blob ?? attachment?.blob
  const [fetched, setFetched] = useState<Blob>()
  useEffect(() => {
    if (!known && attachment) void ensureAttachmentBlob(attachment).then(setFetched)
  }, [known, attachment])
  const url = useObjectUrl(known ?? fetched)
  return (
    <div className="relative size-20 overflow-hidden rounded-lg border bg-muted">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <Loader2 aria-hidden="true" className="absolute inset-0 m-auto size-5 animate-spin text-muted-foreground" />}
      <button
        type="button"
        aria-label={label}
        onClick={onRemove}
        className="absolute inset-e-1 top-1 grid size-6 place-items-center rounded-control bg-black/70 text-white transition-colors hover:bg-black"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

export function AddPayment() {
  const { id } = useParams()
  const edit = Boolean(id)
  const [sp] = useSearchParams()
  const { t, project, settings, phaseName } = useApp()
  const nav = useNavigate()
  const toast = useToast()
  const vendors = useVendors(project?.id)
  const phases = usePhases(project?.id)
  const payments = usePayments(project?.id)
  const contracts = useContracts(project?.id)
  const existing = useLiveQuery(() => (id ? db.payments.get(id) : undefined), [id])
  const existingFiles = useAttachments(id)

  const [misc, setMisc] = useState(sp.get('misc') === '1')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [purpose, setPurpose] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [contractId, setContractId] = useState(sp.get('contract') ?? '')
  const [payee, setPayee] = useState('')
  const [phaseId, setPhaseId] = useState(sp.get('phase') ?? '')
  const [category, setCategory] = useState<Category>('material')
  const [miscType, setMiscType] = useState<MiscType>('meals')
  const [status, setStatus] = useState<PayStatus>('paid')
  const [mode, setMode] = useState<PayMode>('cash')
  const [paidBy, setPaidBy] = useState<Role>(settings.role)
  const [note, setNote] = useState('')
  const [newFiles, setNewFiles] = useState<{ key: number; blob: Blob }[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [errors, setErrors] = useState<{ amount?: string; purpose?: string; date?: string }>({})
  const [dup, setDup] = useState(false)
  const [vendorOpen, setVendorOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // Fill the form once when editing an existing payment.
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!existing || loaded) return
    setLoaded(true)
    setMisc(existing.category === 'misc')
    setAmount(groupDigits(String(existing.amount)))
    setDate(existing.date)
    setPurpose(existing.purpose)
    setVendorId(existing.vendorId ?? '')
    setContractId(existing.contractId ?? '')
    setPayee(existing.payeeName ?? '')
    setPhaseId(existing.phaseId ?? '')
    if (existing.category !== 'misc') setCategory(existing.category)
    if (existing.miscType) setMiscType(existing.miscType)
    setStatus(existing.status)
    setMode(existing.mode)
    setPaidBy(existing.paidBy)
    setNote(existing.note ?? '')
  }, [existing, loaded])

  const visibleExisting = useMemo(() => existingFiles.filter((a) => !removed.includes(a.id)), [existingFiles, removed])

  /** Open contracts, plus the one this payment is already linked to even if it was closed since. */
  const choosable = useMemo(() => contracts.filter((c) => c.status === 'active' || c.id === (existing?.contractId ?? contractId)), [contracts, existing?.contractId, contractId])
  const vendorLabel = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors])

  /** Choosing a contract fills in its vendor and phase when those are still empty. */
  const pickContract = (cid: string) => {
    setContractId(cid)
    const c = contracts.find((x) => x.id === cid)
    if (!c) return
    if (c.vendorId) setVendorId((v) => v || c.vendorId!)
    if (c.phaseId) setPhaseId((p) => p || c.phaseId!)
  }
  // Arriving from a contract ("Add payment" on its page) fills the form once.
  const prefilled = useRef(false)
  useEffect(() => {
    const cid = sp.get('contract')
    if (!cid || prefilled.current || edit || contracts.length === 0) return
    prefilled.current = true
    pickContract(cid)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) nav(-1)
    else nav('/')
  }

  const addFiles = async (list: FileList | null) => {
    if (!list) return
    const out: { key: number; blob: Blob }[] = []
    for (const f of Array.from(list)) out.push({ key: Date.now() + out.length, blob: await compressImage(f) })
    setNewFiles((xs) => [...xs, ...out])
  }

  const submit = async (confirmed = false) => {
    if (!project || busy) return
    const amt = parseAmount(amount)
    const errs: typeof errors = {}
    if (amt <= 0) errs.amount = t('pay.errAmount')
    if (!purpose.trim()) errs.purpose = t('pay.errPurpose')
    if (!date) errs.date = t('pay.errDate')
    setErrors(errs)
    if (Object.keys(errs).length) {
      // Move focus to the first field with a problem (WCAG 3.3.1).
      const first = errs.amount ? 'amount' : errs.date ? 'date' : 'purpose'
      document.getElementById(first)?.focus()
      return
    }

    if (!edit && !confirmed) {
      const same = payments.find(
        (p) =>
          !p.deletedAt &&
          p.date === date &&
          p.amount === amt &&
          (vendorId ? p.vendorId === vendorId : !p.vendorId && (p.payeeName ?? '') === payee.trim()),
      )
      if (same) {
        setDup(true)
        return
      }
    }

    setBusy(true)
    try {
      await savePayment(
        {
          id,
          projectId: project.id,
          date,
          amount: amt,
          vendorId: vendorId || undefined,
          // null removes a link that was saved before; undefined means there never was one.
          contractId: contractId || (existing?.contractId ? null : undefined),
          payeeName: vendorId ? undefined : payee.trim() || undefined,
          phaseId: phaseId || undefined,
          category: misc ? 'misc' : category,
          miscType: misc ? miscType : undefined,
          purpose: purpose.trim(),
          status,
          mode,
          paidBy,
          note: note.trim() || undefined,
          addedBy: existing?.addedBy ?? (settings.userName || settings.role),
          ...approvalFields(settings.role, status, existing),
        },
        newFiles.map((f) => f.blob),
        removed,
      )
      toast.show({
        kind: 'success',
        message: navigator.onLine ? t(edit ? 'pay.updated' : 'pay.saved') : t('pay.savedLocal'),
      })
      goBack()
    } catch {
      toast.show({ kind: 'error', message: t('err.generic'), actionLabel: t('common.retry'), onAction: () => void submit(confirmed) })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!id) return
    await binPayment(id)
    toast.show({
      kind: 'info',
      message: t('pay.deleted'),
      actionLabel: t('common.undo'),
      onAction: () => void restorePayment(id),
      duration: 8000,
    })
    goBack()
  }

  const nonMisc = CATEGORIES.filter((c) => c !== 'misc')

  return (
    <form
      className="mx-auto grid w-full max-w-2xl gap-5 rounded-xl border bg-card p-4 text-card-foreground sm:p-8"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      noValidate
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{edit ? t('pay.edit') : t('pay.add')}</h1>
        {edit && (
          <Button type="button" variant="destructive" size="sm" onClick={() => void remove()}>
            <Trash2 aria-hidden="true" />
            {t('pay.delete')}
          </Button>
        )}
      </div>

      {existing && <ApprovalNotice payment={existing} />}

      <GroupField label={t('pay.kind')}>
        {(labelId) => (
          <>
            <PillRadioGroup aria-labelledby={labelId} value={misc ? 'misc' : 'standard'} onValueChange={(v) => setMisc(v === 'misc')}>
              <PillRadioItem value="standard">{t('pay.standard')}</PillRadioItem>
              <PillRadioItem value="misc">{t('pay.misc')}</PillRadioItem>
            </PillRadioGroup>
            {misc && <p className="text-sm text-muted-foreground">{t('pay.miscHint')}</p>}
          </>
        )}
      </GroupField>

      <Field label={t('pay.amount')} htmlFor="amount" error={errors.amount}>
        <Input
          className="tabular h-14 text-2xl font-extrabold"
          inputMode="numeric"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(groupDigits(e.target.value))}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('pay.date')} htmlFor="date" error={errors.date}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={misc ? t('pay.purposeMisc') : t('pay.purpose')} htmlFor="purpose" error={errors.purpose}>
          <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} autoComplete="off" />
        </Field>

        {misc ? (
          <Field label={t('pay.miscType')}>
            <Dropdown value={miscType} onChange={(e) => setMiscType(e.target.value as MiscType)}>
              {MISC_TYPES.map((m) => (
                <option key={m} value={m}>
                  {t(`misc.${m}` as Key)}
                </option>
              ))}
            </Dropdown>
          </Field>
        ) : (
          <Field label={t('pay.category')}>
            <Dropdown value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {nonMisc.map((c) => (
                <option key={c} value={c}>
                  {t(`cat.${c}` as Key)}
                </option>
              ))}
            </Dropdown>
          </Field>
        )}

        <Field label={`${t('pay.phase')} (${t('common.optional')})`}>
          <Dropdown value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
            <option value="">{t('pay.noPhase')}</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {phaseName(p)}
              </option>
            ))}
          </Dropdown>
        </Field>

        <Field label={`${t('pay.vendor')} (${t('common.optional')})`}>
          <Dropdown
            value={vendorId}
            onChange={(e) => {
              if (e.target.value === '__new') setVendorOpen(true)
              else {
                setVendorId(e.target.value)
                // A vendor with exactly one open contract: the payment most likely belongs to it.
                if (!edit && !contractId) {
                  const mine = openContracts(contracts).filter((c) => c.vendorId === e.target.value)
                  if (mine.length === 1) pickContract(mine[0].id)
                }
              }
            }}
          >
            <option value="">{t('pay.noVendor')}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
            <option value="__new">{t('pay.newVendor')}</option>
          </Dropdown>
        </Field>

        {(choosable.length > 0 || contractId) && (
          <Field label={`${t('pay.contract')} (${t('common.optional')})`} hint={t('pay.contractHint')}>
            <Dropdown value={contractId} onChange={(e) => pickContract(e.target.value)}>
              <option value="">{t('pay.noContract')}</option>
              {choosable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.vendorId && vendorLabel.get(c.vendorId) ? ` · ${vendorLabel.get(c.vendorId)}` : ''}
                </option>
              ))}
            </Dropdown>
          </Field>
        )}

        {!vendorId && (
          <Field label={`${t('pay.payee')} (${t('common.optional')})`}>
            <Input value={payee} onChange={(e) => setPayee(e.target.value)} autoComplete="off" />
          </Field>
        )}
      </div>

      <GroupField label={t('pay.status')}>
        {(labelId) => (
          <PillRadioGroup aria-labelledby={labelId} value={status} onValueChange={(v) => setStatus(v as PayStatus)}>
            {(existing?.status === 'skipped' ? (['paid', 'planned', 'advance', 'skipped'] as PayStatus[]) : (['paid', 'planned', 'advance'] as PayStatus[])).map((s) => (
              <PillRadioItem key={s} value={s}>
                {t(`status.${s}` as Key)}
              </PillRadioItem>
            ))}
          </PillRadioGroup>
        )}
      </GroupField>

      <div className="grid gap-5 sm:grid-cols-2">
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

      <div className="grid gap-2">
        <span className="text-sm font-semibold">{t('pay.receipts')}</span>
        {(visibleExisting.length > 0 || newFiles.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {visibleExisting.map((a) => (
              <Thumb key={a.id} attachment={a} label={t('pay.removePhoto')} onRemove={() => setRemoved((r) => [...r, a.id])} />
            ))}
            {newFiles.map((f) => (
              <Thumb
                key={f.key}
                blob={f.blob}
                label={t('pay.removePhoto')}
                onRemove={() => setNewFiles((xs) => xs.filter((x) => x.key !== f.key))}
              />
            ))}
          </div>
        )}
        <Button asChild variant="outline" className="w-fit cursor-pointer">
          <label>
            <Camera aria-hidden="true" />
            {t('pay.addReceipt')}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        </Button>
      </div>

      <Field label={`${t('pay.note')} (${t('common.optional')})`}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {dup && (
        <div role="alert" className="flex items-start gap-3 rounded-xl bg-warning-soft p-4 text-sm font-semibold text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="grid gap-2">
            <strong>{t('pay.dupTitle')}</strong>
            <span className="font-medium">{t('pay.dupBody')}</span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void submit(true)}>
                {t('pay.saveAnyway')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDup(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="sticky inset-x-0 bottom-0 -mx-4 -mb-4 flex justify-end gap-3 rounded-b-xl border-t bg-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:mb-0 sm:rounded-none sm:bg-transparent sm:px-0 sm:pt-5 sm:pb-0">
        <Button type="button" variant="outline" onClick={goBack}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={busy} className="max-sm:flex-1">
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t('pay.save')}
        </Button>
      </div>

      <VendorDialog open={vendorOpen} onClose={() => setVendorOpen(false)} onSaved={(vid) => setVendorId(vid)} />
    </form>
  )
}
