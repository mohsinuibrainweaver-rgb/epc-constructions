import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, HardHat, Landmark, Wallet } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { StatusPill } from '@/components/common'
import { PhaseIcon } from '@/components/PhaseIcon'
import { ariaSort, SortButton } from '@/components/SortButton'
import { nextSort, sortRows, type SortState } from '@/lib/sort'
import { colourMap } from '@/lib/avatarColours'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePhases, useVendors } from '@/db/hooks'
import type { Payment } from '@/db/types'
import type { Key } from '@/i18n/en'
import { bankLine } from '@/lib/bank'
import { addDays, formatDate, money, moneyRate, todayISO } from '@/lib/format'
import { hasQuantity, num, rateOf } from '@/lib/materials'

type Col = 'date' | 'purpose' | 'phase' | 'mode' | 'paidBy' | 'amount' | 'status'

/** Where a payment stands, as a number, so the Status column sorts by how much attention it needs: waiting for approval first, paid and skipped last. */
function statusRank(p: Payment, today: string): number {
  if (p.approval === 'pending') return 0
  if (p.approval === 'rejected') return 1
  if (p.status === 'planned') return p.date < today ? 2 : p.date <= addDays(today, 3) ? 3 : 4
  if (p.status === 'advance') return 5
  if (p.status === 'paid') return 6
  return 7
}

/** Cash or bank transfer, with an icon so the two are told apart at a glance (the words stay, so it never relies on the icon alone). */
function ModeIcon({ mode }: { mode: Payment['mode'] }) {
  const Icon = mode === 'cash' ? Banknote : Landmark
  return <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
}

/** Who paid: the investor (a wallet) or the builder (a hard hat). Words always come with it. */
function PaidBy({ role, label }: { role: Payment['paidBy']; label: string }) {
  const Icon = role === 'builder' ? HardHat : Wallet
  return (
    <span className="inline-flex items-center gap-2">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      {label}
    </span>
  )
}

/**
 * A real table when the space is wide, and a list of cards when it is narrow. Both are driven by the
 * container's width (container query), so they also work inside a side panel or a dialog.
 */
