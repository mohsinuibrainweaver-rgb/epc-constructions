import { useMemo, useState } from 'react'
import { isAwaitingApproval, sum } from '@/lib/stats'
import { ArrowLeftRight, Banknote, Pencil, Percent, Plus, Printer, Scale, Trash2 } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { CardHeading, IconTile } from '@/components/CardHeading'
import { EmptyState, PageHeader } from '@/components/common'
import { FeeDialog } from '@/components/FeeDialog'
import { useToast } from '@/components/Toast'
import { TransferDialog } from '@/components/TransferDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { deleteTransfer, restoreTransfer } from '@/db/actions'
import { usePayments, usePhases, useTransfers } from '@/db/hooks'
import type { Transfer } from '@/db/types'
import type { Key } from '@/i18n/en'
import { formatDate, money, todayISO } from '@/lib/format'
import { computeSettlement } from '@/lib/settlement'

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 max-sm:py-1.5 max-sm:text-[0.9375rem]">
      <dt className={strong ? 'font-bold' : 'text-muted-foreground'}>{label}</dt>
      <dd className={`tabular whitespace-nowrap ${strong ? 'text-lg font-extrabold max-sm:text-base' : 'font-semibold'}`}>{value}</dd>
    </div>
  )
}

export function Settlement() {
  const { t, lang, project, phaseName, can } = useApp()
  const toast = useToast()
  const phases = usePhases(project?.id)
  const payments = usePayments(project?.id).filter((p) => !p.deletedAt)
  const transfers = useTransfers(project?.id).filter((x) => !x.deletedAt)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Transfer>()
  const [feeOpen, setFeeOpen] = useState(false)

  const s = useMemo(() => (project ? computeSettlement(project, payments, transfers, phases, todayISO()) : undefined), [project, payments, transfers, phases])
  const pendingTotal = sum(payments.filter(isAwaitingApproval))
  if (!project || !s) return null

  const balanceMsg =
    s.builderBalance > 0
      ? t('stl.balancePos', { amount: money(s.builderBalance) })
      : s.builderBalance < 0
        ? t('stl.balanceNeg', { amount: money(-s.builderBalance) })
        : t('stl.balanceZero')
  const totalMsg =
    s.totalDue > 0 ? t('stl.totalPos', { amount: money(s.totalDue) }) : s.totalDue < 0 ? t('stl.totalNeg', { amount: money(-s.totalDue) }) : t('stl.totalZero')

  const feeBasisText =
    s.feeBasis === 'fixed'
      ? t('stl.feeBasisFixed')
      : s.feeBasis === 'percent'
        ? t('stl.feeBasisPercent', { pct: project.feePercent ?? 0 })
        : s.feeBasis === 'perPhase'
          ? t('stl.feeBasisPerPhase')
          : s.feeBasis === 'retainer'
            ? t('stl.feeBasisRetainer', { amount: money(project.retainerAmount ?? 0) })
            : t('stl.feeTbd')
  const phaseLabel = new Map(phases.map((p) => [p.id, phaseName(p)]))

  return (
    <div className="grid gap-6 max-sm:gap-3">
      <PageHeader
        title={t('stl.title')}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {can('editTransfers') && (
              <Button variant="secondary" onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" />
                {t('stl.addTransfer')}
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden="true" />
              {t('stl.print')}
            </Button>
          </div>
        }
      />

      <p className="hidden text-sm text-muted-foreground print:block">
        {project.name} · {t('stl.statement')} · {t('stl.preparedOn', { date: formatDate(todayISO(), lang) })}
      </p>

      <div className="grid items-start gap-6 max-sm:gap-3 md:grid-cols-2">
        <Card className="max-sm:gap-3 max-sm:py-4">
          <CardHeader className="max-sm:px-4">
            <CardTitle className="flex min-w-0 items-center gap-2.5 text-lg max-sm:text-base"><IconTile icon={Scale} />{t('stl.balance')}</CardTitle>
          </CardHeader>
          <CardContent className="max-sm:px-4">
            <dl className="divide-y">
              <Row label={t('stl.cost')} value={money(s.constructionCost)} />
              <Row label={t('stl.paidByInvestor')} value={money(s.paidByInvestor)} />
              <Row label={t('stl.paidByBuilder')} value={money(s.paidByBuilder)} />
              <Row label={t('stl.advances')} value={money(s.advances)} />
              <Row label={t('stl.reimbursed')} value={money(s.reimbursed)} />
              <Row label={t('stl.returned')} value={money(s.returned)} />
            </dl>
            <p role="status" className="mt-3 rounded-xl bg-secondary p-3 font-semibold text-secondary-foreground max-sm:mt-2 max-sm:p-2.5 max-sm:text-[0.9375rem]">
              {balanceMsg}
            </p>
            {pendingTotal > 0 && <p className="mt-3 text-sm text-muted-foreground max-sm:mt-2 max-sm:text-[0.8125rem]">{t('stl.pendingNote', { amount: money(pendingTotal) })}</p>}
          </CardContent>
        </Card>

        <Card className="max-sm:gap-3 max-sm:py-4">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 max-sm:px-4">
            <CardTitle className="flex min-w-0 items-center gap-2.5 text-lg max-sm:text-base"><IconTile icon={Percent} />{t('stl.fee')}</CardTitle>
            {can('editFee') && (
              <Button size="sm" variant="outline" className="shrink-0 print:hidden" onClick={() => setFeeOpen(true)}>
                <Pencil aria-hidden="true" />
                {t('stl.feeEdit')}
              </Button>
            )}
          </CardHeader>
          <CardContent className="max-sm:px-4">
            <p className="mb-2 font-semibold max-sm:mb-1.5 max-sm:text-[0.9375rem]">{feeBasisText}</p>
            {s.feeEarned === undefined ? (
              <p className="text-sm text-muted-foreground max-sm:text-[0.8125rem]">{t('stl.totalUndecided')}</p>
            ) : null}
            <dl className="divide-y">
              <Row label={t('stl.feeEarned')} value={s.feeEarned === undefined ? '—' : money(s.feeEarned)} />
              <Row label={t('stl.feePaid')} value={money(s.feePaid)} />
              <Row label={t('stl.feeOutstanding')} value={s.feeEarned === undefined ? '—' : money(s.feeOutstanding)} />
            </dl>

            {s.feeBasis === 'retainer' && s.fee.months !== undefined && (
              <p className="mt-3 text-sm text-muted-foreground max-sm:mt-2 max-sm:text-[0.8125rem]">
                {t('stl.retainerLine', { months: s.fee.months, amount: money(project.retainerAmount ?? 0) })}
                {project.retainerStart && ` · ${t('stl.retainerSince', { date: formatDate(project.retainerStart, lang) })}`}
                {project.retainerEnd && ` · ${t('stl.retainerUntil', { date: formatDate(project.retainerEnd, lang) })}`}
              </p>
            )}
            {s.feeBasis === 'perPhase' && (
              <div className="mt-3 grid gap-2 max-sm:mt-2">
                <h3 className="font-semibold max-sm:text-[0.9375rem]">{t('stl.feeByPhase')}</h3>
                {s.fee.lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('stl.feeNoPhases')}</p>
                ) : (
                  <ul className="divide-y rounded-xl border">
                    {s.fee.lines.map((l) => (
                      <li key={l.phaseId} className="grid gap-0.5 p-3">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold">{phaseLabel.get(l.phaseId) ?? '—'}</span>
                          <span className="tabular font-bold whitespace-nowrap">{money(l.earned)}</span>
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {l.kind === 'fixed'
                            ? l.counted
                              ? t('stl.feeLineFixedDone', { amount: money(l.value) })
                              : t('stl.feeLineFixedOpen', { amount: money(l.value) })
                            : t('stl.feeLinePercent', { pct: l.value, cost: money(l.cost) })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="max-sm:gap-3 max-sm:py-4">
        <CardHeader className="max-sm:px-4">
          <CardTitle className="flex min-w-0 items-center gap-2.5 text-lg max-sm:text-base"><IconTile icon={Banknote} />{t('stl.totalDue')}</CardTitle>
        </CardHeader>
        <CardContent className="max-sm:px-4">
          <p role="status" className="text-xl font-extrabold text-balance max-sm:text-lg">
            {totalMsg}
          </p>
          {s.feeEarned === undefined && <p className="mt-1 text-sm text-muted-foreground max-sm:text-[0.8125rem]">{t('stl.totalUndecided')}</p>}
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeading icon={ArrowLeftRight} className="p-4 max-sm:p-3">{t('stl.transfers')}</CardHeading>
        {transfers.length === 0 ? (
          <EmptyState compact icon={ArrowLeftRight} title={t('stl.transferEmpty')} body={t('stl.transferEmptyBody')} />
        ) : (
          <ul className="divide-y border-t">
            {transfers.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 p-4 max-sm:gap-2 max-sm:p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold max-sm:text-[0.9375rem]">{t(`xfer.${x.kind}` as Key)}</span>
                    <Badge variant="neutral">{t(x.kind === 'return' ? 'stl.builderToInvestor' : 'stl.investorToBuilder')}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground max-sm:text-[0.8125rem]">
                    <span className="tabular">{formatDate(x.date, lang)}</span>
                    {x.note && ` · ${x.note}`}
                  </p>
                </div>
                <strong className="tabular whitespace-nowrap max-sm:text-[0.9375rem]">{money(x.amount)}</strong>
                {can('editTransfers') && <div className="flex gap-1 print:hidden">
                  <Button size="icon" variant="ghost" aria-label={`${t('common.edit')}: ${t(`xfer.${x.kind}` as Key)}`} onClick={() => setEditing(x)}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${t('common.delete')}: ${t(`xfer.${x.kind}` as Key)}`}
                    onClick={() => {
                      void deleteTransfer(x.id)
                      toast.show({
                        kind: 'info',
                        message: t('stl.deleted'),
                        actionLabel: t('common.undo'),
                        onAction: () => void restoreTransfer(x.id),
                        duration: 8000,
                      })
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TransferDialog open={adding} onClose={() => setAdding(false)} />
      <TransferDialog open={Boolean(editing)} transfer={editing} onClose={() => setEditing(undefined)} />
      <FeeDialog open={feeOpen} onClose={() => setFeeOpen(false)} />
    </div>
  )
}
