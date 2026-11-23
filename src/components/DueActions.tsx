import { useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { markPaid, movePayment, skipPayment } from '@/db/actions'
import type { Payment } from '@/db/types'
import { formatDate, todayISO } from '@/lib/format'

/** Pay, move or skip a planned payment (for example this week's foreman payment). */
export function DueActions({ payment }: { payment: Payment }) {
  const { t, lang, settings, can } = useApp()
  const toast = useToast()
  const [moving, setMoving] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [date, setDate] = useState(payment.date)
  const [reason, setReason] = useState('')
  const [dateError, setDateError] = useState('')

  if (!can('editPayments')) return null
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void markPaid(payment.id, settings.role)
            toast.show({ kind: 'success', message: t('pay.updated') })
          }}
        >
          {t('home.markPaid')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDate(payment.date < todayISO() ? todayISO() : payment.date)
            setDateError('')
            setMoving(true)
          }}
        >
          {t('due.move')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setReason('')
            setSkipping(true)
          }}
        >
          {t('due.skip')}
        </Button>
      </div>

      <Dialog
        open={moving}
        title={t('due.moveTitle')}
        description={`${payment.purpose} · ${formatDate(payment.date, lang)}`}
        onClose={() => setMoving(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setMoving(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (!date) {
                  setDateError(t('pay.errDate'))
                  return
                }
                void movePayment(payment.id, date)
                toast.show({ kind: 'success', message: t('due.moved') })
                setMoving(false)
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('due.moveDate')} error={dateError}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
        </Field>
      </Dialog>

      <Dialog
        open={skipping}
        title={t('due.skipTitle')}
        description={t('due.skipHint')}
        onClose={() => setSkipping(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setSkipping(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                void skipPayment(payment.id, reason.trim())
                toast.show({ kind: 'info', message: t('due.skipped') })
                setSkipping(false)
              }}
            >
              {t('due.skip')}
            </Button>
          </>
        }
      >
        <Field label={t('due.skipReason')}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
      </Dialog>
    </>
  )
}
