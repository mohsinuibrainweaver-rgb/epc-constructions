import { ArrowDown, ArrowUp, Package } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { CardHeading } from '@/components/CardHeading'
import { Card } from '@/components/ui/card'
import type { Key } from '@/i18n/en'
import { formatDate, money, moneyRate } from '@/lib/format'
import { num, type PriceRow } from '@/lib/materials'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="tabular text-sm font-semibold">{value}</dd>
    </div>
  )
}

/** What was paid per unit of each material, and how the price moved. Built from payments that carry a quantity. */
export function MaterialPrices({ rows, coverage, className }: { rows: PriceRow[]; coverage?: { withQuantity: number; total: number }; className?: string }) {
  const { t, lang } = useApp()
  const unitLabel = (u: PriceRow['unit']) => t(`unit.${u}` as Key)
  return (
    <section aria-labelledby="mat-prices" className={className ?? 'grid gap-3'}>
      <div>
        <CardHeading icon={Package} id="mat-prices">
          {t('mat.prices')}
        </CardHeading>
        <p className="text-sm text-muted-foreground">{t('mat.pricesNote')}</p>
        {coverage && coverage.total > 0 && coverage.withQuantity < coverage.total && (
          <p className="mt-1 text-sm text-muted-foreground">{t('mat.coverage', { withQuantity: coverage.withQuantity, total: coverage.total })}</p>
        )}
      </div>
      {rows.length === 0 ? (
        <Card className="flex-row items-center gap-3 p-4 text-muted-foreground">
          <Package aria-hidden="true" className="size-5 shrink-0" />
          <p className="text-sm">{t('mat.empty')}</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:gap-4 md:grid-cols-2">
          {rows.map((r) => {
            const pct = r.change === undefined ? undefined : Math.round(Math.abs(r.change))
            return (
              <li key={r.key}>
                <Card className="gap-2 p-3 sm:gap-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{r.item}</h3>
                      <p className="text-sm text-muted-foreground">
                        {r.count === 1 ? t('mat.timesOne') : t('mat.times', { count: r.count })} · {formatDate(r.lastDate, lang)}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="tabular text-xl font-extrabold whitespace-nowrap">
                        {moneyRate(r.last)}
                        <span className="text-sm font-medium text-muted-foreground"> / {unitLabel(r.unit)}</span>
                      </p>
                      {r.change !== undefined && (
                        <p
                          className={`inline-flex items-center gap-1 text-sm font-semibold ${pct === 0 ? 'text-muted-foreground' : r.change > 0 ? 'text-danger' : 'text-success'}`}
                        >
                          {pct === 0 ? null : r.change > 0 ? <ArrowUp aria-hidden="true" className="size-4" /> : <ArrowDown aria-hidden="true" className="size-4" />}
                          {pct === 0 ? t('mat.same') : t(r.change > 0 ? 'mat.up' : 'mat.down', { pct: pct ?? 0 })}
                        </p>
                      )}
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
                    <Stat label={t('mat.min')} value={moneyRate(r.min)} />
                    <Stat label={t('mat.max')} value={moneyRate(r.max)} />
                    <Stat label={t('mat.avg')} value={moneyRate(r.average)} />
                    <Stat label={t('mat.bought')} value={`${num(r.quantity)} ${unitLabel(r.unit)}`} />
                  </dl>
                  <p className="text-sm text-muted-foreground">
                    {t('mat.spent')}: <span className="tabular font-semibold text-foreground">{money(r.spent)}</span>
                  </p>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
