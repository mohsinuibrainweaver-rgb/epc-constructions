import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChartPie, CircleCheck, EllipsisVertical, FileText, GripVertical, Layers3, Package, Pencil, Plus, ReceiptText, RotateCcw, Trash2 } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { CardHeading } from '@/components/CardHeading'
import { colourMap } from '@/lib/avatarColours'
import { phaseIcon } from '@/components/PhaseIcon'
import { BackLink, BudgetBar, Dialog, EmptyState, Field, PageHeader } from '@/components/common'
import { BudgetChip } from '@/components/BudgetChip'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Tip } from '@/components/Tip'
import { BudgetOutlookCard } from '@/components/BudgetOutlook'
import { PaymentsTable } from '@/components/PaymentsTable'
import { useToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { addPhase, deletePhase, movePhase, reorderPhases, setPhaseDone, updatePhase } from '@/db/actions'
import { usePayments, usePhases, useVendors } from '@/db/hooks'
import type { Payment, Phase } from '@/db/types'
import type { Key } from '@/i18n/en'
import { groupDigits, money, moneyRate, parseAmount } from '@/lib/format'
import { num, priceRows } from '@/lib/materials'
import { budgetState, isPlanned, isSpent, percent, phaseFigures, spentBy, sum } from '@/lib/stats'
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
        <Field label={t('phases.budget')} hint={t('phases.estimateHint')}>
          <Input className="tabular" inputMode="numeric" value={budget} onChange={(e) => setBudget(groupDigits(e.target.value))} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}

