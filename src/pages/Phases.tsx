import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Building2,
  BrickWall,
  Cable,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  ClipboardList,
  DoorOpen,
  FileText,
  Grid3x3,
  Hammer,
  HardHat,
  KeyRound,
  Layers3,
  Lightbulb,
  PaintBucket,
  Pencil,
  Pickaxe,
  Plus,
  ReceiptText,
  RotateCcw,
  Shovel,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { BackLink, BudgetBar, Dialog, EmptyState, Field, PageHeader } from '@/components/common'
import { PaymentsTable } from '@/components/PaymentsTable'
import { useToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { addPhase, deletePhase, movePhase, setPhaseDone, updatePhase } from '@/db/actions'
import { usePayments, usePhases, useVendors } from '@/db/hooks'
import type { Payment, Phase } from '@/db/types'
import { groupDigits, money, parseAmount } from '@/lib/format'
import { budgetLevel, budgetPlan, isPlanned, isSpent, percent, phaseFigures, spentBy, sum } from '@/lib/stats'
import { cn } from '@/lib/utils'

function PhaseDialog({ open, phase, onClose }: { open: boolean; phase?: Phase; onClose: () => void }) {
  const { t, project, phaseName } = useApp()
  const toast = useToast()
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    setName(phase ? phaseName(phase) : '')
    setBudget(phase?.budget ? groupDigits(String(phase.budget)) : '')
    setError('')
  }, [open, phase, phaseName])

  const submit = async () => {
    if (!project) return
    if (!name.trim()) {
      setError(t('phases.nameRequired'))
      return
    }
    const b = parseAmount(budget) || undefined
    if (phase) {
      // Keep following the translated template name unless the user changed it.
      const changed = name.trim() !== phaseName(phase)
      await updatePhase(phase.id, { budget: b, ...(changed ? { name: name.trim() } : {}) })
    } else {
      await addPhase(project.id, name.trim(), b)
    }
    toast.show({ kind: 'success', message: t('pay.updated') })
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={phase ? t('common.edit') : t('phases.add')}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label={t('phases.name')} error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={t('phases.budget')}>
          <Input className="tabular" inputMode="numeric" value={budget} onChange={(e) => setBudget(groupDigits(e.target.value))} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}

/** An icon for each standard phase, so a long list is easy to scan. A phase you added yourself gets a hard hat. */
const PHASE_ICONS: Record<string, LucideIcon> = {
  planning: ClipboardList,
  site: Shovel,
  foundation: Pickaxe,
  grey: Building2,
  services: Cable,
  windows: DoorOpen,
  ceiling: BrickWall,
  flooring: Grid3x3,
  woodwork: Hammer,
  paint: PaintBucket,
  finishing: Lightbulb,
  handover: KeyRound,
}
const phaseIcon = (ph: Phase): LucideIcon => (ph.key && PHASE_ICONS[ph.key]) || HardHat

/** How the project budget is split across phases, what is left to give out, and money that sits outside every phase. */
function BudgetPlanCard({ phases, payments }: { phases: Phase[]; payments: Payment[] }) {
  const { t, project, can } = useApp()
  const plan = budgetPlan(phases, payments, project?.budget)
  const pb = plan.projectBudget
  const noBudget = plan.total - plan.withBudget
  const pct = pb ? Math.min(100, Math.round((plan.allocated / pb) * 100)) : 0
  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">{t('phases.plan')}</h2>
        <span className="text-sm text-muted-foreground">{t('phases.planDone', { done: plan.done, total: plan.total })}</span>
      </div>

      {pb ? (
        <>
          <p>
            {t('phases.planGiven', { given: money(plan.allocated), total: money(pb) })}
          </p>
          <Progress
            value={pct}
            aria-label={t('phases.plan')}
            className={cn('h-2 bg-muted', plan.overAllocated > 0 && '[&>[data-slot=progress-indicator]]:bg-warning')}
          />
          {plan.overAllocated > 0 ? (
            <Badge variant="warning" className="h-auto w-fit whitespace-normal">
              <TriangleAlert aria-hidden="true" />
              {t('phases.planOver', { amount: money(plan.overAllocated) })}
            </Badge>
          ) : (
            <p className="text-sm text-muted-foreground">
              {plan.unallocated > 0 ? t('phases.planLeft', { amount: money(plan.unallocated) }) : t('phases.planAll')}
            </p>
          )}
        </>
      ) : (
        <>
          <p>{t('phases.planGivenOnly', { given: money(plan.allocated) })}</p>
          {project && can('editProject') && (
            <p className="text-sm text-muted-foreground">
              {t('phases.planNoProject')}{' '}
              <Link className="font-semibold text-primary underline-offset-2 hover:underline" to={`/projects/${project.id}/edit`}>
                {t('phases.planSetBudget')}
              </Link>
            </p>
          )}
        </>
      )}

      {(noBudget > 0 || plan.outsideSpent > 0) && (
        <ul className="grid gap-1 text-sm text-muted-foreground">
          {noBudget > 0 && <li>{t('phases.planNoBudget', { count: noBudget })}</li>}
          {plan.outsideSpent > 0 && <li>{t('phases.planOutside', { amount: money(plan.outsideSpent) })}</li>}
        </ul>
      )}
    </Card>
  )
}

