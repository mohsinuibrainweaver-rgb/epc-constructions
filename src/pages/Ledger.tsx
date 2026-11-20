import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, ReceiptText, Search, SearchX } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { EmptyState, PageHeader } from '@/components/common'
import { PaymentsTable } from '@/components/PaymentsTable'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { usePayments, usePhases, useReceiptIds, useVendors } from '@/db/hooks'
import { CATEGORIES, type Approval, type Category, type PayMode, type PayStatus } from '@/db/types'
import type { Key } from '@/i18n/en'
import { isMissing, MISSING, type Missing } from '@/lib/attention'
import { csvEscape, download, formatMonth, money, monthKey } from '@/lib/format'
import { ledgerTotals, LEDGER_SORTS, sortPayments, type LedgerSort } from '@/lib/ledger'

export function Ledger() {
  const { t, lang, project, phaseName } = useApp()
  const [sp] = useSearchParams()
  const payments = usePayments(project?.id).filter((p) => !p.deletedAt)
  const phases = usePhases(project?.id)
  const vendors = useVendors(project?.id)
  const receiptIds = useReceiptIds(project?.id)

  const [q, setQ] = useState(sp.get('q') ?? '')
  // Payments that lack something (Home lists them under "Needs your attention"): no receipt photo, no vendor or payee, no bank details.
  const [missing, setMissing] = useState<'' | Missing>(((): '' | Missing => {
    const m = sp.get('missing')
    return (MISSING as string[]).includes(m ?? '') ? (m as Missing) : ''
  })())
  const [sort, setSort] = useState<LedgerSort>('newest')
  const [phase, setPhase] = useState('')
  const [vendor, setVendor] = useState('')
  const [category, setCategory] = useState<'' | Category>('')
  const [status, setStatus] = useState<'' | PayStatus>(((): '' | PayStatus => {
    const s = sp.get('status')
    return s === 'paid' || s === 'planned' || s === 'advance' || s === 'skipped' ? s : ''
  })())
  const [mode, setMode] = useState<'' | PayMode>('')
  const [month, setMonth] = useState('')
  const [approval, setApproval] = useState<'' | Approval>(((): '' | Approval => {
    const a = sp.get('approval')
    return a === 'pending' || a === 'rejected' || a === 'approved' ? a : ''
  })())

  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors])
  const months = useMemo(() => [...new Set(payments.map((p) => monthKey(p.date)))].sort().reverse(), [payments])

  const filtered = payments.filter((p) => {
    if (phase && p.phaseId !== phase) return false
    if (vendor && p.vendorId !== vendor) return false
    if (category && p.category !== category) return false
    if (status && p.status !== status) return false
    if (mode && p.mode !== mode) return false
    if (month && monthKey(p.date) !== month) return false
    if (approval && p.approval !== approval) return false
    if (missing && !isMissing(missing, p, receiptIds ?? new Set())) return false
    const needle = q.trim().toLowerCase()
    if (needle) {
      const hay = `${p.purpose} ${p.note ?? ''} ${p.payeeName ?? ''} ${(p.vendorId && vendorName.get(p.vendorId)) || ''}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
  const rows = sortPayments(filtered, sort)
  const totals = ledgerTotals(rows)

  const clearFilters = () => {
    setQ('')
    setPhase('')
    setVendor('')
    setCategory('')
    setStatus('')
    setMode('')
    setMonth('')
    setApproval('')
    setMissing('')
  }

  const exportCsv = () => {
    const phaseMap = new Map(phases.map((p) => [p.id, phaseName(p)]))
    // The bank columns come last, so the columns people already use keep their places.
    const head = ['date', 'purpose', 'vendor', 'phase', 'category', 'type', 'status', 'mode', 'paid_by', 'approval', 'amount', 'note', 'bank_name', 'bank_account', 'bank_ref']
    const lines = rows.map((p) =>
      [
        p.date,
        p.purpose,
        (p.vendorId && vendorName.get(p.vendorId)) || p.payeeName || '',
        (p.phaseId && phaseMap.get(p.phaseId)) || '',
        p.category,
        p.miscType ?? '',
        p.status,
        p.mode,
        p.paidBy,
        p.approval ?? '',
        p.amount,
        p.note ?? '',
        p.mode === 'bank' ? (p.bankName ?? '') : '',
        p.mode === 'bank' ? (p.bankAccount ?? '') : '',
        p.mode === 'bank' ? (p.bankRef ?? '') : '',
      ]
        .map(csvEscape)
        .join(','),
    )
    download(`${project?.name ?? 'ledger'}.csv`, '﻿' + [head.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8')
  }

  const all = t('common.all')

  return (
    <>
      <PageHeader
        title={t('ledger.title')}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download aria-hidden="true" />
            {t('common.export')}
          </Button>
        }
      />

      <Card className="p-4">
        <div role="search" aria-label={t('ledger.filtersLabel')} className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
          <div className="relative col-span-full">
            <Search aria-hidden="true" className="pointer-events-none absolute inset-s-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted-foreground" />
            <label className="sr-only" htmlFor="lq">
              {t('common.search')}
            </label>
            <Input id="lq" type="search" className="ps-10" placeholder={t('ledger.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Dropdown aria-label={t('ledger.phase')} value={phase} onChange={(e) => setPhase(e.target.value)}>
            <option value="">{`${t('ledger.phase')}: ${all}`}</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {phaseName(p)}
              </option>
            ))}
          </Dropdown>
          <Dropdown aria-label={t('ledger.vendor')} value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">{`${t('ledger.vendor')}: ${all}`}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Dropdown>
          <Dropdown aria-label={t('ledger.category')} value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
            <option value="">{`${t('ledger.category')}: ${all}`}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`cat.${c}` as Key)}
              </option>
            ))}
          </Dropdown>
          <Dropdown aria-label={t('ledger.status')} value={status} onChange={(e) => setStatus(e.target.value as PayStatus | '')}>
            <option value="">{`${t('ledger.status')}: ${all}`}</option>
            {(['paid', 'planned', 'advance', 'skipped'] as PayStatus[]).map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}` as Key)}
              </option>
            ))}
          </Dropdown>
          <Dropdown aria-label={t('ledger.mode')} value={mode} onChange={(e) => setMode(e.target.value as PayMode | '')}>
            <option value="">{`${t('ledger.mode')}: ${all}`}</option>
            <option value="cash">{t('mode.cash')}</option>
            <option value="bank">{t('mode.bank')}</option>
          </Dropdown>
          <Dropdown aria-label={t('ledger.approval')} value={approval} onChange={(e) => setApproval(e.target.value as Approval | '')}>
            <option value="">{`${t('ledger.approval')}: ${all}`}</option>
            {(['pending', 'approved', 'rejected'] as Approval[]).map((a) => (
              <option key={a} value={a}>
                {t(`approval.${a}` as Key)}
              </option>
            ))}
          </Dropdown>
          <Dropdown aria-label={t('ledger.missing')} value={missing} onChange={(e) => setMissing(e.target.value as Missing | '')}>
            <option value="">{`${t('ledger.missing')}: ${all}`}</option>
            {MISSING.map((m) => (
              <option key={m} value={m}>
                {t(`ledger.missing.${m}` as Key)}
              </option>
            ))}
          </Dropdown>
          <Dropdown aria-label={t('ledger.month')} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">{`${t('ledger.month')}: ${all}`}</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m, lang)}
              </option>
            ))}
          </Dropdown>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-muted-foreground" role="status" aria-live="polite">
          <span>{t(totals.count === 1 ? 'ledger.shownOne' : 'ledger.shown', { count: totals.count, total: money(totals.paid) })}</span>
          {totals.planned > 0 && <span>{t('ledger.plannedSum', { total: money(totals.planned) })}</span>}
          {totals.awaiting > 0 && <span>{t('ledger.awaitingSum', { total: money(totals.awaiting) })}</span>}
        </p>
        <Dropdown aria-label={t('ledger.sort')} value={sort} onChange={(e) => setSort(e.target.value as LedgerSort)} className="w-auto min-w-44">
          {LEDGER_SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`ledger.sort.${s}` as Key)}
            </option>
          ))}
        </Dropdown>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {rows.length === 0 ? (
          payments.length === 0 ? (
            <EmptyState icon={ReceiptText} title={t('ledger.emptyAll')} body={t('ledger.emptyAllBody')} />
          ) : (
            <EmptyState
              icon={SearchX}
              title={t('ledger.empty')}
              body={t('ledger.noMatchBody')}
              action={
                <Button variant="outline" onClick={clearFilters}>
                  {t('ledger.clearFilters')}
                </Button>
              }
            />
          )
        ) : (
          <PaymentsTable payments={rows} />
        )}
      </Card>
    </>
  )
}