/** One phase row. Also drawn as the floating copy that follows the pointer while it is dragged. */
function PhaseRow({
  ph,
  num,
  colour,
  payments,
  editable,
  canDrag,
  floating,
  onEdit,
  onDelete,
  onToggleDone,
  onGrab,
}: {
  ph: Phase
  num: number
  /** The tile colour (light fill, colour-500 icon), from the whole list so neighbours differ. */
  colour: string
  payments: Payment[]
  editable: boolean
  canDrag: boolean
  floating?: boolean
  onEdit: () => void
  onDelete: () => void
  /** Asks first: marking a phase complete or reopening it changes how it is counted. */
  onToggleDone: () => void
  onGrab: (e: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  const { t, project, phaseName } = useApp()
  const spent = sum(payments.filter((p) => p.phaseId === ph.id && isSpent(p)))
  const planned = sum(payments.filter((p) => p.phaseId === ph.id && isPlanned(p)))
  const triggerRef = useRef<HTMLButtonElement>(null)
  const launching = useRef(false)
  /** Open a dialog from a menu item: the menu is gone first, the focus goes back to its button, and the dialog (which returns focus there when it closes) opens. */
  const launch = (open: () => void) => {
    launching.current = true
    setTimeout(() => {
      triggerRef.current?.focus()
      open()
    }, 0)
  }
  const done = Boolean(ph.done)
  const state = budgetState(spent, ph.budget, done)
  const name = phaseName(ph)
  const Icon = phaseIcon(ph)
  const grip = (
      <button
        type="button"
        aria-label={`${t('phases.drag')}: ${name}`}
        tabIndex={floating ? -1 : 0}
        data-grip={ph.id}
        aria-keyshortcuts="ArrowUp ArrowDown"
        // Without a mouse or a finger: the arrow keys move the phase one place, and the focus stays on its handle.
        onKeyDown={(e) => {
          const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
          if (!dir || !project || floating) return
          e.preventDefault()
          void movePhase(project.id, ph.id, dir).then(() =>
            setTimeout(() => {
              if (document.activeElement === document.body || !document.activeElement?.isConnected) document.querySelector<HTMLElement>(`[data-grip="${CSS.escape(ph.id)}"]`)?.focus()
            }, 80),
          )
        }}
        onPointerDown={onGrab}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          'grid size-9 shrink-0 touch-none place-items-center rounded-md max-sm:col-start-2 max-sm:row-start-2 max-sm:size-11 text-muted-foreground outline-none select-none hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
          floating ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <GripVertical aria-hidden="true" className="size-5" />
      </button>
  )
  return (
    // One phase per row: a drag handle, then the details, then two icon buttons (under the details on a phone).
    <Card className={cn('flex-row items-center gap-2 p-3 transition-colors hover:border-foreground/30 max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-start max-sm:gap-x-1 max-sm:gap-y-0 max-sm:py-3 sm:gap-3', floating && 'border-primary shadow-xl ring-2 ring-primary/30')}>
      {canDrag && (floating ? grip : <Tip label={`${t('phases.drag')} (↑ ↓)`}>{grip}</Tip>)}
      <div className="flex min-w-0 flex-1 flex-col gap-2 max-sm:contents sm:flex-row sm:items-center sm:gap-4">
        <Link to={`/phases/${ph.id}`} className="grid min-w-0 flex-1 gap-2 rounded-md max-sm:col-start-1 max-sm:row-span-2 max-sm:row-start-1 md:grid-cols-[minmax(0,1fr)_minmax(12rem,22rem)] md:items-center md:gap-8">
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-control', colour)}>
              <Icon className="size-[1.125rem]" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1 text-base leading-snug font-bold max-sm:[overflow-wrap:anywhere] sm:flex-none">
              {num}. {name}
            </span>
            {/* On a phone the status chips sit on their own line under the name, lined up with it (past the 36 px icon and the gap). */}
            <span className="flex flex-wrap items-center gap-1.5 max-sm:basis-full max-sm:ps-12 sm:contents">
              {done && (
                <Badge variant="success">
                  <CircleCheck aria-hidden="true" data-solid="" />
                  {t('phases.done')}
                </Badge>
              )}
              <BudgetChip state={state} spent={spent} estimate={ph.budget} />
            </span>
          </span>
          <span className="grid gap-1.5">
            {/* A finished phase shows what it cost; a bar only makes sense while there is an estimate to measure against. */}
            {!done && ph.budget ? <BudgetBar spent={spent} budget={ph.budget} label={name} /> : null}
            <span className="flex items-center justify-between gap-2 text-sm">
              <span>
                {done ? t('phases.finalCost') : t('phases.spent')}: <strong className="tabular">{money(spent)}</strong>
              </span>
              <span className="tabular text-muted-foreground">
                {done ? (ph.budget ? `${t('phases.budget').replace(/\s*\(.*\)/, '')}: ${money(ph.budget)}` : '') : ph.budget ? money(ph.budget) : spent > 0 || planned > 0 ? t('phases.noEstimate') : t('phases.notStarted')}
              </span>
            </span>
            {planned > 0 && (
              <span className="text-sm text-muted-foreground">
                {t('phases.planned')}: <span className="tabular">{money(planned)}</span>
              </span>
            )}
          </span>
        </Link>
        {editable && (
          <div className="flex shrink-0 justify-end gap-2 max-sm:col-start-2 max-sm:row-start-1">
            <Tip label={done ? t('phases.reopen') : t('phases.markDone')}>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={done ? t('phases.reopenNamed', { name }) : t('phases.markDoneNamed', { name })}
                className={cn('max-sm:hidden', done && 'border-success/40 text-success')}
                // Safari does not focus a button when it is clicked; focus it so the box gives the focus back here when it closes.
                onClick={(e) => {
                  e.currentTarget.focus()
                  onToggleDone()
                }}
              >
                {done ? <RotateCcw aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
              </Button>
            </Tip>
            {/* More actions: edit and delete. Delete asks first (see ConfirmDialog). */}
            <DropdownMenu>
              <Tip label={t('phases.more')}>
                <DropdownMenuTrigger asChild>
                  <Button ref={triggerRef} size="icon-sm" variant="outline" aria-label={t('phases.moreNamed', { name })}>
                    <EllipsisVertical aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </Tip>
              <DropdownMenuContent
                onCloseAutoFocus={(e) => {
                  if (launching.current) {
                    e.preventDefault()
                    launching.current = false
                  }
                }}
              >
                {/* On a phone the tick button is not on the row (room is tight), so completing a phase lives in this menu. */}
                <DropdownMenuItem className="sm:hidden" onSelect={() => launch(onToggleDone)}>
                  {done ? <RotateCcw aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                  {done ? t('phases.reopen') : t('phases.markDone')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => launch(onEdit)}>
                  <Pencil aria-hidden="true" />
                  {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => launch(onDelete)}>
                  <Trash2 aria-hidden="true" />
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * Asks before a phase is marked complete or reopened, because it changes how the phase is counted: a finished phase shows its final cost
 * and never alerts; an unfinished one is measured against its estimate again. Open while `phase` is set.
 */
function ConfirmPhaseDone({ phase, spent, onClose }: { phase?: Phase; spent: number; onClose: () => void }) {
  const { t, phaseName } = useApp()
  const toast = useToast()
  // Keep the wording of the phase that was asked about while the box fades out.
  const last = useRef<{ phase: Phase; spent: number }>(undefined)
  if (phase) last.current = { phase, spent }
  const shown = phase ?? last.current?.phase
  const done = Boolean(shown?.done)
  const name = shown ? phaseName(shown) : ''
  return (
    <ConfirmDialog
      open={Boolean(phase)}
      title={t(done ? 'phases.reopenTitle' : 'phases.doneTitle', { name })}
      description={t(done ? 'phases.reopenBody' : 'phases.doneBody', { amount: money(last.current?.spent ?? 0) })}
      confirmLabel={t(done ? 'phases.reopen' : 'phases.markDone')}
      onClose={onClose}
      onConfirm={() => {
        if (!phase) return
        void setPhaseDone(phase.id, !phase.done)
        toast.show({ kind: 'success', message: t(phase.done ? 'phases.reopenedToast' : 'phases.doneToast', { name }) })
        onClose()
      }}
    />
  )
}

/** What is being dragged right now: which phase, which slot it would drop into, and where the pointer is. */
type Drag = { id: string; to: number; y: number }
/** Facts about the drag that do not change while it lasts. */
type DragMeta = { from: number; height: number; width: number; left: number; offsetY: number }

export function Phases() {
  const { t, project, phaseName, can } = useApp()
  const editable = can('editPhases')
  const phases = usePhases(project?.id)
  // Worked out from the saved order, so the colours hold still while a row is being dragged.
  const phaseColour = useMemo(() => colourMap(phases.map((p) => p.id)), [phases])
  const payments = usePayments(project?.id).filter((p) => !p.deletedAt)
  const [adding, setAdding] = useState(false)
  // Phone only: the phases nothing has happened in yet are folded away at the end of the list; this opens them.
  const [showUntouched, setShowUntouched] = useState(false)
  const [editing, setEditing] = useState<Phase>()
  const [deleting, setDeleting] = useState<Phase>()
  const [toggling, setToggling] = useState<Phase>()
  const toast = useToast()

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
        if (r && r.height > 0 && centre > r.top + r.height / 2) to++
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

  // A phase nothing has happened in: no payment (paid or planned), no estimate, not finished. On a phone those that sit together at the end of the list
  // are folded away (and counted on a button), so the page starts with the work that is going on. The order is untouched: the rows are only hidden,
  // so dragging and the arrow keys behave as before. When every phase is untouched (a new project) nothing folds.
  const untouched = (p: Phase) => !p.done && !p.budget && !payments.some((x) => x.phaseId === p.id && (isSpent(x) || isPlanned(x)))
  let cut = shown.length
  while (cut > 0 && untouched(shown[cut - 1])) cut--
  const foldedIds = new Set(!showUntouched && cut > 0 ? shown.slice(cut).map((p) => p.id) : [])
  const foldable = cut > 0 ? shown.length - cut : 0

  return (
    <>
      <PageHeader
        title={t('phases.title')}
        actions={
          editable && (
            <Button
              variant="secondary"
              onClick={() => {
                setShowUntouched(true)
                setAdding(true)
              }}
            >
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
          <BudgetOutlookCard phases={phases} payments={payments} />
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
                  className={cn(foldedIds.has(s.ph.id) && 'max-sm:hidden')}
                >
                  <PhaseRow
                    ph={s.ph}
                    num={i + 1}
                    colour={phaseColour.get(s.ph.id) ?? ''}
                    payments={payments}
                    editable={editable}
                    canDrag={canDrag}
                    onEdit={() => setEditing(s.ph)}
                    onDelete={() => setDeleting(s.ph)}
                    onToggleDone={() => setToggling(s.ph)}
                    onGrab={(e) => grab(e, s.ph)}
                  />
                </li>
              ),
            )}
          </ul>
          {foldable > 0 && (
            <Button type="button" variant="outline" aria-expanded={showUntouched} className="w-full sm:hidden" onClick={() => setShowUntouched((v) => !v)}>
              {showUntouched ? t('phases.hideNotStarted') : t('phases.showNotStarted', { count: foldable })}
            </Button>
          )}
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
                colour={phaseColour.get(dragged.id) ?? ''}
                payments={payments}
                editable={false}
                canDrag
                onEdit={() => {}}
                onDelete={() => {}}
                onToggleDone={() => {}}
                onGrab={() => {}}
              />
            </div>
          )}
        </>
      )}

      <PhaseDialog open={adding} onClose={() => setAdding(false)} />
      <PhaseDialog open={Boolean(editing)} phase={editing} onClose={() => setEditing(undefined)} />
      <ConfirmPhaseDone phase={toggling} spent={toggling ? sum(payments.filter((p) => p.phaseId === toggling.id && isSpent(p))) : 0} onClose={() => setToggling(undefined)} />
      <ConfirmDialog
        destructive
        open={Boolean(deleting)}
        title={t('phases.deleteTitle', { name: deleting ? phaseName(deleting) : '' })}
        description={t('phases.deleteBody')}
        confirmLabel={t('common.delete')}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => {
          if (!deleting) return
          const gone = phaseName(deleting)
          void deletePhase(deleting.id).then(() => toast.show({ kind: 'info', message: t('phases.deletedNamed', { name: gone }) }))
          setDeleting(undefined)
        }}
      />
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
  const [confirmDone, setConfirmDone] = useState(false)
  // The phone menu (three dots): like the one on a phase row, a dialog opened from it starts after the menu is gone and gives the focus back to its button.
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const launching = useRef(false)
  const launch = (open: () => void) => {
    launching.current = true
    setTimeout(() => {
      menuTrigger.current?.focus()
      open()
    }, 0)
  }
  const phase = phases.find((p) => p.id === id)
  if (!phase) return null
  const fig = phaseFigures(payments, phase.budget)
  const spent = fig.spent
  const done = Boolean(phase.done)
  const state = budgetState(spent, phase.budget, done)
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]))
  const bought = priceRows(payments)
  const where = spentBy(payments, (p) => (p.vendorId && vendorName.get(p.vendorId)) || p.payeeName || t('reports.noVendor'))

  return (
    // The parts of a phase page sit a little closer on a phone (10 px instead of 16); from a small tablet up the gap is the page's usual one.
    <div className="grid min-w-0 gap-2.5 sm:gap-6">
      <div className="grid gap-1">
        <BackLink to="/phases" label={t('phases.title')} />
        <PageHeader
          title={phaseName(phase)}
          titleClassName="max-sm:text-lg max-sm:leading-snug"
          actionsBeside
          actions={
            <>
              {/* On a phone a plus button (the words are kept for screen readers), so the heading has the room to stay on one line. */}
              <Button variant="secondary" asChild className="max-sm:w-10 max-sm:px-0">
                <Link to={`/add?phase=${phase.id}`}>
                  <Plus aria-hidden="true" />
                  <span className="max-sm:sr-only">{t('pay.add')}</span>
                </Link>
              </Button>
              <Button
                variant="outline"
                className="max-sm:hidden"
                onClick={(e) => {
                  e.currentTarget.focus()
                  setConfirmDone(true)
                }}
              >
                {phase.done ? <RotateCcw aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                {phase.done ? t('phases.reopen') : t('phases.markDone')}
              </Button>
              <Button asChild variant="outline" className="max-sm:hidden">
                <Link to={`/statements?phase=${phase.id}`}>
                  <FileText aria-hidden="true" />
                  {t('stmt.open')}
                </Link>
              </Button>
              {editable && (
                <>
                  <Button variant="outline" className="max-sm:hidden" onClick={() => setEditing(true)}>
                    <Pencil aria-hidden="true" />
                    {t('common.edit')}
                  </Button>
                  <Button variant="destructive" className="max-sm:hidden" onClick={() => setConfirmDelete(true)}>
                    <Trash2 aria-hidden="true" />
                    {t('common.delete')}
                  </Button>
                </>
              )}
              {/* On a phone the other actions are in one menu, so the top of the page is not a wall of buttons. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button ref={menuTrigger} size="icon" variant="outline" className="sm:hidden" aria-label={t('phases.moreNamed', { name: phaseName(phase) })}>
                    <EllipsisVertical aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  onCloseAutoFocus={(e) => {
                    if (launching.current) {
                      e.preventDefault()
                      launching.current = false
                    }
                  }}
                >
                  <DropdownMenuItem onSelect={() => launch(() => setConfirmDone(true))}>
                    {phase.done ? <RotateCcw aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                    {phase.done ? t('phases.reopen') : t('phases.markDone')}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to={`/statements?phase=${phase.id}`}>
                      <FileText aria-hidden="true" />
                      {t('stmt.open')}
                    </Link>
                  </DropdownMenuItem>
                  {editable && (
                    <>
                      <DropdownMenuItem onSelect={() => launch(() => setEditing(true))}>
                        <Pencil aria-hidden="true" />
                        {t('common.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem destructive onSelect={() => launch(() => setConfirmDelete(true))}>
                        <Trash2 aria-hidden="true" />
                        {t('common.delete')}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
      </div>

      {phase.done && (
        <Badge variant="success" className="w-fit">
          <CircleCheck aria-hidden="true" data-solid="" />
          {t('phases.done')}
        </Badge>
      )}

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span>
            {done ? t('phases.finalCost') : t('phases.spent')}: <strong className="tabular">{money(spent)}</strong>
          </span>
          <span className="tabular text-muted-foreground">{phase.budget ? `${t('phases.budget').replace(/\s*\(.*\)/, '')}: ${money(phase.budget)}` : t('phases.noEstimate')}</span>
        </div>
        {/* While the work goes on, a bar against the estimate (if there is one). Once it is finished, only the verdict on the cost. */}
        {!done && phase.budget ? <BudgetBar spent={spent} budget={phase.budget} label={phaseName(phase)} /> : null}
        {phase.budget ? (
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {!done && <span>{t('phases.used', { pct: percent(spent, phase.budget) })}</span>}
            <BudgetChip state={state} spent={spent} estimate={phase.budget} />
          </span>
        ) : null}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-4">
          {phase.budget && !done ? (
            <div>
              <dt className="text-sm text-muted-foreground">{fig.over > 0 ? t('phases.overBy') : t('phases.left')}</dt>
              <dd className={cn('tabular font-semibold', state === 'over' && 'text-danger', state === 'overSlight' && 'text-warning')}>{money(fig.over > 0 ? fig.over : fig.left)}</dd>
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
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeading icon={ChartPie} className="p-4">{t('phases.whereMoney')}</CardHeading>
          <ul className="divide-y border-t">
            {where.map((r) => (
              <li key={r.label} className="grid gap-1.5 px-4 py-3">
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
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeading icon={Package} className="p-4">{t('phases.materials')}</CardHeading>
          <ul className="divide-y border-t">
            {bought.map((r) => (
              <li key={r.key} className="flex items-start justify-between gap-3 px-4 py-3">
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
        <CardHeading icon={ReceiptText} className="p-4">{t('phases.payments')}</CardHeading>
        {payments.length === 0 ? <EmptyState compact icon={ReceiptText} title={t('home.recentEmpty')} /> : <PaymentsTable payments={payments} showPhase={false} />}
      </Card>

      <PhaseDialog open={editing} phase={phase} onClose={() => setEditing(false)} />
      <ConfirmPhaseDone phase={confirmDone ? phase : undefined} spent={spent} onClose={() => setConfirmDone(false)} />
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
    </div>
  )
}