export function Phases() {
  const { t, project, phaseName, can } = useApp()
  const editable = can('editPhases')
  const phases = usePhases(project?.id)
  const payments = usePayments(project?.id).filter((p) => !p.deletedAt)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Phase>()

  return (
    <>
      <PageHeader
        title={t('phases.title')}
        actions={
          editable && (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" />
              {t('phases.add')}
            </Button>
          )
        }
      />

      {phases.length === 0 ? (
        <EmptyState icon={Layers3} title={t('phases.empty')} body={t('phases.emptyBody')} />
      ) : (
        <>
        <BudgetPlanCard phases={phases} payments={payments} />
        <ul className="grid gap-3">
          {phases.map((ph, i) => {
            const spent = sum(payments.filter((p) => p.phaseId === ph.id && isSpent(p)))
            const planned = sum(payments.filter((p) => p.phaseId === ph.id && isPlanned(p)))
            const lvl = budgetLevel(spent, ph.budget)
            const name = phaseName(ph)
            const Icon = phaseIcon(ph)
            return (
              <li key={ph.id}>
                {/* One phase per row: the details on the left, three equal icon buttons on the right (under the details on a phone). */}
                <Card className="gap-2 p-3 transition-colors hover:border-foreground/30 sm:flex-row sm:items-center sm:gap-4">
                  <Link to={`/phases/${ph.id}`} className="grid min-w-0 flex-1 gap-2 rounded-md md:grid-cols-[minmax(0,1fr)_minmax(12rem,22rem)] md:items-center md:gap-8">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-control bg-secondary text-primary">
                        <Icon className="size-[1.125rem]" strokeWidth={1.75} />
                      </span>
                      <span className="text-base leading-snug font-bold">
                        {i + 1}. {name}
                      </span>
                      {ph.done && (
                        <Badge variant="success">
                          <CircleCheck aria-hidden="true" />
                          {t('phases.done')}
                        </Badge>
                      )}
                      {lvl === 'error' && <Badge variant="danger">{percent(spent, ph.budget)}%</Badge>}
                      {lvl === 'warning' && <Badge variant="warning">{percent(spent, ph.budget)}%</Badge>}
                    </span>
                    <span className="grid gap-1.5">
                      <BudgetBar spent={spent} budget={ph.budget} label={name} />
                      <span className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          {t('phases.spent')}: <strong className="tabular">{money(spent)}</strong>
                        </span>
                        <span className="tabular text-muted-foreground">{ph.budget ? money(ph.budget) : t('phases.setBudget')}</span>
                      </span>
                      {planned > 0 && (
                        <span className="text-sm text-muted-foreground">
                          {t('phases.planned')}: <span className="tabular">{money(planned)}</span>
                        </span>
                      )}
                    </span>
                  </Link>
                  {editable && <div className="flex shrink-0 justify-end gap-2">
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label={`${t('phases.moveUp')}: ${name}`}
                      title={t('phases.moveUp')}
                      disabled={i === 0}
                      onClick={() => project && void movePhase(project.id, ph.id, -1)}
                    >
                      <ChevronUp aria-hidden="true" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label={`${t('phases.moveDown')}: ${name}`}
                      title={t('phases.moveDown')}
                      disabled={i === phases.length - 1}
                      onClick={() => project && void movePhase(project.id, ph.id, 1)}
                    >
                      <ChevronDown aria-hidden="true" />
                    </Button>
                    <Button size="icon-sm" variant="outline" aria-label={`${t('common.edit')}: ${name}`} title={t('common.edit')} onClick={() => setEditing(ph)}>
                      <Pencil aria-hidden="true" />
                    </Button>
                  </div>}
                </Card>
              </li>
            )
          })}
        </ul>
        </>
      )}

      <PhaseDialog open={adding} onClose={() => setAdding(false)} />
      <PhaseDialog open={Boolean(editing)} phase={editing} onClose={() => setEditing(undefined)} />
    </>
  )
}

