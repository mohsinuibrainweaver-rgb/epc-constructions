import { useMemo, useState } from 'react'
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Dialog, EmptyState, PageHeader } from '@/components/common'
import { PlanDialog } from '@/components/PlanDialog'
import { useToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { db } from '@/db/db'
import { deletePlan } from '@/db/actions'
import { usePhases, usePlans, useVendors } from '@/db/hooks'
import type { PaymentPlan } from '@/db/types'
import { money, weekdayName } from '@/lib/format'
import { weekdayRank } from '@/lib/region'

export function Plans() {
  const { t, lang, project, phaseName, can } = useApp()
  const toast = useToast()
  // In the order of the week as chosen in Settings (the first day of the week comes first).
  const plans = [...usePlans(project?.id)].sort((a, b) => weekdayRank(a.weekday) - weekdayRank(b.weekday) || a.purpose.localeCompare(b.purpose))
  const vendors = useVendors(project?.id)
  const phases = usePhases(project?.id)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<PaymentPlan>()
  const [removing, setRemoving] = useState<PaymentPlan>()

  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors])
  const phaseMap = useMemo(() => new Map(phases.map((p) => [p.id, phaseName(p)])), [phases, phaseName])

  return (
    <>
      <PageHeader
        title={t('plans.title')}
        actions={
          <Button variant="secondary" disabled={!can('managePlans')} onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            {t('plans.add')}
          </Button>
        }
      />

      {plans.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarClock} title={t('plans.empty')} body={t('plans.emptyBody')} />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {plans.map((p) => {
              const who = (p.vendorId && vendorMap.get(p.vendorId)) || ''
              const ph = (p.phaseId && phaseMap.get(p.phaseId)) || ''
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.purpose}</span>
                      {!p.active && <Badge variant="neutral">{t('plans.paused')}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('plans.every', { day: weekdayName(p.weekday, lang) })} · <span className="tabular">{money(p.amount)}</span>
                      {who && ` · ${who}`}
                      {ph && ` · ${ph}`}
                    </p>
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                    <Switch
                      checked={p.active}
                      onCheckedChange={(v) => {
                        void db.plans.update(p.id, { active: v })
                      }}
                      aria-label={`${t('plans.active')}: ${p.purpose}`}
                    />
                    {t('plans.active')}
                  </label>
                  <Button size="sm" variant="outline" disabled={!can('managePlans')} onClick={() => setEditing(p)}>
                    <Pencil aria-hidden="true" />
                    {t('common.edit')}
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`${t('plans.delete')}: ${p.purpose}`} onClick={() => setRemoving(p)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      {plans.length > 0 && <p className="text-sm text-muted-foreground">{t('plans.note')}</p>}

      <PlanDialog open={adding} onClose={() => setAdding(false)} />
      <PlanDialog open={Boolean(editing)} plan={editing} onClose={() => setEditing(undefined)} />
      <Dialog
        open={Boolean(removing)}
        title={t('plans.delete')}
        description={removing?.purpose}
        onClose={() => setRemoving(undefined)}
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(undefined)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removing) void deletePlan(removing.id)
                toast.show({ kind: 'info', message: t('plans.deleted') })
                setRemoving(undefined)
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p>{t('plans.note')}</p>
      </Dialog>
    </>
  )
}