export function PaymentsTable({ payments, showPhase = true }: { payments: Payment[]; showPhase?: boolean }) {
  const { t, lang, project, phaseName } = useApp()
  const vendors = useVendors(project?.id)
  const phases = usePhases(project?.id)
  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors])
  const phaseMap = useMemo(() => new Map(phases.map((p) => [p.id, phaseName(p)])), [phases, phaseName])
  const phaseById = useMemo(() => new Map(phases.map((p) => [p.id, p])), [phases])
  // The same colour a phase has on the Phases page: worked out once from the phases in their order.
  const phaseColour = useMemo(() => colourMap(phases.map((p) => p.id)), [phases])

  // Click a heading to sort by it (again for the other way, a third time for the order the page gave). Sorting happens here, in the browser.
  const [sort, setSort] = useState<SortState<Col>>(null)
  const onSort = (k: Col) => setSort((cur) => nextSort(cur, k))
  const rows = useMemo(() => {
    const today = todayISO()
    return sortRows(
      payments,
      sort,
      (p, k) => {
        switch (k) {
          case 'date':
            return p.date
          case 'purpose':
            return p.purpose
          case 'phase':
            return (p.phaseId && phaseMap.get(p.phaseId)) || ''
          case 'mode':
            return t(p.mode === 'cash' ? 'mode.cash' : 'mode.bank')
          case 'paidBy':
            return t(`paidBy.${p.paidBy}` as Key)
          case 'amount':
            return p.amount
          case 'status':
            return statusRank(p, today)
        }
      },
      lang,
    )
  }, [payments, sort, phaseMap, t, lang])

  const who = (p: Payment) => (p.vendorId && vendorMap.get(p.vendorId)) || p.payeeName || ''
  // Under the purpose: the kind of miscellaneous cost, or for a material purchase how much was bought and at what rate.
  const sub = (p: Payment) =>
    p.category === 'misc' && p.miscType
      ? t(`misc.${p.miscType}` as Key)
      : hasQuantity(p)
        ? t('mat.at', { qty: num(p.quantity), unit: t(`unit.${p.unit}` as Key), rate: moneyRate(rateOf(p)) })
        : ''

  return (
    <div className="@container">
      <div className="@max-[40rem]:hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead aria-sort={ariaSort(sort, 'date')}>
                <SortButton k="date" sort={sort} onSort={onSort}>{t('ledger.date')}</SortButton>
              </TableHead>
              <TableHead aria-sort={ariaSort(sort, 'purpose')}>
                <SortButton k="purpose" sort={sort} onSort={onSort}>{t('ledger.purpose')}</SortButton>
              </TableHead>
              {showPhase && (
                <TableHead aria-sort={ariaSort(sort, 'phase')}>
                  <SortButton k="phase" sort={sort} onSort={onSort}>{t('ledger.phase')}</SortButton>
                </TableHead>
              )}
              <TableHead aria-sort={ariaSort(sort, 'mode')}>
                <SortButton k="mode" sort={sort} onSort={onSort}>{t('ledger.mode')}</SortButton>
              </TableHead>
              <TableHead aria-sort={ariaSort(sort, 'paidBy')}>
                <SortButton k="paidBy" sort={sort} onSort={onSort}>{t('pay.paidBy')}</SortButton>
              </TableHead>
              <TableHead className="text-end" aria-sort={ariaSort(sort, 'amount')}>
                <SortButton k="amount" sort={sort} onSort={onSort} end>{t('ledger.amount')}</SortButton>
              </TableHead>
              <TableHead aria-sort={ariaSort(sort, 'status')}>
                <SortButton k="status" sort={sort} onSort={onSort}>{t('ledger.status')}</SortButton>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} className="transition-colors">
                <TableCell className="tabular whitespace-nowrap">{formatDate(p.date, lang)}</TableCell>
                <TableCell className="whitespace-normal">
                  <Link to={`/payments/${p.id}`} className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline">
                    {p.purpose}
                  </Link>
                  {who(p) && <div className="text-sm text-muted-foreground">{who(p)}</div>}
                  {sub(p) && <div className="text-sm text-muted-foreground">{sub(p)}</div>}
                </TableCell>
                {showPhase && (
                  <TableCell>
                    {p.phaseId && phaseMap.get(p.phaseId) ? (
                      <span className="inline-flex items-center gap-2.5">
                        <PhaseIcon phase={phaseById.get(p.phaseId)!} colour={phaseColour.get(p.phaseId)} />
                        {phaseMap.get(p.phaseId)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <ModeIcon mode={p.mode} />
                    {t(p.mode === 'cash' ? 'mode.cash' : 'mode.bank')}
                  </span>
                  {p.mode === 'bank' && bankLine(p) && <div className="ps-6 text-sm text-muted-foreground">{bankLine(p)}</div>}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <PaidBy role={p.paidBy} label={t(`paidBy.${p.paidBy}` as Key)} />
                </TableCell>
                <TableCell className="tabular text-end font-bold whitespace-nowrap">{money(p.amount)}</TableCell>
                <TableCell>
                  <StatusPill payment={p} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="hidden divide-y @max-[40rem]:block">
        {rows.map((p) => (
          <li key={p.id}>
            <Link to={`/payments/${p.id}`} className="grid gap-1.5 px-4 py-3 transition-colors hover:bg-accent">
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold">{p.purpose}</span>
                <span className="tabular font-bold whitespace-nowrap">{money(p.amount)}</span>
              </div>
              {(who(p) || sub(p)) && <div className="text-sm text-muted-foreground">{[who(p), sub(p)].filter(Boolean).join(' · ')}</div>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="tabular">{formatDate(p.date, lang)}</span>
                {showPhase && p.phaseId && phaseMap.get(p.phaseId) && (
                  <span className="inline-flex items-center gap-1.5">
                    <PhaseIcon phase={phaseById.get(p.phaseId)!} colour={phaseColour.get(p.phaseId)} className="size-6" />
                    {phaseMap.get(p.phaseId)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <ModeIcon mode={p.mode} />
                  {[t(p.mode === 'cash' ? 'mode.cash' : 'mode.bank'), p.mode === 'bank' ? bankLine(p) : ''].filter(Boolean).join(' · ')}
                </span>
                <PaidBy role={p.paidBy} label={`${t('pay.paidBy')}: ${t(`paidBy.${p.paidBy}` as Key)}`} />
                <StatusPill payment={p} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
