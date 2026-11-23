import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, HardHat, Landmark, ReceiptText, Wallet } from 'lucide-react'
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
import { cn } from '@/lib/utils'

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
function PaidBy({ role, label }: { role: Payment['paidBy']; label: React.ReactNode }) {
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
 * `compact` is for a glance (the Home screen): when narrow, a payment is one short line and the list stops at five.
 */
export function PaymentsTable({ payments, showPhase = true, compact = false }: { payments: Payment[]; showPhase?: boolean; compact?: boolean }) {
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

      {/* Narrow screens: one roomy card per payment. Top: phase icon, then phase name, purpose and vendor, with the amount and status at
          the end. Underneath, one quiet line of facts (date, mode, who paid). Everything is at least 14px and the whole row is the tap target. */}
      <ul className={cn('hidden divide-y @max-[40rem]:block', compact && '[&>li:nth-child(n+6)]:hidden')}>
        {rows.map((p) => {
          const phase = showPhase && p.phaseId ? phaseById.get(p.phaseId) : undefined
          const phaseName = phase && p.phaseId ? phaseMap.get(p.phaseId) : undefined
          const line = [who(p), sub(p)].filter(Boolean).join(' · ')
          if (compact) {
            // Paid (and approved) is the usual case and needs no label; anything else (waiting, turned down, an advance) is marked.
            const plain = p.status === 'paid' && (!p.approval || p.approval === 'approved')
            return (
              <li key={p.id}>
                <Link to={`/payments/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent active:bg-accent">
                  {phase ? (
                    <PhaseIcon phase={phase} colour={phaseColour.get(p.phaseId!)} className="size-9 rounded-xl [&>svg]:size-[1.125rem]" />
                  ) : (
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                      <ReceiptText className="size-[1.125rem]" />
                    </span>
                  )}
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className="line-clamp-2 leading-snug font-semibold [overflow-wrap:anywhere]">{p.purpose}</span>
                    <span className="truncate text-sm text-muted-foreground">{[formatDate(p.date, lang), phaseName ?? who(p)].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="grid shrink-0 justify-items-end gap-1">
                    <span className="tabular leading-snug font-bold whitespace-nowrap">{money(p.amount)}</span>
                    {!plain && <StatusPill payment={p} />}
                  </div>
                </Link>
              </li>
            )
          }
          return (
            <li key={p.id}>
              <Link to={`/payments/${p.id}`} className="grid gap-2 px-4 py-3 transition-colors hover:bg-accent active:bg-accent">
                <div className="flex items-start gap-3">
                  {phase && <PhaseIcon phase={phase} colour={phaseColour.get(p.phaseId!)} className="size-10 rounded-xl [&>svg]:size-5" />}
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    {phaseName && <span className="text-xs font-medium tracking-wide text-muted-foreground">{phaseName}</span>}
                    <span className="leading-snug font-semibold [overflow-wrap:anywhere]">{p.purpose}</span>
                    {line && <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{line}</span>}
                  </div>
                  <div className="grid shrink-0 justify-items-end gap-2">
                    <span className="tabular leading-snug font-bold whitespace-nowrap">{money(p.amount)}</span>
                    <StatusPill payment={p} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-dashed pt-2 text-sm text-muted-foreground">
                  <span className="tabular">{formatDate(p.date, lang)}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <ModeIcon mode={p.mode} />
                    {[t(p.mode === 'cash' ? 'mode.cash' : 'mode.bank'), p.mode === 'bank' ? bankLine(p) : ''].filter(Boolean).join(' · ')}
                  </span>
                  <PaidBy
                    role={p.paidBy}
                    label={
                      <>
                        <span className="sr-only">{`${t('pay.paidBy')}: `}</span>
                        {t(`paidBy.${p.paidBy}` as Key)}
                      </>
                    }
                  />
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
