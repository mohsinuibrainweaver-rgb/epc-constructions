import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { approvePayment, rejectPayment } from '@/db/actions'
import type { Payment } from '@/db/types'
import { formatDate, money } from '@/lib/format'
import { usePayments, useTransfers } from '@/db/hooks'
import { memberCashPosition, projectCashUsed } from '@/lib/pettyCash'

/** Approve or reject one entry the builder added. Only the investor sees these buttons. */
export function ApprovalActions({ payment, size = 'sm' }: { payment: Payment; size?: 'sm' | 'default' }) {
  const { t, settings, can, project } = useApp()
  const toast = useToast()
  const payments = usePayments(project?.id)
  const transfers = useTransfers(project?.id)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const by = settings.userName || settings.role

  if (!can('approvePayments')) return null
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          type="button"
          size={size}
          onClick={() => {
            const requestedCash = projectCashUsed(payment)
            const position = memberCashPosition(payment.paidBy, payments, transfers)
            const availableForThisPayment = position.availableCash + (payment.approval === 'pending' ? requestedCash : 0)
            if (requestedCash > availableForThisPayment) {
              toast.show({ kind: 'error', message: t('cash.errInsufficient', { amount: money(Math.max(0, availableForThisPayment)) }) })
              return
            }
            void approvePayment(payment.id, by)
            toast.show({ kind: 'success', message: t('approval.approvedToast') })
          }}
        >
          <Check aria-hidden="true" />
          {t('approval.approve')}
        </Button>
        <Button
          type="button"
          size={size}
          variant="outline"
          onClick={() => {
            setReason('')
            setRejecting(true)
          }}
        >
          <X aria-hidden="true" />
          {t('approval.reject')}
        </Button>
      </div>

      <Dialog
        open={rejecting}
        title={t('approval.rejectTitle')}
        description={`${payment.purpose} · ${money(payment.amount)}`}
        onClose={() => setRejecting(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void rejectPayment(payment.id, by, reason)
                toast.show({ kind: 'info', message: t('approval.rejectedToast') })
                setRejecting(false)
              }}
            >
              {t('approval.reject')}
            </Button>
          </>
        }
      >
        <Field label={t('approval.rejectReason')} hint={t('approval.rejectHint')}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Dialog>
    </>
  )
}

/** What an entry's approval status means, shown at the top of its page. */
export function ApprovalNotice({ payment, actions = true }: { payment: Payment; actions?: boolean }) {
  const { t, lang, can } = useApp()
  if (!payment.approval) return null
  const investor = can('approvePayments')
  const name = payment.addedBy || '—'
  const tone =
    payment.approval === 'rejected' ? 'bg-danger-soft text-danger' : payment.approval === 'pending' ? 'bg-warning-soft text-warning' : 'bg-muted text-foreground'
  const text =
    payment.approval === 'pending'
      ? t(investor ? 'approval.noticePendingInvestor' : 'approval.noticePendingBuilder', { name })
      : payment.approval === 'rejected'
        ? t(investor ? 'approval.noticeRejectedInvestor' : 'approval.noticeRejectedBuilder')
        : t('approval.noticeApproved', { name: payment.approvedBy || '—', date: payment.approvedAt ? formatDate(new Date(payment.approvedAt).toISOString().slice(0, 10), lang) : '—' })
  return (
    <div role="status" className={`grid gap-3 rounded-xl p-4 ${tone}`}>
      <p className="font-semibold">{text}</p>
      {payment.approval === 'rejected' && payment.rejectReason && <p>{t('approval.reasonIs', { reason: payment.rejectReason })}</p>}
      {payment.approval === 'approved' && !investor && <p className="text-sm">{t('approval.editAgain')}</p>}
      {actions && can('approvePayments') && payment.approval !== 'approved' && <ApprovalActions payment={payment} size="default" />}
    </div>
  )
}
