import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { EmptyState, PageHeader } from '@/components/common'
import { MaterialDialog } from '@/components/MaterialDialog'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { deleteMaterial, restoreMaterial } from '@/db/actions'
import { useMaterials, usePhases } from '@/db/hooks'
import type { MaterialLine } from '@/db/types'
import type { Key } from '@/i18n/en'
import { formatDate, money } from '@/lib/format'
import { num, priceRows } from '@/lib/materials'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="tabular text-sm font-semibold">{value}</dd>
    </div>
  )
}

export function Materials() {
  const { t, lang, project, phaseName } = useApp()
  const toast = useToast()
  const lines = useMaterials(project?.id)
  const [editing, setEditing] = useState<MaterialLine | undefined>()
  const [open, setOpen] = useState(false)
  const rows = useMemo(() => priceRows(lines), [lines])
  const phases = usePhases(project?.id)

  const unitLabel = (u: MaterialLine['unit']) => t(`unit.${u}` as Key)
  const phaseOf = (id?: string) => (id ? phases.find((p) => p.id === id) : undefined)

  const openAdd = () => {
    setEditing(undefined)
    setOpen(true)
  }
  const openEdit = (l: MaterialLine) => {
    setEditing(l)
    setOpen(true)
  }
  const remove = async (l: MaterialLine) => {
    await deleteMaterial(l.id)
    toast.show({ kind: 'info', message: t('mat.deleted'), actionLabel: t('common.undo'), onAction: () => void restoreMaterial(l.id) })
  }

  return (
    <>
      <PageHeader
        title={t('mat.title')}
        actions={
          <Button variant="secondary" onClick={openAdd}>
            <Plus aria-hidden="true" />
            {t('mat.add')}
          </Button>
        }
      />

      {lines.length === 0 ? (
        <Card>
          <EmptyState icon={Package} title={t('mat.empty')} body={t('mat.emptyBody')} />
        </Card>
      ) : (
        <>
          <section aria-labelledby="mat-prices" className="grid gap-3">
            <div>
              <h2 id="mat-prices" className="text-lg font-semibold">
                {t('mat.prices')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('mat.pricesNote')}</p>
            </div>
            <ul className="grid gap-4 md:grid-cols-2">
              {rows.map((r) => {
                const pct = r.change === undefined ? undefined : Math.round(Math.abs(r.change))
                return (
                  <li key={r.key}>
                    <Card className="gap-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold">{r.item}</h3>
                          <p className="text-sm text-muted-foreground">
                            {r.count === 1 ? t('mat.timesOne') : t('mat.times', { count: r.count })} · {formatDate(r.lastDate, lang)}
                          </p>
                        </div>
                        <div className="text-end">
                          <p className="tabular text-xl font-extrabold whitespace-nowrap">
                            {money(r.last)}
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
                        <Stat label={t('mat.min')} value={money(r.min)} />
                        <Stat label={t('mat.max')} value={money(r.max)} />
                        <Stat label={t('mat.avg')} value={money(Math.round(r.average * 100) / 100)} />
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
          </section>

          <section aria-labelledby="mat-list" className="grid gap-3">
            <h2 id="mat-list" className="text-lg font-semibold">
              {t('mat.purchases')}
            </h2>
            <Card className="gap-0 overflow-hidden py-0">
              <ul className="divide-y">
                {lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 p-4">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate font-semibold">{l.item}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(l.date, lang)} · {t('mat.at', { qty: num(l.quantity), unit: unitLabel(l.unit), rate: money(l.rate) })}
                      </span>
                      {(l.supplier || phaseOf(l.phaseId)) && (
                        <span className="truncate text-sm text-muted-foreground">
                          {[l.supplier, phaseOf(l.phaseId) && phaseName(phaseOf(l.phaseId)!)].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    <span className="tabular font-bold whitespace-nowrap">{money(l.amount)}</span>
                    <div className="flex shrink-0">
                      <Button variant="ghost" size="icon" aria-label={`${t('common.edit')}: ${l.item}`} onClick={() => openEdit(l)}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`${t('common.delete')}: ${l.item}`} onClick={() => void remove(l)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </>
      )}

      <MaterialDialog open={open} line={editing} onClose={() => setOpen(false)} />
    </>
  )
}
