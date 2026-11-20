import { useApp } from '@/app/AppContext'
import { cashToArrange, type CashAdvice, type Forecast } from '@/lib/forecast'
import { money } from '@/lib/format'

/**
 * The next 7 and 30 days as a small table: all payments, what you pay directly, and (only when there is any) what the builder pays out
 * of the cash you gave him. Rows are the same kind of thing in each column, so nothing has to be read as a sentence.
 */
export function ForecastTable({ f }: { f: Forecast }) {
  const { t } = useApp()
  const rows = [
    { key: 'all', label: t('forecast.rowAll'), a: f.next7, b: f.next30, strong: true },
    { key: 'you', label: t('forecast.rowYou'), a: f.investorNext7, b: f.investorNext30 },
    ...(f.builderNext30 > 0 ? [{ key: 'builder', label: t('forecast.rowBuilder'), a: f.builderNext7, b: f.builderNext30 }] : []),
  ]
  return (
    <div role="table" aria-label={t('nav.forecast')} className="grid text-sm">
      <div role="row" className="grid grid-cols-[minmax(0,1fr)_5.75rem_5.75rem] gap-x-3 border-b pb-1.5 text-muted-foreground sm:grid-cols-[minmax(0,1fr)_8rem_8rem]">
        <span role="columnheader" className="sr-only">
          {t('nav.forecast')}
        </span>
        <span aria-hidden="true" />
        <span role="columnheader" className="text-end font-medium">
          {t('forecast.col7')}
        </span>
        <span role="columnheader" className="text-end font-medium">
          {t('forecast.col30')}
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.key} role="row" className="grid grid-cols-[minmax(0,1fr)_5.75rem_5.75rem] items-baseline gap-x-3 border-b py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]">
          <span role="rowheader" className={r.strong ? 'font-semibold' : 'text-muted-foreground'}>
            {r.label}
          </span>
          <span role="cell" className={`tabular text-end whitespace-nowrap ${r.strong ? 'text-sm font-extrabold sm:text-base' : 'font-semibold'}`}>
            {money(r.a)}
          </span>
          <span role="cell" className={`tabular text-end whitespace-nowrap ${r.strong ? 'text-sm font-extrabold sm:text-base' : 'font-semibold'}`}>
            {money(r.b)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The one figure that answers "how much cash must I have ready?": what you pay yourself plus what you still have to send the builder. */
export function ArrangeBox({ f, advice }: { f: Forecast; advice: CashAdvice }) {
  const { t } = useApp()
  const total = cashToArrange(f.investorNext30, advice)
  if (total <= 0) return null
  const note =
    advice.topUp > 0
      ? t('forecast.arrangeBoth', { you: money(f.investorNext30), send: money(advice.topUp) })
      : f.builderNext30 > 0
        ? t('forecast.arrangeEnough', { you: money(f.investorNext30) })
        : t('forecast.arrangeYou')
  return (
    <section aria-label={t('forecast.arrange')} className="grid gap-1 rounded-xl bg-secondary p-3 text-secondary-foreground">
      <h3 className="text-sm font-semibold">{t('forecast.arrange')}</h3>
      <p className="tabular text-2xl font-extrabold">{money(total)}</p>
      <p className="text-sm">{note}</p>
    </section>
  )
}
