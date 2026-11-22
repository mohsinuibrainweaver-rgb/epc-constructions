import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Clock, ImagePlus, Loader2, Trash2, TriangleAlert } from 'lucide-react'
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
  MATERIAL_UNITS,
  MISC_TYPES,
  type Attachment,
  type Category,
  type MaterialUnit,
  type MiscType,
  type PayMode,
  type PayStatus,
  type Role,
} from '@/db/types'
import type { Key } from '@/i18n/en'
import { ContractBar } from '@/components/ContractParts'
import { approvalFields, needsApproval } from '@/lib/approval'
import { openContracts, previewPayment } from '@/lib/contracts'
import { formatDate, groupDigits, money, moneyRate, parseAmount, todayISO } from '@/lib/format'
import { compressImage } from '@/lib/image'
import { isVideoType, MAX_ATTACHMENT_BYTES, mimeForPath } from '@/lib/media'
import { itemKey, knownItems, parseDecimal, rateOf, solveEntry } from '@/lib/materials'
import { lastPaymentTo, possibleDouble, vendorDefaults } from '@/lib/recent'
import { BankSelect } from '@/components/BankSelect'
import { FileDropzone } from '@/components/FileDropzone'
import { FileThumb } from '@/components/FilePreview'
import { RecentPayments } from '@/components/RecentPayments'
import { bankFromVendor } from '@/lib/bank'
import { budgetTone, isSpent, previewPhaseBudget, sum } from '@/lib/stats'
import { cn } from '@/lib/utils'
import { matchVendor } from '@/lib/vendorMatch'
import { ensureAttachmentBlob } from '@/sync/engine'

/** A receipt that is already stored. One another phone uploaded is downloaded the first time it is shown. */
function StoredReceipt({ attachment, label, onRemove }: { attachment: Attachment; label: string; onRemove: () => void }) {
  const known = attachment.blob
  const [fetched, setFetched] = useState<Blob>()
  useEffect(() => {
    if (!known) void ensureAttachmentBlob(attachment).then(setFetched)
  }, [known, attachment])
  return <FileThumb blob={known ?? fetched} removeLabel={label} onRemove={onRemove} />
}

/** The category used last, so a run of labour payments does not open on Material every time. */
const LAST_CATEGORY = 'epc.lastCategory'
const lastCategory = (): Category => {
  try {
    const v = localStorage.getItem(LAST_CATEGORY)
    return v && v !== 'misc' && (CATEGORIES as string[]).includes(v) ? (v as Category) : 'material'
  } catch {
    return 'material'
  }
}
const rememberCategory = (c: Category) => {
  try {
    localStorage.setItem(LAST_CATEGORY, c)
  } catch {
    /* private mode: nothing to remember */
  }
}

