import { useMemo, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { StatusPill } from '@/components/common'
import type { Payment } from '@/db/types'
import type { Key } from '@/i18n/en'
import { formatDate, money, moneyRate } from '@/lib/format'
import { hasQuantity, num, rateOf } from '@/lib/materials'
import { recentEntries } from '@/lib/recent'
import { cn } from '@/lib/utils'

const FEW = 5
const MANY = 15

/**
 * The payments entered last, in a grey box beside the Add payment form so a person can see what is already in before typing the next
 * one. Read only on purpose: a tap that left the page would lose what is half typed. The page hides it where there is no room beside the form.
 */
export function RecentPayments({
  payments,
  vendorNames,
  excludeId,
  vendorId,
  className,
}: {
  payments: Payment[]
  vendorNames: ReadonlyMap<string, string>
  /** The payment being edited, which is not "recent" to itself. */
  excludeId?: string
  /** Entries to this vendor are marked, so a payment already made to them stands out. */
  vendorId?: string
  className?: string
}) {
  const { t, lang } = useApp()
  const [more, setMore] = useState(false)
  const all = useMemo(() => recentEntries(payments, MANY, excludeId), [payments, excludeId])
  const shown = more ? all : all.slice(0, FEW)

  return (
    <aside aria-labelledby="recent-heading" className={cn('grid content-start gap-3 rounded-xl border bg-muted/60 p-4', className)}>
      <h2 id="recent-heading" className="text-base font-semibold">
        {t('pay.recentTitle')}
      </h2>
      {all.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('pay.recentEmpty')}</p>
      ) : (
        <>
          <ul className="grid gap-2">
            {shown.map((p) => {
              const who = (p.vendorId && vendorNames.get(p.vendorId)) || p.payeeName
              const sameVendor = Boolean(vendorId) && p.vendorId === vendorId
              const plain = p.status === 'paid' && !p.approval
              return (
                <li key={p.id} className={cn('grid gap-0.5 rounded-lg border bg-card px-3 py-2', sameVendor && 'border-primary/60 ring-1 ring-primary/30')}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold">{p.purpose}</span>
                    <span className="tabular text-sm font-bold whitespace-nowrap">{money(p.amount)}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{[who, formatDate(p.date, lang)].filter(Boolean).join(' · ')}</p>
                  {hasQuantity(p) && (
                    <p className="tabular truncate text-xs text-muted-foreground">
                      {t('mat.at', { qty: num(p.quantity), unit: t(`unit.${p.unit}` as Key), rate: moneyRate(rateOf(p)) })}
                    </p>
                  )}
                  {!plain && (
                    <div className="mt-1">
                      <StatusPill payment={p} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {all.length > FEW && (
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore((m) => !m)}
              className="w-fit rounded-md text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {more ? t('pay.recentLess') : t('pay.recentMore')}
            </button>
          )}
        </>
      )}
    </aside>
  )
}