export function PhaseDetail() {
  const { id } = useParams()
  const { t, project, phaseName, can } = useApp()
  const editable = can('editPhases')
  const nav = useNavigate()
  const phases = usePhases(project?.id)
  const vendors = useVendors(project?.id)
  const payments = usePayments(project?.id).filter((p) => !p.deletedAt && p.phaseId === id)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const phase = phases.find((p) => p.id === id)
  if (!phase) return null
  const fig = phaseFigures(payments, phase.budget)
  const spent = fig.spent
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]))
  const where = spentBy(payments, (p) => (p.vendorId && vendorName.get(p.vendorId)) || p.payeeName || t('reports.noVendor'))

  return (
    <>
      <div className="grid gap-1">
        <BackLink to="/phases" label={t('phases.title')} />
        <PageHeader
          title={phaseName(phase)}
          actions={
            <>
              <Button variant="secondary" asChild>
                <Link to={`/add?phase=${phase.id}`}>
                  <Plus aria-hidden="true" />
                  {t('pay.add')}
                </Link>
              </Button>
              <Button variant="outline" onClick={() => void setPhaseDone(phase.id, !phase.done)}>
                {phase.done ? <RotateCcw aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                {phase.done ? t('phases.reopen') : t('phases.markDone')}
              </Button>
              <Button asChild variant="outline">
                <Link to={`/statements?phase=${phase.id}`}>
                  <FileText aria-hidden="true" />
                  {t('stmt.open')}
                </Link>
              </Button>
              {editable && (
                <>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil aria-hidden="true" />
                    {t('common.edit')}
                  </Button>
                  <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 aria-hidden="true" />
                    {t('common.delete')}
                  </Button>
                </>
              )}
            </>
          }
        />
      </div>

      {phase.done && (
        <Badge variant="success" className="w-fit">
          <CircleCheck aria-hidden="true" />
          {t('phases.done')}
        </Badge>
      )}

      <Card className="gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <span>
            {t('phases.spent')}: <strong className="tabular">{money(spent)}</strong>
          </span>
          <span className="tabular text-muted-foreground">{phase.budget ? money(phase.budget) : '—'}</span>
        </div>
        <BudgetBar spent={spent} budget={phase.budget} label={phaseName(phase)} />
        {phase.budget ? <span className="text-sm text-muted-foreground">{t('phases.used', { pct: percent(spent, phase.budget) })}</span> : null}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-4">
          {phase.budget ? (
            <div>
              <dt className="text-sm text-muted-foreground">{fig.over > 0 ? t('phases.overBy') : t('phases.left')}</dt>
              <dd className={cn('tabular font-semibold', fig.over > 0 && 'text-danger')}>{money(fig.over > 0 ? fig.over : fig.left)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-sm text-muted-foreground">{t('phases.planned')}</dt>
            <dd className="tabular font-semibold">{money(fig.planned)}</dd>
          </div>
          {fig.awaiting > 0 && (
            <div>
              <dt className="text-sm text-muted-foreground">{t('phases.awaiting')}</dt>
              <dd className="tabular font-semibold">{money(fig.awaiting)}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-muted-foreground">{t('phases.entries')}</dt>
            <dd className="tabular font-semibold">{fig.count}</dd>
          </div>
        </dl>
      </Card>

      {where.length > 0 && (
        <Card className="gap-4 p-4">
          <h2 className="text-lg font-semibold">{t('phases.whereMoney')}</h2>
          <ul className="grid gap-3">
            {where.map((r) => (
              <li key={r.label} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 font-semibold">{r.label}</span>
                  <span className="tabular shrink-0">{money(r.amount)}</span>
                </div>
                <Progress value={(r.amount / where[0].amount) * 100} aria-label={r.label} className="h-2 bg-muted" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        <h2 className="p-4 text-lg font-semibold">{t('phases.payments')}</h2>
        {payments.length === 0 ? <EmptyState compact icon={ReceiptText} title={t('home.recentEmpty')} /> : <PaymentsTable payments={payments} showPhase={false} />}
      </Card>

      <PhaseDialog open={editing} phase={phase} onClose={() => setEditing(false)} />
      <Dialog
        open={confirmDelete}
        title={t('common.delete')}
        description={t('phases.deleteConfirm')}
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void deletePhase(phase.id).then(() => nav('/phases'))
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p>{phaseName(phase)}</p>
      </Dialog>
    </>
  )
}
