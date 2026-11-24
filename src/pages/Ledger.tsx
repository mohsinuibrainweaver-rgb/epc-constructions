import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, ReceiptText, Search, SearchX, SlidersHorizontal, X } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Dialog, EmptyState, PageHeader } from '@/components/common'
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
  const { t, lang, project, phaseName, can } = useApp()
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

  // Filters in use (not the search words). On a phone they sit behind one button, so the payments are on the first screen; arriving with
  // a filter already set (from Home) opens them, so what is applied is visible.
  const activeFilters = [phase, vendor, category, status, mode, month, approval, missing].filter(Boolean).length
  // On a phone the filters open in a bottom sheet (live: the list behind it updates as you choose; "Show N payments" closes it).
  const [sheet, setSheet] = useState(false)

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
        p.mode === 'bank' && can('viewBankDetails') ? (p.bankName ?? '') : '',
        p.mode === 'bank' && can('viewBankDetails') ? (p.bankAccount ?? '') : '',
        p.mode === 'bank' && can('viewBankDetails') ? (p.bankRef ?? '') : '',
      ]
        .map(csvEscape)
        .join(','),
    )
    download(`${project?.name ?? 'ledger'}.csv`, '﻿' + [head.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8')
  }

  const all = t('common.all')

  const sortDropdown = (className: string) => (
    <Dropdown aria-label={t('ledger.sort')} value={sort} onChange={(e) => setSort(e.target.value as LedgerSort)} className={className}>
      {LEDGER_SORTS.map((s) => (
        <option key={s} value={s}>
          {t(`ledger.sort.${s}` as Key)}
        </option>
      ))}
    </Dropdown>
  )

  const filterFields = (
    <>
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
    </>
  )

  // What is switched on, as removable chips under the search box (phone). Each says which filter it is and what it is set to.
  const chips: { key: string; label: string; clear: () => void }[] = [
    phase && { key: 'phase', label: `${t('ledger.phase')}: ${phaseName(phases.find((p) => p.id === phase)!)}`, clear: () => setPhase('') },
    vendor && { key: 'vendor', label: `${t('ledger.vendor')}: ${vendorName.get(vendor) ?? ''}`, clear: () => setVendor('') },
    category && { key: 'category', label: `${t('ledger.category')}: ${t(`cat.${category}` as Key)}`, clear: () => setCategory('') },
    status && { key: 'status', label: `${t('ledger.status')}: ${t(`status.${status}` as Key)}`, clear: () => setStatus('') },
    mode && { key: 'mode', label: `${t('ledger.mode')}: ${t(mode === 'cash' ? 'mode.cash' : 'mode.bank')}`, clear: () => setMode('') },
    approval && { key: 'approval', label: `${t('ledger.approval')}: ${t(`approval.${approval}` as Key)}`, clear: () => setApproval('') },
    missing && { key: 'missing', label: `${t('ledger.missing')}: ${t(`ledger.missing.${missing}` as Key)}`, clear: () => setMissing('') },
    month && { key: 'month', label: `${t('ledger.month')}: ${formatMonth(month, lang)}`, clear: () => setMonth('') },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[]

  return (
    <div className="grid gap-6 max-sm:gap-2.5">
      <PageHeader
        title={t('ledger.title')}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download aria-hidden="true" />
            {t('common.export')}
          </Button>
        }
      />

      <Card className="p-4 max-sm:border-0 max-sm:bg-transparent max-sm:bg-none max-sm:p-0 max-sm:shadow-none">
        <div role="search" aria-label={t('ledger.filtersLabel')} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="col-span-full flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute inset-s-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted-foreground" />
              <label className="sr-only" htmlFor="lq">
                {t('common.search')}
              </label>
              <Input id="lq" type="search" enterKeyHint="search" className="ps-10" placeholder={t('ledger.search')} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {/* Phone only: from a small tablet up there is room for every filter at once. */}
            <Button
              type="button"
              variant="outline"
              className="shrink-0 px-3 max-sm:h-11 sm:hidden"
              aria-haspopup="dialog"
              aria-label={activeFilters > 0 ? `${t('ledger.filters')}: ${t('ledger.filtersOn', { count: activeFilters })}` : t('ledger.filters')}
              onClick={() => setSheet(true)}
            >
              <SlidersHorizontal aria-hidden="true" />
              {t('ledger.filters')}
              {activeFilters > 0 && (
                <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {activeFilters}
                </span>
              )}
            </Button>
          </div>
          {chips.length > 0 && (
            <ul aria-label={t('ledger.filters')} className="col-span-full flex gap-2 overflow-x-auto pb-0.5 sm:hidden">
              {chips.map((c) => (
                <li key={c.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={c.clear}
                    aria-label={t('ledger.removeFilter', { name: c.label })}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-background py-1 ps-3 pe-2 text-sm font-medium active:bg-accent"
                  >
                    {c.label}
                    <X aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div id="ledger-filters" className="max-sm:hidden sm:contents">
            {filterFields}
          </div>
        </div>
      </Card>

      <Dialog
        open={sheet}
        title={t('ledger.filtersAndSort')}
        onClose={() => setSheet(false)}
        footer={
          <>
            {activeFilters > 0 && (
              <Button type="button" variant="ghost" onClick={clearFilters}>
                {t('ledger.clearFilters')}
              </Button>
            )}
            <Button type="button" onClick={() => setSheet(false)}>
              {t('ledger.showResults', { count: rows.length })}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <span className="text-sm font-semibold">{t('ledger.sort')}</span>
            {sortDropdown('w-full')}
          </div>
          {filterFields}
        </div>
      </Dialog>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-muted-foreground max-sm:text-sm" role="status" aria-live="polite">
          <span>{t(totals.count === 1 ? 'ledger.shownOne' : 'ledger.shown', { count: totals.count, total: money(totals.paid) })}</span>
          {totals.planned > 0 && <span>{t('ledger.plannedSum', { total: money(totals.planned) })}</span>}
          {totals.awaiting > 0 && <span>{t('ledger.awaitingSum', { total: money(totals.awaiting) })}</span>}
          {sort !== 'newest' && <span className="sm:hidden">{t(`ledger.sort.${sort}` as Key)}</span>}
        </p>
        <div className="max-sm:hidden">{sortDropdown('w-auto min-w-44')}</div>
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
          <PaymentsTable payments={rows} showAttachments />
        )}
      </Card>
    </div>
  )
}
