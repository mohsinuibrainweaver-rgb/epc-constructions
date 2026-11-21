import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '@/app/AppContext'
import { StatusPill } from '@/components/common'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePhases, useVendors } from '@/db/hooks'
import type { Payment } from '@/db/types'
import type { Key } from '@/i18n/en'
import { bankLine } from '@/lib/bank'
import { formatDate, money, moneyRate } from '@/lib/format'
import { hasQuantity, num, rateOf } from '@/lib/materials'

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
              <TableHead>{t('ledger.date')}</TableHead>
              <TableHead>{t('ledger.purpose')}</TableHead>
              {showPhase && <TableHead>{t('ledger.phase')}</TableHead>}
              <TableHead>{t('ledger.mode')}</TableHead>
              <TableHead className="text-end">{t('ledger.amount')}</TableHead>
              <TableHead>{t('ledger.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id} className="transition-colors">
                <TableCell className="tabular whitespace-nowrap">{formatDate(p.date, lang)}</TableCell>
                <TableCell className="whitespace-normal">
                  <Link to={`/payments/${p.id}`} className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline">
                    {p.purpose}
                  </Link>
                  {who(p) && <div className="text-sm text-muted-foreground">{who(p)}</div>}
                  {sub(p) && <div className="text-sm text-muted-foreground">{sub(p)}</div>}
                </TableCell>
                {showPhase && <TableCell>{(p.phaseId && phaseMap.get(p.phaseId)) || '—'}</TableCell>}
                <TableCell>
                  {t(p.mode === 'cash' ? 'mode.cash' : 'mode.bank')}
                  {p.mode === 'bank' && bankLine(p) && <div className="text-sm text-muted-foreground">{bankLine(p)}</div>}
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
        {payments.map((p) => (
          <li key={p.id}>
            <Link to={`/payments/${p.id}`} className="grid gap-1.5 px-4 py-3 transition-colors hover:bg-accent">
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold">{p.purpose}</span>
                <span className="tabular font-bold whitespace-nowrap">{money(p.amount)}</span>
              </div>
              {(who(p) || sub(p)) && <div className="text-sm text-muted-foreground">{[who(p), sub(p)].filter(Boolean).join(' · ')}</div>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="tabular">{formatDate(p.date, lang)}</span>
                {showPhase && p.phaseId && phaseMap.get(p.phaseId) && <span>{phaseMap.get(p.phaseId)}</span>}
                <span>{[t(p.mode === 'cash' ? 'mode.cash' : 'mode.bank'), p.mode === 'bank' ? bankLine(p) : ''].filter(Boolean).join(' · ')}</span>
                <StatusPill payment={p} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
