import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field, GroupField } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Dropdown } from '@/components/ui/dropdown'
import { Input } from '@/components/ui/input'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { planInstalments } from '@/db/actions'
import { CATEGORIES, type Category, type Contract, type PayMode, type Payment } from '@/db/types'
import type { Key } from '@/i18n/en'
import { addDays, formatDate, groupDigits, money, parseAmount, todayISO } from '@/lib/format'
import { EVERY, firstInstalmentDay, proposeInstalments, type Every, type InstalmentRow } from '@/lib/schedule'
import { memberLabel } from '@/lib/members'

const MAX_COUNT = 12

/** The category most of a contract's payments use, so planned instalments start out like the ones already made. */
function usualCategory(payments: Payment[]): Category {
  const n = new Map<Category, number>()
  for (const p of payments) n.set(p.category, (n.get(p.category) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'labour'
}

/**
 * Plans what is left on a contract as dated payments. Choose how many, when the first is and how far apart; the amount is split for
 * you and every date and amount can still be changed before saving. They are created as planned payments linked to the contract.
 */
export function InstalmentsDialog({
  open,
  contract,
  unplanned,
  payments,
  onClose,
}: {
  open: boolean
  contract: Contract
  /** What is left on the contract with no day yet: the amount that is offered to split. */
  unplanned: number
  /** The contract's own payments, for numbering the instalments and choosing a usual category. */
  payments: Payment[]
  onClose: () => void
}) {
  const { t, lang, settings, project, userId, membersOf } = useApp()
  const members = membersOf(project?.id)
  const toast = useToast()
  // One payment (the usual) or several in instalments.
  const [kind, setKind] = useState<'one' | 'several'>('one')
  const [count, setCount] = useState(4)
  const [total, setTotal] = useState('')
  const [first, setFirst] = useState(todayISO())
  const [every, setEvery] = useState<Every>('month')
  const [category, setCategory] = useState<Category>('labour')
  const [mode, setMode] = useState<PayMode>('cash')
  const [paidBy, setPaidBy] = useState(userId ?? settings.role)
  const [rows, setRows] = useState<InstalmentRow[]>([])
  const [error, setError] = useState('')

  const firstNumber = useMemo(() => payments.filter((p) => !p.deletedAt && p.status !== 'skipped').length + 1, [payments])
  // The latest day already on this contract: new instalments should come after it.
  const latest = useMemo(() => payments.filter((p) => !p.deletedAt && p.status !== 'skipped').map((p) => p.date).sort().pop(), [payments])

  // Opening: the offer is the money with no day, in four monthly parts starting next week.
  useEffect(() => {
    if (!open) return
    setKind('one')
    setCount(unplanned >= 400000 ? 4 : unplanned >= 100000 ? 3 : 2)
    setTotal(groupDigits(String(Math.round(unplanned))))
    setFirst(addDays(todayISO(), 7))
    setEvery('month')
    setCategory(usualCategory(payments))
    setMode(payments.find((p) => !p.deletedAt)?.mode ?? 'cash')
    setPaidBy(userId ?? settings.role)
    setError('')
  }, [open, unplanned, payments, settings.role, userId, latest])

  // The rows follow the choices above; once a row is edited by hand they stay until a choice above changes again.
  useEffect(() => {
    if (!open) return
    setRows(proposeInstalments(parseAmount(total), kind === 'one' ? 1 : count, first || todayISO(), every))
  }, [open, total, kind, count, first, every])

  const sum = rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0)
  const over = sum - unplanned
  const planned = rows.filter((r) => r.amount > 0).length
  // Some new day is earlier than a payment already on the contract: the numbers ("instalment 3") would then not follow the days.
  const earlier = kind === 'several' && latest !== undefined && rows.some((r) => r.amount > 0 && r.date && r.date < latest)

  const save = async () => {
    if (rows.some((r) => !r.date)) {
      setError(t('pay.errDate'))
      return
    }
    if (sum <= 0) {
      setError(t('contract.errAmount'))
      return
    }
    const n = await planInstalments(contract, rows, {
      category,
      mode,
      paidBy,
      addedBy: settings.userName || settings.role,
      firstNumber,
      // One payment is just that; several are numbered.
      purpose: (i) => (rows.filter((r) => r.amount > 0).length === 1 ? t('contract.singlePurpose', { title: contract.title }) : t('contract.instalmentPurpose', { title: contract.title, n: i })),
    })
    toast.show({ kind: 'success', message: t(n === 1 ? 'contract.instalmentsSavedOne' : 'contract.instalmentsSaved', { count: n }) })
    onClose()
  }

  const setRow = (i: number, patch: Partial<InstalmentRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  return (
    <Dialog
      open={open}
      title={t('contract.planTitle')}
      description={t('contract.planHint', { amount: money(unplanned) })}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void save()}>{t(planned === 1 ? 'contract.planSaveOne' : 'contract.planSave', { count: planned })}</Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <GroupField label={t('contract.planKind')}>
          {(labelId) => (
            <PillRadioGroup
              aria-labelledby={labelId}
              value={kind}
              onValueChange={(v) => {
                setKind(v as 'one' | 'several')
                setFirst(v === 'one' ? addDays(todayISO(), 7) : firstInstalmentDay(todayISO(), latest, every))
              }}
            >
              <PillRadioItem value="one">{t('contract.planOne')}</PillRadioItem>
              <PillRadioItem value="several">{t('contract.planSeveral')}</PillRadioItem>
            </PillRadioGroup>
          )}
        </GroupField>

        {kind === 'one' ? (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('contract.planAmount')}>
                <Input className="tabular" inputMode="numeric" value={total} onChange={(e) => setTotal(groupDigits(e.target.value))} autoComplete="off" />
              </Field>
              <Field label={t('contract.planDateOne')}>
                <Input type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
              </Field>
            </div>
            {over > 0 && (
              <p role="status" className="rounded-xl bg-warning-soft p-3 text-sm font-semibold text-warning">
                {t('contract.planOver', { amount: money(over) })}
              </p>
            )}
          </div>
        ) : (
          <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('contract.planAmount')}>
              <Input className="tabular" inputMode="numeric" value={total} onChange={(e) => setTotal(groupDigits(e.target.value))} autoComplete="off" />
            </Field>
            <Field label={t('contract.planCount')}>
              <Dropdown value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>
                {Array.from({ length: MAX_COUNT - 1 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Dropdown>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('contract.planFirst')}>
              <Input type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
            </Field>
            <GroupField label={t('contract.planEvery')}>
              {(labelId) => (
                <PillRadioGroup aria-labelledby={labelId} value={every} onValueChange={(v) => setEvery(v as Every)}>
                  {EVERY.map((e) => (
                    <PillRadioItem key={e} value={e}>
                      {t(`contract.every.${e}` as Key)}
                    </PillRadioItem>
                  ))}
                </PillRadioGroup>
              )}
            </GroupField>
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-semibold">{t('contract.planRows')}</p>
            <ul className="grid gap-2">
              {rows.map((r, i) => (
                <li key={i} className="grid grid-cols-[1.5rem_1fr_1fr] items-center gap-2">
                  <span className="tabular text-sm text-muted-foreground">{firstNumber + i}.</span>
                  <Input type="date" aria-label={`${t('contract.planDate')} ${firstNumber + i}`} value={r.date} onChange={(e) => setRow(i, { date: e.target.value })} />
                  <Input
                    className="tabular"
                    inputMode="numeric"
                    aria-label={`${t('contract.planAmount')} ${firstNumber + i}`}
                    value={r.amount ? groupDigits(String(r.amount)) : ''}
                    onChange={(e) => setRow(i, { amount: parseAmount(e.target.value) })}
                  />
                </li>
              ))}
            </ul>
            <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{t('common.total')}</span>
              <strong className="tabular">{money(sum)}</strong>
            </p>
            {earlier && latest && (
              <p role="status" className="rounded-xl bg-warning-soft p-3 text-sm font-semibold text-warning">
                {t('contract.planBefore', { date: formatDate(latest, lang) })}
              </p>
            )}
            {over > 0 && (
              <p role="status" className="rounded-xl bg-warning-soft p-3 text-sm font-semibold text-warning">
                {t('contract.planOver', { amount: money(over) })}
              </p>
            )}
            {over < 0 && sum > 0 && <p className="text-sm text-muted-foreground">{t('contract.planUnder', { amount: money(-over) })}</p>}
          </div>

          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('ledger.category')}>
            <Dropdown value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`cat.${c}` as Key)}
                </option>
              ))}
            </Dropdown>
          </Field>
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
        </div>
        <GroupField label={t('pay.paidBy')}>
          {(labelId) => (
            <PillRadioGroup aria-labelledby={labelId} value={paidBy} onValueChange={setPaidBy}>
              {(members.length ? members : [{ userId: userId ?? settings.role, name: settings.userName || undefined }]).map((member) => (
                <PillRadioItem key={member.userId} value={member.userId}>
                  {memberLabel(member)}
                </PillRadioItem>
              ))}
            </PillRadioGroup>
          )}
        </GroupField>
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}