export function AddPayment() {
  const { id } = useParams()
  const edit = Boolean(id)
  const [sp] = useSearchParams()
  const { t, lang, project, settings, phaseName } = useApp()
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
  const [category, setCategory] = useState<Category>(lastCategory)
  // A material purchase: how much was bought. The rate is worked out from the amount (see solveEntry).
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<MaterialUnit>('bag')
  const [unitChosen, setUnitChosen] = useState(false)
  const [rate, setRate] = useState('')
  const [byRate, setByRate] = useState(false)
  const [miscType, setMiscType] = useState<MiscType>('meals')
  const [status, setStatus] = useState<PayStatus>('paid')
  const [mode, setMode] = useState<PayMode>('cash')
  const [paidBy, setPaidBy] = useState<Role>(settings.role)
  // Fields the person chose themselves: a vendor's last payment never overrides these. Cleared for each new entry.
  const touched = useRef(new Set<'category' | 'paidBy'>())
  // What was filled in from the chosen vendor's last payment, to say so under the vendor.
  const [filled, setFilled] = useState<string[]>([])
  const [note, setNote] = useState('')
  // Bank details of a transfer; kept only when the mode is Bank transfer.
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankRef, setBankRef] = useState('')
  const [newFiles, setNewFiles] = useState<{ key: number; blob: Blob }[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [errors, setErrors] = useState<{ amount?: string; purpose?: string; date?: string; quantity?: string }>({})
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
    if (existing.quantity) {
      const e = solveEntry({ amount: groupDigits(String(existing.amount)), quantity: '', rate: '', byRate: false }, 'quantity', String(existing.quantity))
      setQuantity(e.quantity)
      setRate(e.rate)
      setUnit(existing.unit ?? 'bag')
      setUnitChosen(true)
    }
  }, [existing, loaded])

  const visibleExisting = useMemo(() => existingFiles.filter((a) => !removed.includes(a.id)), [existingFiles, removed])

  /** Open contracts, plus the one this payment is already linked to even if it was closed since. */
  const choosable = useMemo(() => contracts.filter((c) => c.status === 'active' || c.id === (existing?.contractId ?? contractId)), [contracts, existing?.contractId, contractId])
  const vendorLabel = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors])
  const vendorName = vendorId ? vendorLabel.get(vendorId) : undefined
  const vendorLast = useMemo(() => (vendorId ? lastPaymentTo(payments, vendorId, id) : undefined), [payments, vendorId, id])
  const suggestedPhase = !edit && vendorLast?.phaseId && !phaseId ? phases.find((p) => p.id === vendorLast.phaseId) : undefined
  const double = useMemo(() => possibleDouble(payments, { vendorId, purpose, date, excludeId: id }), [payments, vendorId, purpose, date, id])

  // Material: the form asks how much was bought, and offers the items bought before (not counting this payment itself).
  const isMaterial = !misc && category === 'material'
  const items = useMemo(() => knownItems(payments.filter((p) => p.id !== id)), [payments, id])
  const lastBought = isMaterial && purpose.trim() ? items.find((i) => itemKey(i.purpose) === itemKey(purpose)) : undefined
  /** Typing in amount, quantity or rate keeps the three in step. */
  const entry = (edited: 'amount' | 'quantity' | 'rate', value: string) => {
    const next = solveEntry({ amount, quantity, rate, byRate }, edited, value)
    setAmount(next.amount)
    setQuantity(next.quantity)
    setRate(next.rate)
    setByRate(next.byRate)
  }
  /** An item bought before brings back its unit, unless a unit was already chosen. */
  const typeItem = (value: string) => {
    setPurpose(value)
    const known = items.find((i) => itemKey(i.purpose) === itemKey(value))
    if (known && isMaterial && !unitChosen && !quantity) setUnit(known.unit)
  }

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
    setFilled([])
    // A new payment learns from the vendor's last one: the category and who paid are filled in (unless chosen already), the phase
    // is only suggested (see below), and nothing else is touched.
    const last = !edit && vid ? lastPaymentTo(payments, vid) : undefined
    if (last) {
      const d = vendorDefaults(last)
      const said: string[] = []
      if (!misc && d.category && !touched.current.has('category') && d.category !== category) {
        setCategory(d.category)
        said.push(t(`cat.${d.category}` as Key))
      }
      if (!touched.current.has('paidBy') && d.paidBy !== paidBy) {
        setPaidBy(d.paidBy)
        said.push(t('pay.paidByWho', { who: t(`paidBy.${d.paidBy}` as Key) }))
      }
      setFilled(said)
    }
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
  // The line under the phase. With an estimate: how far it is, and what this payment does to it (red only for a clear overspend). Without
  // one, what has been paid so far, which is what matters when prices are only known afterwards. A finished phase says so.
  let phaseNote: { text: string; tone: ReturnType<typeof budgetTone> } | undefined
  if (phaseObj) {
    const name = phaseName(phaseObj)
    const paidSoFar = sum(payments.filter((p) => p.phaseId === phaseObj.id && p.id !== id && isSpent(p)))
    if (phaseObj.done) phaseNote = { text: t('pay.phaseDoneNote', { name, spent: money(paidSoFar) }), tone: 'neutral' }
    else if (phaseBudget) {
      const base = t('pay.phaseBudget', { name, spent: money(phaseBudget.spent), budget: money(phaseBudget.budget), pct: phaseBudget.pct })
      const adding = draftAmount > 0 && phaseBudget.counts
      const extra = adding ? (phaseBudget.over > 0 ? t('pay.phaseOver', { name, amount: money(phaseBudget.over) }) : t('pay.phaseAfter', { pct: phaseBudget.afterPct })) : ''
      phaseNote = { text: `${base} ${extra}`.trim(), tone: budgetTone(phaseBudget.state) }
    } else if (paidSoFar > 0) phaseNote = { text: t('pay.phaseSpent', { name, spent: money(paidSoFar) }), tone: 'none' }
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

  const goBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) nav(-1)
    else nav('/')
  }

  const addFiles = async (list: File[]) => {
    const out: { key: number; blob: Blob }[] = []
    for (const f of list) {
      // A video is kept as it is (it cannot be shrunk on the phone); give it its type when the system left it out. A photo is shrunk.
      const type = f.type || mimeForPath(f.name) || ''
      const blob = isVideoType(type) ? (f.type ? f : new Blob([f], { type })) : await compressImage(f)
      out.push({ key: Date.now() + out.length, blob })
    }
    setNewFiles((xs) => [...xs, ...out])
  }

  // "Save and add another": after saving, the form is emptied for the next payment but keeps what usually stays the same
  // for a run of entries (date, phase, category, status, mode, paid by). When the page was opened from a contract, that
  // contract and its vendor stay too.
  const addAnotherRef = useRef(false)
  const resetForNext = () => {
    setAmount('')
    setQuantity('')
    setRate('')
    setByRate(false)
    setUnit('bag')
    setUnitChosen(false)
    setPurpose('')
    setPayee('')
    setNote('')
    setNewFiles([])
    setRemoved([])
    setErrors({})
    setDup(false)
    setFilled([])
    touched.current.clear()
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
    if (isMaterial && quantity.trim() && parseDecimal(quantity) <= 0) errs.quantity = t('mat.errQty')
    setErrors(errs)
    if (Object.keys(errs).length) {
      // Move focus to the first field with a problem (WCAG 3.3.1).
      const first = errs.amount ? 'amount' : errs.date ? 'date' : errs.purpose ? 'purpose' : 'quantity'
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
          // How much was bought: kept only for a material purchase; null removes a value that was saved before.
          quantity: isMaterial && parseDecimal(quantity) > 0 ? parseDecimal(quantity) : existing?.quantity ? null : undefined,
          unit: isMaterial && parseDecimal(quantity) > 0 ? unit : existing?.unit ? null : undefined,
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
      if (!misc) rememberCategory(category)
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
    <div className="@container w-full">
      <div className="mx-auto grid w-full max-w-2xl items-start gap-6 @4xl:max-w-[61.5rem] @4xl:grid-cols-[minmax(0,1fr)_18rem]">
    <form
      className="grid w-full gap-5 rounded-xl border bg-card p-4 text-card-foreground sm:p-8"
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
          onChange={(e) => entry('amount', e.target.value)}
        />
      </Field>

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field label={t('pay.date')} htmlFor="date" error={errors.date}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={misc ? t('pay.purposeMisc') : isMaterial ? t('mat.item') : t('pay.purpose')} htmlFor="purpose" error={errors.purpose} hint={isMaterial ? t('mat.itemHint') : undefined}>
          <Input value={purpose} onChange={(e) => typeItem(e.target.value)} autoComplete="off" list={isMaterial ? 'material-items' : undefined} />
        </Field>
        {isMaterial && (
          <datalist id="material-items">
            {items.map((i) => (
              <option key={i.id} value={i.purpose} />
            ))}
          </datalist>
        )}

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
            <Dropdown value={category} onChange={(e) => {
                touched.current.add('category')
                setCategory(e.target.value as Category)
              }}>
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

        {phaseNote && (
          <p
            role="status"
            className={cn(
              'flex items-start gap-2 text-sm sm:col-span-2',
              phaseNote.tone === 'danger' ? 'font-semibold text-danger' : phaseNote.tone === 'warning' ? 'font-semibold text-warning' : 'text-muted-foreground',
            )}
          >
            {(phaseNote.tone === 'warning' || phaseNote.tone === 'danger') && <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
            <span>{phaseNote.text}</span>
          </p>
        )}

        {isMaterial && (
          <div className="grid grid-cols-2 gap-4 sm:col-span-2 sm:grid-cols-3">
            <Field label={t('mat.quantity')} htmlFor="quantity" error={errors.quantity}>
              <Input className="tabular" inputMode="decimal" autoComplete="off" value={quantity} onChange={(e) => entry('quantity', e.target.value)} />
            </Field>
            <Field label={t('mat.unit')} htmlFor="unit">
              <Dropdown
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value as MaterialUnit)
                  setUnitChosen(true)
                }}
              >
                {MATERIAL_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t(`unit.${u}` as Key)}
                  </option>
                ))}
              </Dropdown>
            </Field>
            <Field label={t('mat.rate')} htmlFor="rate" hint={byRate ? t('mat.rateHintTyped') : rate ? t('mat.rateHint') : undefined} className="col-span-2 sm:col-span-1">
              <Input className="tabular" inputMode="decimal" autoComplete="off" value={rate} onChange={(e) => entry('rate', e.target.value)} />
            </Field>
            {lastBought && (
              <p className="col-span-2 text-sm text-muted-foreground sm:col-span-3">
                {(() => {
                  const who = lastBought.vendorId ? vendorLabel.get(lastBought.vendorId) : lastBought.payeeName
                  const args = { rate: moneyRate(rateOf(lastBought)), unit: t(`unit.${lastBought.unit}` as Key), date: formatDate(lastBought.date, lang), who: who ?? '' }
                  return who ? t('mat.lastBoughtFrom', args) : t('mat.lastBought', args)
                })()}
              </p>
            )}
          </div>
        )}

        <Field label={`${isMaterial ? t('mat.supplier') : t('pay.vendor')} (${t('common.optional')})`}>
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

        {vendorId && vendorLast && (
          <div className="grid gap-2 text-sm sm:col-span-2">
            <p className="text-muted-foreground">
              {t('pay.lastTo', { name: vendorName ?? '', item: vendorLast.purpose, amount: money(vendorLast.amount), date: formatDate(vendorLast.date, lang) })}
              {filled.length > 0 && !edit && <> {t('pay.filledFrom', { what: filled.join(' · ') })}</>}
            </p>
            {suggestedPhase && (
              <Button type="button" size="sm" variant="secondary" className="h-auto w-fit max-w-full py-1.5 text-start whitespace-normal" onClick={() => setPhaseId(suggestedPhase.id)}>
                {t('pay.usePhase', { name: phaseName(suggestedPhase) })}
              </Button>
            )}
          </div>
        )}
        {double && (
          <div role="status" className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm font-semibold text-warning sm:col-span-2">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{t('pay.maybeDouble', { name: vendorName ?? '', amount: money(double.amount), item: double.purpose, date: formatDate(double.date, lang) })}</span>
          </div>
        )}

        {!vendorId && (
          <Field label={`${isMaterial ? t('mat.shopName') : t('pay.payee')} (${t('common.optional')})`}>
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
            <PillRadioGroup aria-labelledby={labelId} value={paidBy} onValueChange={(v) => {
              touched.current.add('paidBy')
              setPaidBy(v as Role)
            }}>
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
        <FileDropzone accept="image/*,video/*" maxBytes={MAX_ATTACHMENT_BYTES} multiple icon={ImagePlus} browseLabel={t('pay.addReceipt')} instruction={t('drop.media')} hint={t('pay.attachHint')} onFiles={addFiles}>
          {(visibleExisting.length > 0 || newFiles.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {visibleExisting.map((a) => (
                <StoredReceipt key={a.id} attachment={a} label={t('pay.removePhoto')} onRemove={() => setRemoved((r) => [...r, a.id])} />
              ))}
              {newFiles.map((f) => (
                <FileThumb key={f.key} blob={f.blob} removeLabel={t('pay.removePhoto')} onRemove={() => setNewFiles((xs) => xs.filter((x) => x.key !== f.key))} />
              ))}
            </div>
          )}
        </FileDropzone>
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
        {/* Beside the form where there is room; hidden on a phone, where the page is one column and the form needs the space. */}
        <RecentPayments
          payments={payments}
          vendorNames={vendorLabel}
          excludeId={id}
          vendorId={vendorId}
          className="hidden @4xl:grid @4xl:sticky @4xl:top-[var(--page-gap)]"
        />
      </div>
    </div>
  )
}
