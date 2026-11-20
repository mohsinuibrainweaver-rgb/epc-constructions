import { HandCoins } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { money } from '@/lib/format'
import type { CashAdvice } from '@/lib/forecast'
import { cn } from '@/lib/utils'

/**
 * The builder's side of the forecast, in three plain lines: what he must pay in the next 30 days, what cash of yours he holds, and
 * the result: how much more to send him, or that his cash is enough. Shown only when he has payments to make.
 */
export function BuilderCash({ advice, className }: { advice: CashAdvice; className?: string }) {
  const { t } = useApp()
  if (advice.needs <= 0) return null
  const short = advice.topUp > 0
  return (
    <section aria-label={t('forecast.builderBox')} className={cn('grid gap-2 rounded-xl border p-3', short ? 'border-warning/50 bg-warning-soft' : 'bg-muted/50', className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <HandCoins aria-hidden="true" className="size-4" />
        {t('forecast.builderBox')}
      </h3>
      <dl className="grid gap-1 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{t('forecast.builderMustPay')}</dt>
          <dd className="tabular font-semibold whitespace-nowrap">{money(advice.needs)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{t('forecast.builderHolds')}</dt>
          <dd className="tabular font-semibold whitespace-nowrap">{money(advice.holds)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t pt-1.5 font-bold">
          <dt>{short ? t('forecast.sendMore') : t('forecast.leftOver')}</dt>
          <dd className="tabular whitespace-nowrap">{money(short ? advice.topUp : advice.leftOver)}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">{short ? t('forecast.sendMoreNote') : t('forecast.enoughNote')}</p>
    </section>
  )
}
