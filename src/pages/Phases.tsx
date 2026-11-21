import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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
  GripVertical,
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
import { addPhase, deletePhase, movePhase, reorderPhases, setPhaseDone, updatePhase } from '@/db/actions'
import { usePayments, usePhases, useVendors } from '@/db/hooks'
import type { Payment, Phase } from '@/db/types'
import type { Key } from '@/i18n/en'
import { groupDigits, money, moneyRate, parseAmount } from '@/lib/format'
import { num, priceRows } from '@/lib/materials'
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

/** One phase row. Also drawn as the floating copy that follows the pointer while it is dragged. */
function PhaseRow({
  ph,
  num,
  payments,
  editable,
  canDrag,
  isFirst,
  isLast,
  floating,
  onEdit,
  onGrab,
}: {
  ph: Phase
  num: number
  payments: Payment[]
  editable: boolean
  canDrag: boolean
  isFirst: boolean
  isLast: boolean
  floating?: boolean
  onEdit: () => void
  onGrab: (e: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  const { t, project, phaseName } = useApp()
  const spent = sum(payments.filter((p) => p.phaseId === ph.id && isSpent(p)))
  const planned = sum(payments.filter((p) => p.phaseId === ph.id && isPlanned(p)))
  const lvl = budgetLevel(spent, ph.budget)
  const name = phaseName(ph)
  const Icon = phaseIcon(ph)
  return (
    // One phase per row: a drag handle, then the details, then three equal icon buttons (under the details on a phone).
    <Card className={cn('flex-row items-center gap-2 p-3 transition-colors hover:border-foreground/30 sm:gap-3', floating && 'border-primary shadow-xl ring-2 ring-primary/30')}>
      {canDrag && (
        <button
          type="button"
          aria-label={`${t('phases.drag')}: ${name}`}
          title={t('phases.drag')}
          tabIndex={floating ? -1 : 0}
          onPointerDown={onGrab}
          onContextMenu={(e) => e.preventDefault()}
          className={cn(
            'grid size-9 shrink-0 touch-none place-items-center rounded-md text-muted-foreground outline-none select-none hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
            floating ? 'cursor-grabbing' : 'cursor-grab',
          )}
        >
          <GripVertical aria-hidden="true" className="size-5" />
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Link to={`/phases/${ph.id}`} className="grid min-w-0 flex-1 gap-2 rounded-md md:grid-cols-[minmax(0,1fr)_minmax(12rem,22rem)] md:items-center md:gap-8">
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-control bg-secondary text-primary">
              <Icon className="size-[1.125rem]" strokeWidth={1.75} />
            </span>
            <span className="text-base leading-snug font-bold">
              {num}. {name}
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
        {editable && (
          <div className="flex shrink-0 justify-end gap-2">
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={`${t('phases.moveUp')}: ${name}`}
              title={t('phases.moveUp')}
              disabled={isFirst}
              onClick={() => project && void movePhase(project.id, ph.id, -1)}
            >
              <ChevronUp aria-hidden="true" />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={`${t('phases.moveDown')}: ${name}`}
              title={t('phases.moveDown')}
              disabled={isLast}
              onClick={() => project && void movePhase(project.id, ph.id, 1)}
            >
              <ChevronDown aria-hidden="true" />
            </Button>
            <Button size="icon-sm" variant="outline" aria-label={`${t('common.edit')}: ${name}`} title={t('common.edit')} onClick={onEdit}>
              <Pencil aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

/** What is being dragged right now: which phase, which slot it would drop into, and where the pointer is. */
type Drag = { id: string; to: number; y: number }
/** Facts about the drag that do not change while it lasts. */
type DragMeta = { from: number; height: number; width: number; left: number; offsetY: number }

export function Phases() {
  const { t, project, can } = useApp()
  const editable = can('editPhases')
  const phases = usePhases(project?.id)
  const payments = usePayments(project?.id).filter((p) => !p.deletedAt)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Phase>()

  // The order just dropped, shown straight away until the saved order catches up (so the list never flickers back).
  const [optimistic, setOptimistic] = useState<string[] | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const meta = useRef<DragMeta | null>(null)
  const rows = useRef(new Map<string, HTMLLIElement>())
  const pointerY = useRef(0)
  const toRef = useRef(0)

  const shown = useMemo(() => {
    if (!optimistic || optimistic.length !== phases.length) return phases
    const byId = new Map(phases.map((p) => [p.id, p]))
    const list = optimistic.map((id) => byId.get(id))
    return list.every(Boolean) ? (list as Phase[]) : phases
  }, [phases, optimistic])
  const shownRef = useRef(shown)
  shownRef.current = shown

  useEffect(() => {
    if (optimistic && phases.map((p) => p.id).join() === optimistic.join()) setOptimistic(null)
  }, [phases, optimistic])

  const dragId = drag?.id
  useEffect(() => {
    if (!dragId || !meta.current) return
    const { offsetY, height } = meta.current

    /** Work out the slot from where the dragged card's centre is, compared with the middle of every other row. */
    const update = () => {
      const centre = pointerY.current - offsetY + height / 2
      let to = 0
      for (const p of shownRef.current) {
        if (p.id === dragId) continue
        const r = rows.current.get(p.id)?.getBoundingClientRect()
        if (r && centre > r.top + r.height / 2) to++
      }
      toRef.current = to
      setDrag((d) => (d && (d.to !== to || d.y !== pointerY.current) ? { ...d, to, y: pointerY.current } : d))
    }
    const move = (e: PointerEvent) => {
      pointerY.current = e.clientY
      update()
    }
    const finish = (save: boolean) => {
      const m = meta.current
      const to = toRef.current
      setDrag(null)
      if (!save || !m || !project || to === m.from) return
      const ids = shownRef.current.map((p) => p.id).filter((id) => id !== dragId)
      ids.splice(to, 0, dragId)
      setOptimistic(ids)
      void reorderPhases(project.id, ids)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && finish(false)

    // Scroll the page when the pointer is held near the top or bottom edge.
    let raf = 0
    const tick = () => {
      const edge = 90
      const y = pointerY.current
      const dy = y < edge ? -Math.ceil((edge - y) / 5) : y > window.innerHeight - edge ? Math.ceil((y - (window.innerHeight - edge)) / 5) : 0
      if (dy) {
        window.scrollBy(0, dy)
        update()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    const { userSelect, cursor } = document.body.style
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
      document.body.style.userSelect = userSelect
      document.body.style.cursor = cursor
    }
  }, [dragId, project])

  const grab = (e: ReactPointerEvent<HTMLButtonElement>, ph: Phase) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const r = rows.current.get(ph.id)?.getBoundingClientRect()
    if (!r) return
    e.preventDefault()
    const from = shownRef.current.findIndex((p) => p.id === ph.id)
    pointerY.current = e.clientY
    toRef.current = from
    meta.current = { from, height: r.height, width: r.width, left: r.left, offsetY: e.clientY - r.top }
    setDrag({ id: ph.id, to: from, y: e.clientY })
  }

  // While dragging, the grabbed row leaves the list and a dashed, outlined slot shows where it would land.
  const dragged = drag ? shown.find((p) => p.id === drag.id) : undefined
  const slots: Array<{ ph: Phase } | 'slot'> = shown.filter((p) => p.id !== drag?.id).map((ph) => ({ ph }))
  if (drag && dragged) slots.splice(drag.to, 0, 'slot')
  const canDrag = editable && shown.length > 1

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
            {slots.map((s, i) =>
              s === 'slot' ? (
                <li
                  key="drop-slot"
                  aria-hidden="true"
                  style={{ height: meta.current?.height }}
                  className="rounded-xl border-2 border-dashed border-primary/60 bg-primary/5"
                />
              ) : (
                <li
                  key={s.ph.id}
                  ref={(el) => {
                    if (el) rows.current.set(s.ph.id, el)
                    else rows.current.delete(s.ph.id)
                  }}
                >
                  <PhaseRow
                    ph={s.ph}
                    num={i + 1}
                    payments={payments}
                    editable={editable}
                    canDrag={canDrag}
                    isFirst={i === 0}
                    isLast={i === slots.length - 1}
                    onEdit={() => setEditing(s.ph)}
                    onGrab={(e) => grab(e, s.ph)}
                  />
                </li>
              ),
            )}
          </ul>
          {drag && dragged && meta.current && (
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-50"
              style={{ left: meta.current.left, top: drag.y - meta.current.offsetY, width: meta.current.width }}
            >
              <PhaseRow
                floating
                ph={dragged}
                num={drag.to + 1}
                payments={payments}
                editable={false}
                canDrag
                isFirst={false}
                isLast={false}
                onEdit={() => {}}
                onGrab={() => {}}
              />
            </div>
          )}
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
  const bought = priceRows(payments)
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

      {bought.length > 0 && (
        <Card className="gap-4 p-4">
          <h2 className="text-lg font-semibold">{t('phases.materials')}</h2>
          <ul className="grid gap-3">
            {bought.map((r) => (
              <li key={r.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{r.item}</p>
                  <p className="tabular text-sm text-muted-foreground">
                    {t('mat.at', { qty: num(r.quantity), unit: t(`unit.${r.unit}` as Key), rate: moneyRate(r.average) })}
                  </p>
                </div>
                <span className="tabular shrink-0 font-semibold">{money(r.spent)}</span>
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
