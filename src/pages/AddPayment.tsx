import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Clock, Loader2, Trash2, TriangleAlert, X } from 'lucide-react'
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
import { canChangePayment } from '@/lib/permissions'
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
import { ContractBar } from '@/components/ContractParts'
import { approvalFields, needsApproval } from '@/lib/approval'
import { openContracts, previewPayment } from '@/lib/contracts'
import { groupDigits, money, parseAmount, todayISO } from '@/lib/format'
import { compressImage, useObjectUrl } from '@/lib/image'
import { recentTemplates, type PaymentTemplate } from '@/lib/recent'
import { BankSelect } from '@/components/BankSelect'
import { bankFromVendor } from '@/lib/bank'
import { previewPhaseBudget } from '@/lib/stats'
import { cn } from '@/lib/utils'
import { matchVendor } from '@/lib/vendorMatch'
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
  // An approved entry, or a paid one the investor made himself, is closed to a builder (the server holds the same rule).
  const locked = Boolean(existing && !canChangePayment(settings.role, existing))
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
  // Bank details of a transfer; kept only when the mode is Bank transfer.
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankRef, setBankRef] = useState('')
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
    setBankName(existing.bankName ?? '')
    setBankAccount(existing.bankAccount ?? '')
    setBankRef(existing.bankRef ?? '')
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
  /** A transfer to a vendor: fill the bank and account from the vendor's saved details, where the form has none yet. */
  const fillBankFrom = (vid: string) => {
    const v = vendors.find((x) => x.id === vid)
    if (!v) return
    const next = bankFromVendor(v, { name: bankName, account: bankAccount })
    setBankName(next.name)
    setBankAccount(next.account)
  }

  /** Choosing a vendor: a vendor with exactly one open contract gets that contract, as the payment most likely belongs to it. */
  const pickVendor = (vid: string) => {
    setVendorId(vid)
    if (mode === 'bank') fillBankFrom(vid)
    if (!edit && !contractId) {
      const mine = openContracts(contracts).filter((c) => c.vendorId === vid)
      if (mine.length === 1) pickContract(mine[0].id)
    }
  }
  // A vendor's name typed into the purpose (or the payee) instead of choosing the vendor: offer to choose it, so the
  // vendor's total and statement include this payment.
  const suggestedVendor = useMemo(() => (vendorId ? undefined : matchVendor(purpose, vendors) ?? matchVendor(payee, vendors)), [vendorId, purpose, payee, vendors])

  // What this payment does to the chosen contract: agreed, paid, left now, and left after saving.
  const contractObj = contracts.find((c) => c.id === contractId)
  const draftAmount = parseAmount(amount)
  const preview = useMemo(
    () =>
      contractObj
        ? previewPayment(contractObj, payments, { id, amount: draftAmount, status, waitsForApproval: needsApproval(settings.role, status) })
        : undefined,
    [contractObj, payments, id, draftAmount, status, settings.role],
  )

  // What this payment does to the chosen phase's budget: spent so far, and how far it is after saving.
  const phaseObj = phases.find((p) => p.id === phaseId)
  const phaseBudget = useMemo(
    () => (phaseObj ? previewPhaseBudget(phaseObj, payments, { id, amount: draftAmount, status, waitsForApproval: needsApproval(settings.role, status) }) : undefined),
    [phaseObj, payments, id, draftAmount, status, settings.role],
  )
  let phaseText = ''
  if (phaseObj && phaseBudget) {
    const name = phaseName(phaseObj)
    const base = t('pay.phaseBudget', { name, spent: money(phaseBudget.spent), budget: money(phaseBudget.budget), pct: phaseBudget.pct })
    let extra = ''
    if (draftAmount > 0 && phaseBudget.counts) extra = phaseBudget.over > 0 ? t('pay.phaseOver', { name, amount: money(phaseBudget.over) }) : t('pay.phaseAfter', { pct: phaseBudget.afterPct })
    else if (phaseBudget.level === 'error') extra = t('notif.budget100', { name })
    phaseText = `${base} ${extra}`.trim()
  }

  // Arriving from a contract ("Add payment" on its page) fills the form once.
  const prefilled = useRef(false)
  useEffect(() => {
    const cid = sp.get('contract')
    if (!cid || prefilled.current || edit || contracts.length === 0) return
    prefilled.current = true
    pickContract(cid)
    // "Pay the remaining ... now" on a contract brings the amount along.
    const wanted = Math.round(Number(sp.get('amount')))
    if (wanted > 0) setAmount(groupDigits(String(wanted)))
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving from a vendor's page ("Add payment" there) chooses that vendor once, which also brings its only open contract.
  const vendorPrefilled = useRef(false)
  useEffect(() => {
    const vid = sp.get('vendor')
    if (!vid || vendorPrefilled.current || edit || sp.get('contract') || vendors.length === 0) return
    vendorPrefilled.current = true
    if (vendors.some((v) => v.id === vid)) pickVendor(vid)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // Repeat a recent payment: one tap fills vendor, phase, category, mode, purpose and amount (new payments only, and
  // only while the form is empty and the page was not opened from a contract or phase).
  const [filledFrom, setFilledFrom] = useState<string>()
  const templates = useMemo(
    () =>
      edit
        ? []
        : recentTemplates(payments, {
            vendors: new Set(vendors.map((v) => v.id)),
            phases: new Set(phases.map((p) => p.id)),
            openContracts: new Set(openContracts(contracts).map((c) => c.id)),
          }),
    [edit, payments, vendors, phases, contracts],
  )
  const fromContext = Boolean(sp.get('contract') || sp.get('phase') || sp.get('vendor'))
  const showTemplates = templates.length > 0 && !fromContext && !filledFrom && !amount && !purpose.trim()
  const applyTemplate = (tpl: PaymentTemplate) => {
    setMisc(tpl.category === 'misc')
    if (tpl.miscType) setMiscType(tpl.miscType)
    if (tpl.category !== 'misc') setCategory(tpl.category)
    setPurpose(tpl.purpose)
    setVendorId(tpl.vendorId ?? '')
    setPayee(tpl.payeeName ?? '')
    setPhaseId(tpl.phaseId ?? '')
    setContractId(tpl.contractId ?? '')
    setMode(tpl.mode)
    setBankName(tpl.bankName ?? '')
    setBankAccount(tpl.bankAccount ?? '')
    setBankRef('')
    setPaidBy(tpl.paidBy)
    setStatus('paid')
    setAmount(groupDigits(String(tpl.amount)))
    setErrors({})
    setDup(false)
    setFilledFrom(tpl.purpose)
    // The amount is what usually changes: put the cursor there with the old amount selected.
    requestAnimationFrame(() => {
      const el = document.getElementById('amount') as HTMLInputElement | null
      el?.focus()
      el?.select()
    })
  }

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

  // "Save and add another": after saving, the form is emptied for the next payment but keeps what usually stays the same
  // for a run of entries (date, phase, category, status, mode, paid by). When the page was opened from a contract, that
  // contract and its vendor stay too.
  const addAnotherRef = useRef(false)
  const resetForNext = () => {
    setAmount('')
    setPurpose('')
    setPayee('')
    setNote('')
    setNewFiles([])
    setRemoved([])
    setErrors({})
    setDup(false)
    setFilledFrom(undefined)
    setBankRef('')
    if (!sp.get('contract') && !sp.get('vendor')) {
      setVendorId('')
      setContractId('')
      setBankName('')
      setBankAccount('')
    }
    window.scrollTo({ top: 0 })
    requestAnimationFrame(() => document.getElementById('amount')?.focus())
  }

  const submit = async (confirmed = false, addAnother = false) => {
    if (!project || busy || locked) return
    addAnotherRef.current = addAnother
    const bankValue = (typed: string, saved: string | null | undefined): string | null | undefined =>
      mode === 'bank' && typed.trim() ? typed.trim() : saved ? null : undefined
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
          // Bank details are kept only for a bank transfer; null removes a value that was saved before.
          bankName: bankValue(bankName, existing?.bankName),
          bankAccount: bankValue(bankAccount, existing?.bankAccount),
          bankRef: bankValue(bankRef, existing?.bankRef),
          addedBy: existing?.addedBy ?? (settings.userName || settings.role),
          ...approvalFields(settings.role, status, existing),
        },
        newFiles.map((f) => f.blob),
        removed,
      )
      if (addAnother && !edit) {
        toast.show({ kind: 'success', message: navigator.onLine ? t('pay.savedNext') : t('pay.savedLocal') })
        resetForNext()
      } else {
        toast.show({
          kind: 'success',
          message: navigator.onLine ? t(edit ? 'pay.updated' : 'pay.saved') : t('pay.savedLocal'),
        })
        goBack()
      }
    } catch {
      toast.show({ kind: 'error', message: t('err.generic'), actionLabel: t('common.retry'), onAction: () => void submit(confirmed, addAnother) })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!id || locked) return
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
          <Button type="button" variant="destructive" size="sm" disabled={locked} onClick={() => void remove()}>
            <Trash2 aria-hidden="true" />
            {t('pay.delete')}
          </Button>
        )}
      </div>

      {existing && <ApprovalNotice payment={existing} />}
      {locked && (
        <p role="status" className="rounded-xl bg-warning-soft p-3 text-sm font-semibold text-warning">
          {t('pay.locked')}
        </p>
      )}

      {showTemplates && (
        <div role="group" aria-labelledby="recent-title" className="grid gap-2">
          <span id="recent-title" className="text-sm font-semibold">
            {t('pay.recent')}
          </span>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            {templates.map((tpl) => {
              const who = tpl.vendorId ? vendorLabel.get(tpl.vendorId) : tpl.payeeName
              return (
                <Button
                  key={tpl.key}
                  type="button"
                  variant="outline"
                  aria-label={t('pay.recentFill', { name: tpl.purpose })}
                  onClick={() => applyTemplate(tpl)}
                  className="h-auto max-w-[16rem] shrink-0 flex-col items-start gap-0 py-2 text-start whitespace-normal"
                >
                  <span className="max-w-full truncate">{tpl.purpose}</span>
                  <span className="tabular max-w-full truncate text-xs font-medium text-muted-foreground">
                    {who ? `${who} · ` : ''}
                    {money(tpl.amount)}
                  </span>
                </Button>
              )
            })}
          </div>
        </div>
      )}
      {filledFrom && !edit && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('pay.recentFilled', { name: filledFrom })}
        </p>
      )}

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

        {suggestedVendor && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-info-soft px-3 py-2 text-sm sm:col-span-2">
            <span className="font-medium text-info">{t('pay.vendorNudge', { name: suggestedVendor.name })}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => pickVendor(suggestedVendor.id)}>
              {t('pay.vendorNudgeBtn', { name: suggestedVendor.name })}
            </Button>
          </div>
        )}

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

        {phaseBudget && phaseText && (
          <p
            role="status"
            className={cn(
              'flex items-start gap-2 text-sm sm:col-span-2',
              phaseBudget.level === 'error' ? 'font-semibold text-danger' : phaseBudget.level === 'warning' ? 'font-semibold text-warning' : 'text-muted-foreground',
            )}
          >
            {(phaseBudget.level === 'warning' || phaseBudget.level === 'error') && <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
            <span>{phaseText}</span>
          </p>
        )}

        <Field label={`${t('pay.vendor')} (${t('common.optional')})`}>
          <Dropdown
            value={vendorId}
            onChange={(e) => {
              if (e.target.value === '__new') setVendorOpen(true)
              else pickVendor(e.target.value)
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

        {contractObj && preview && (
          <div role="group" aria-labelledby="contract-strip-title" className="grid gap-2.5 rounded-xl border bg-muted/40 p-3 sm:col-span-2">
            <div className="flex items-baseline justify-between gap-3">
              <span id="contract-strip-title" className="min-w-0 truncate text-sm font-semibold">
                {contractObj.title}
              </span>
              {!edit && <span className="shrink-0 text-xs font-semibold text-muted-foreground">{t('pay.instalment', { n: preview.instalment })}</span>}
            </div>
            <ContractBar pct={preview.before.pct} state={preview.before.state} label={t('contract.paidPct', { pct: preview.before.pct })} />
            <dl className="tabular grid grid-cols-3 gap-2 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t('contract.agreed')}</dt>
                <dd className="font-semibold">{money(preview.before.total)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t('contract.paid')}</dt>
                <dd className="font-semibold">{money(preview.before.paid)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{preview.before.remaining < 0 ? t('contract.overpaid') : t('contract.remaining')}</dt>
                <dd className="font-semibold">{money(Math.abs(preview.before.remaining))}</dd>
              </div>
            </dl>
            <div role="status" className="grid gap-1 text-sm">
              {draftAmount > 0 && preview.counts && preview.over > 0 && (
                <p className="flex items-start gap-2 font-semibold text-danger">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {t('pay.contractOver', { amount: money(preview.over) })}
                </p>
              )}
              {draftAmount > 0 && preview.counts && preview.over === 0 && (
                <p className="text-muted-foreground">{preview.after === 0 ? t('pay.contractDone') : t('pay.contractAfter', { amount: money(preview.after) })}</p>
              )}
              {draftAmount > 0 && !preview.counts && status === 'planned' && <p className="text-muted-foreground">{t('pay.contractPlanned')}</p>}
              {draftAmount > 0 && !preview.counts && status !== 'planned' && <p className="text-muted-foreground">{t('pay.contractWaits')}</p>}
            </div>
            {!edit && !purpose.trim() && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-auto w-fit max-w-full py-1.5 text-start whitespace-normal"
                onClick={() => setPurpose(t('pay.instalmentName', { name: contractObj.title, n: preview.instalment }))}
              >
                {t('pay.useInstalment', { name: t('pay.instalmentName', { name: contractObj.title, n: preview.instalment }) })}
              </Button>
            )}
          </div>
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

      {needsApproval(settings.role, status) && (
        <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm font-medium text-info">
          <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('pay.approvalHint')}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <GroupField label={t('pay.mode')}>
          {(labelId) => (
            <PillRadioGroup
              aria-labelledby={labelId}
              value={mode}
              onValueChange={(v) => {
                setMode(v as PayMode)
                if (v === 'bank' && vendorId) fillBankFrom(vendorId)
              }}
            >
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

      {mode === 'bank' && (
        <div role="group" aria-labelledby="bank-title" className="grid items-start gap-4 rounded-xl border bg-muted/40 p-3 sm:grid-cols-2">
          <p id="bank-title" className="text-sm font-semibold sm:col-span-2">
            {t('pay.bankTitle')}
          </p>
          <BankSelect id="bank-name" label={t('pay.bankName')} value={bankName} onChange={setBankName} />
          <Field label={t('pay.bankAccount')} htmlFor="bank-account" hint={t('pay.bankAccountHint')}>
            <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          </Field>
          <Field label={t('pay.bankRef')} htmlFor="bank-ref" className="sm:col-span-2">
            <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
        </div>
      )}

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
              <Button type="button" size="sm" variant="outline" onClick={() => void submit(true, addAnotherRef.current)}>
                {t('pay.saveAnyway')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDup(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!edit && (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void submit(false, true)} className="w-full sm:hidden">
          {t('pay.saveAdd')}
        </Button>
      )}

      <div className="sticky inset-x-0 bottom-0 -mx-4 -mb-4 flex justify-end gap-3 rounded-b-xl border-t bg-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:mb-0 sm:rounded-none sm:bg-transparent sm:px-0 sm:pt-5 sm:pb-0">
        <Button type="button" variant="outline" onClick={goBack}>
          {t('common.cancel')}
        </Button>
        {!edit && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void submit(false, true)} className="max-sm:hidden">
            {t('pay.saveAdd')}
          </Button>
        )}
        <Button type="submit" disabled={busy || locked} className="max-sm:flex-1">
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t('pay.save')}
        </Button>
      </div>

      <VendorDialog open={vendorOpen} onClose={() => setVendorOpen(false)} onSaved={(vid) => setVendorId(vid)} />
    </form>
  )
}
