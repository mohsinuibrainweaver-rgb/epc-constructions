import { Link } from 'react-router-dom'
import { CardHeading } from '@/components/CardHeading'
import { CheckCheck, ClipboardCheck } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { ApprovalActions } from '@/components/ApprovalActions'
import { StatusPill } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { approvePayments } from '@/db/actions'
import type { Payment } from '@/db/types'
import { formatDate, money } from '@/lib/format'
import { isAwaitingApproval, isRejected, sum } from '@/lib/stats'

/**
 * Home card for the approval flow.
 * Investor: the builder's entries to approve or reject. Builder: their entries that wait, and any that came back.
 * Shows nothing when there is nothing to act on.
 */
export function ApprovalsCard({ payments }: { payments: Payment[] }) {
  const { t, lang, settings, can } = useApp()
  const toast = useToast()
  const investor = can('approvePayments')
  const waiting = payments.filter(isAwaitingApproval).sort((a, b) => a.date.localeCompare(b.date))
  const turnedDown = investor ? [] : payments.filter(isRejected)
  if (waiting.length === 0 && turnedDown.length === 0) return null

  const by = settings.userName || settings.role

  return (
    <Card className="gap-0 overflow-hidden py-0" aria-labelledby="appr-title">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4">
        <CardHeading icon={ClipboardCheck} id="appr-title" className="max-sm:text-base">
          {t(investor ? 'approval.title' : 'approval.titleBuilder')} ({waiting.length + turnedDown.length})
        </CardHeading>
        {investor && waiting.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void approvePayments(waiting.map((p) => p.id), by)
              toast.show({ kind: 'success', message: t('approval.allApprovedToast', { count: waiting.length }) })
            }}
          >
            <CheckCheck aria-hidden="true" />
            {t('approval.approveAll', { count: waiting.length })}
          </Button>
        )}
      </div>
      {waiting.length > 0 && <p className="px-4 pb-3 text-sm text-muted-foreground max-sm:text-xs">{t(investor ? 'approval.total' : 'approval.totalBuilder', { amount: money(sum(waiting)) })}</p>}
      <ul className="divide-y border-t">
        {[...waiting, ...turnedDown].map((p) => (
          <li key={p.id} className="grid gap-3 p-4">
            <Link to={`/payments/${p.id}`} className="flex min-w-0 items-start justify-between gap-3">
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate font-semibold max-sm:text-[0.9375rem]">{p.purpose}</span>
                <span className="text-sm text-muted-foreground max-sm:text-xs">
                  {formatDate(p.date, lang)} · <span className="tabular whitespace-nowrap">{money(p.amount)}</span> · {t('approval.addedBy', { name: p.addedBy || '—' })}
                </span>
                {p.approval === 'rejected' && p.rejectReason && <span className="text-sm text-danger max-sm:text-xs">{p.rejectReason}</span>}
              </span>
              <StatusPill payment={p} />
            </Link>
            {investor && p.approval === 'pending' && <ApprovalActions payment={p} />}
            {!investor && can('editPayments') && p.approval === 'rejected' && (
              <Button asChild size="sm" variant="outline" className="w-fit">
                <Link to={`/payments/${p.id}`}>{t('approval.fix')}</Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
