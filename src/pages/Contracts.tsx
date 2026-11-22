import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Ban, CalendarClock, CalendarPlus, CircleCheck, FilePlus2, FileSignature, FileText, HandCoins, Hourglass, Pencil, Plus, ReceiptText, RotateCcw, SearchX, Trash2, Wallet } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { CardHeading, IconTile } from '@/components/CardHeading'
import { MESH_TILE, meshCard } from '@/lib/mesh'
import { cn } from '@/lib/utils'
import { BackLink, EmptyState, PageHeader, StatusPill } from '@/components/common'
import { ContractBar, ContractPill } from '@/components/ContractParts'
import { ContractDialog, VariationDialog } from '@/components/ContractDialog'
import { DueActions } from '@/components/DueActions'
import { InstalmentsDialog } from '@/components/InstalmentsDialog'
import { PaymentsTable } from '@/components/PaymentsTable'
import { useToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ViewTabs } from '@/components/ui/tabs'
import { deleteContract, removeVariation, restoreContract, saveContract } from '@/db/actions'
import { useContracts, usePayments, usePhases, useVendors } from '@/db/hooks'
import type { Contract, ContractStatus, ContractVariation } from '@/db/types'
import type { Key } from '@/i18n/en'
import { contractPayments, nextInstalment, summarizeContract, unplannedBalance } from '@/lib/contracts'
import { formatDate, money, todayISO } from '@/lib/format'
import { isPlanned } from '@/lib/stats'

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'success' }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className={`tabular text-lg font-extrabold ${tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : ''}`}>{value}</dd>
    </div>
  )
}

export function Contracts() {
  const { t, lang, project, can } = useApp()
  const editable = can('editContracts')
  const contracts = useContracts(project?.id)
  const payments = usePayments(project?.id)
  const vendors = useVendors(project?.id)
  const [filter, setFilter] = useState<'active' | ContractStatus | 'all'>('active')
  const [adding, setAdding] = useState(false)
  const nav = useNavigate()

  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors])
  const rows = useMemo(
    () =>
      contracts
        .map((c) => {
          const s = summarizeContract(c, payments)
          return { c, s, next: nextInstalment(c, payments, todayISO()), unplanned: unplannedBalance(s) }
        })
        .filter(({ c }) => filter === 'all' || c.status === filter),
    [contracts, payments, filter],
  )
  const live = contracts.filter((c) => c.status === 'active').map((c) => summarizeContract(c, payments))
  const sumOf = (f: (s: ReturnType<typeof summarizeContract>) => number) => live.reduce((n, s) => n + f(s), 0)

  return (
    <>
      <PageHeader
        title={t('nav.contracts')}
        actions={
          editable && (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" />
              {t('contract.add')}
            </Button>
          )
        }
      />

      {contracts.length === 0 ? (
        <Card>
          <EmptyState icon={FileSignature} title={t('contract.empty')} body={t('contract.emptyBody')} />
        </Card>
      ) : (
        <>
          <section aria-label={t('contract.summary')} className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
            {[
              [t('contract.agreed'), sumOf((s) => s.total), FileSignature],
              [t('contract.paid'), sumOf((s) => s.paid), CircleCheck],
              [t('contract.remaining'), sumOf((s) => Math.max(0, s.remaining)), Wallet],
              [t('contract.awaiting'), sumOf((s) => s.awaiting), Hourglass],
            ].map(([label, v, Icon], i) => {
              const I = Icon as typeof FileSignature
              return (
                <div key={label as string} className={cn('flex flex-col gap-2 rounded-xl border p-3 sm:gap-3 sm:p-4', meshCard(i))}>
                  <span className="flex items-center gap-2 sm:contents">
                    <span aria-hidden="true" className={cn('grid size-8 shrink-0 place-items-center rounded-lg sm:size-12 sm:rounded-xl', MESH_TILE)}>
                      <I className="size-[1.125rem] sm:size-6" strokeWidth={1.75} />
                    </span>
                    <p className="min-w-0 truncate text-sm font-medium text-muted-foreground sm:hidden">{label as string}</p>
                  </span>
                  <div className="grid min-w-0 gap-1">
                    <p className="text-sm font-medium text-muted-foreground max-sm:hidden">{label as string}</p>
                    <p className="tabular text-[1.0625rem] font-extrabold whitespace-nowrap sm:text-2xl">{money(v as number)}</p>
                  </div>
                </div>
              )
            })}
          </section>
          <p className="-mt-3 text-sm text-muted-foreground">{t('contract.summaryNote')}</p>

          <ViewTabs
            label={t('contract.status')}
            value={filter}
            onValueChange={(v) => setFilter(v as typeof filter)}
            tabs={(['active', 'completed', 'cancelled', 'all'] as const).map((f) => ({ value: f, label: f === 'all' ? t('common.all') : t(`contract.status.${f}` as Key) }))}
          />

          {rows.length === 0 ? (
            <Card>
              <EmptyState icon={SearchX} title={t('contract.noMatch')} action={<Button variant="outline" onClick={() => setFilter('all')}>{t('contract.showAll')}</Button>} />
            </Card>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {rows.map(({ c, s, next, unplanned }) => (
                <li key={c.id}>
                  <Card className="gap-3 p-4 transition-colors hover:bg-muted/40">
                    <Link to={`/contracts/${c.id}`} className="grid gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                      <span className="flex items-start justify-between gap-3">
                        <span className="grid min-w-0 gap-0.5">
                          <span className="text-lg font-bold [overflow-wrap:anywhere]">{c.title}</span>
                          <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                            {[c.vendorId && vendorName.get(c.vendorId), formatDate(c.date, lang)].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <ContractPill state={s.state} />
                          {c.status !== 'active' && <Badge variant="neutral">{t(`contract.status.${c.status}` as Key)}</Badge>}
                        </span>
                      </span>
                      <ContractBar pct={s.pct} state={s.state} label={t('contract.paidPct', { pct: s.pct })} />
                      <span className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="tabular text-muted-foreground">
                          {money(s.paid)} / {money(s.total)}
                        </span>
                        <span className={`tabular font-semibold ${s.state === 'overpaid' ? 'text-danger' : ''}`}>
                          {s.state === 'overpaid' ? t('contract.overBy', { amount: money(s.over) }) : t('contract.left', { amount: money(s.remaining) })}
                        </span>
                      </span>
                      {c.status === 'active' && (next || unplanned > 0) && (
                        <span className="grid gap-1 border-t pt-2.5 text-sm">
                          {next ? (
                            <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                              <span className="min-w-0">
                                <span className="text-muted-foreground">{t('contract.nextLabel')}: </span>
                                <span className="font-semibold">{formatDate(next.payment.date, lang)}</span>
                              </span>
                              <span className="flex items-center gap-2">
                                {next.overdue && <Badge variant="warning">{t('status.overdue')}</Badge>}
                                <span className="tabular font-bold">{money(next.payment.amount)}</span>
                              </span>
                            </span>
                          ) : null}
                          {next && next.more > 0 && <span className="text-muted-foreground">{t('contract.nextMore', { count: next.more })}</span>}
                          {unplanned > 0 && <span className="text-muted-foreground">{t('contract.noDay', { amount: money(unplanned) })}</span>}
                        </span>
                      )}
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ContractDialog open={adding} onClose={() => setAdding(false)} onSaved={(id) => nav(`/contracts/${id}`)} />
    </>
  )
}

export function ContractDetail() {
  const { id } = useParams()
  const { t, lang, project, phaseName, can } = useApp()
  const editable = can('editContracts')
  const toast = useToast()
  const nav = useNavigate()
  const contract = useContracts(project?.id).find((c) => c.id === id)
  const payments = usePayments(project?.id)
  const vendors = useVendors(project?.id)
  const phases = usePhases(project?.id)
  const [editing, setEditing] = useState(false)
  const [variation, setVariation] = useState<{ open: boolean; v?: ContractVariation }>({ open: false })
  const [planning, setPlanning] = useState(false)

  if (!contract) return null
  const s = summarizeContract(contract, payments)
  const mine = contractPayments(contract, payments).sort((a, b) => b.date.localeCompare(a.date))
  const vendor = vendors.find((v) => v.id === contract.vendorId)
  const phase = phases.find((p) => p.id === contract.phaseId)
  const varTotal = s.total - contract.amount
  // The schedule: the planned payments of this contract by day, and what is left with no day yet.
  const scheduled = mine.filter(isPlanned).sort((a, b) => a.date.localeCompare(b.date))
  const unplanned = unplannedBalance(s)
  const canPlan = contract.status === 'active' && unplanned > 0

  const setStatus = async (next: ContractStatus) => {
    await saveContract({ ...(contract as Contract), status: next })
    toast.show({ kind: 'success', message: t('contract.saved') })
  }
  const remove = async () => {
    await deleteContract(contract.id)
    toast.show({ kind: 'info', message: t('contract.deleted'), actionLabel: t('common.undo'), onAction: () => void restoreContract(contract.id), duration: 8000 })
    nav('/contracts')
  }

  return (
    <>
      <BackLink to="/contracts" label={t('nav.contracts')} />
      <PageHeader
        title={contract.title}
        subtitle={[vendor?.name, phase && phaseName(phase), formatDate(contract.date, lang)].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/add?contract=${contract.id}`}>
                <Plus aria-hidden="true" />
                {t('contract.addPayment')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/statements?contract=${contract.id}`}>
                <FileText aria-hidden="true" />
                {t('stmt.open')}
              </Link>
            </Button>
            {editable && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil aria-hidden="true" />
                {t('common.edit')}
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ContractPill state={s.state} />
        {contract.status !== 'active' && <Badge variant="neutral">{t(`contract.status.${contract.status}` as Key)}</Badge>}
      </div>

      <div className="grid items-start gap-6 md:grid-cols-12">
        <Card className="md:col-span-7">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-lg"><IconTile icon={FileText} />{t('contract.summary')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ContractBar pct={s.pct} state={s.state} label={t('contract.paidPct', { pct: s.pct })} />
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Figure label={t('contract.original')} value={money(contract.amount)} />
              <Figure label={t('contract.variationsTotal')} value={`${varTotal > 0 ? '+' : ''}${money(varTotal)}`} />
              <Figure label={t('contract.total')} value={money(s.total)} />
              <Figure label={t('contract.paid')} value={money(s.paid)} />
              <Figure
                label={s.state === 'overpaid' ? t('contract.overpaid') : t('contract.remaining')}
                value={money(s.state === 'overpaid' ? s.over : s.remaining)}
                tone={s.state === 'overpaid' ? 'danger' : s.state === 'fullyPaid' ? 'success' : undefined}
              />
              {s.planned > 0 && <Figure label={t('contract.planned')} value={money(s.planned)} />}
            </dl>
            {s.awaiting > 0 && <p className="rounded-xl bg-warning-soft p-3 text-sm font-semibold text-warning">{t('contract.awaitingNote', { amount: money(s.awaiting) })}</p>}
            {s.state === 'overpaid' && <p role="status" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{t('contract.overNote', { amount: money(s.over) })}</p>}
            {contract.note && <p className="whitespace-pre-wrap text-muted-foreground">{contract.note}</p>}
            {editable && <div className="flex flex-wrap gap-2">
              {contract.status === 'active' ? (
                <>
                  <Button variant="outline" onClick={() => void setStatus('completed')}>
                    <CircleCheck aria-hidden="true" />
                    {t('contract.markCompleted')}
                  </Button>
                  <Button variant="outline" onClick={() => void setStatus('cancelled')}>
                    <Ban aria-hidden="true" />
                    {t('contract.markCancelled')}
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => void setStatus('active')}>
                  <RotateCcw aria-hidden="true" />
                  {t('contract.reopen')}
                </Button>
              )}
              <Button variant="outline" onClick={() => void remove()}>
                <Trash2 aria-hidden="true" />
                {t('common.delete')}
              </Button>
            </div>}
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0 md:col-span-5" aria-labelledby="var-title">
          <div className="flex items-center justify-between gap-3 p-4">
            <CardHeading icon={FilePlus2} id="var-title">
              {t('contract.variations')}
            </CardHeading>
            {editable && (
              <Button size="sm" variant="outline" onClick={() => setVariation({ open: true })}>
                <Plus aria-hidden="true" />
                {t('contract.addVariation')}
              </Button>
            )}
          </div>
          {contract.variations.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">{t('contract.noVariations')}</p>
          ) : (
            <ul className="divide-y border-t">
              {contract.variations.map((v) => (
                <li key={v.id} className="flex items-center gap-2 p-4">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate font-semibold">{v.title}</span>
                    <span className="text-sm text-muted-foreground">{formatDate(v.date, lang)}</span>
                  </span>
                  <span className={`tabular font-bold whitespace-nowrap ${v.amount < 0 ? 'text-success' : ''}`}>
                    {v.amount > 0 ? '+' : '−'}
                    {money(Math.abs(v.amount))}
                  </span>
                  {editable && (
                    <>
                      <Button variant="ghost" size="icon" aria-label={`${t('common.edit')}: ${v.title}`} onClick={() => setVariation({ open: true, v })}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`${t('common.delete')}: ${v.title}`} onClick={() => void removeVariation(contract.id, v.id)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {(scheduled.length > 0 || canPlan) && (
        <Card className="gap-0 overflow-hidden py-0" aria-labelledby="sch-title">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="grid gap-0.5">
              <CardHeading icon={CalendarClock} id="sch-title">
                {t('contract.schedule')}
              </CardHeading>
              <p className="text-sm text-muted-foreground">{t('contract.scheduleSub')}</p>
            </div>
            {canPlan && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <Link to={`/add?contract=${contract.id}&amount=${unplanned}`}>
                    <HandCoins aria-hidden="true" />
                    {t('contract.payNow', { amount: money(unplanned) })}
                  </Link>
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPlanning(true)}>
                  <CalendarPlus aria-hidden="true" />
                  {scheduled.length > 0 ? t('contract.planRest', { amount: money(unplanned) }) : t('contract.planButton')}
                </Button>
              </div>
            )}
          </div>
          {unplanned > 0 && (
            <p className="mx-4 mb-4 flex flex-wrap items-baseline justify-between gap-x-4 rounded-xl bg-muted/60 p-3 text-sm">
              <span className="text-muted-foreground">{t('contract.notPlanned')}</span>
              <strong className="tabular">{money(unplanned)}</strong>
            </p>
          )}
          {scheduled.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">{t('contract.scheduleEmpty')}</p>
          ) : (
            <ul className="divide-y border-t">
              {scheduled.map((p) => (
                <li key={p.id} className="grid gap-3 p-4">
                  <Link to={`/payments/${p.id}`} className="grid min-w-0 gap-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold [overflow-wrap:anywhere]">{p.purpose}</span>
                      <span className="tabular font-bold whitespace-nowrap">{money(p.amount)}</span>
                    </span>
                    <span className="text-sm text-muted-foreground">{formatDate(p.date, lang)}</span>
                    <StatusPill payment={p} />
                  </Link>
                  <DueActions payment={p} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card className="gap-0 overflow-hidden py-0" aria-labelledby="cp-title">
        <CardHeading icon={ReceiptText} id="cp-title" className="p-4">
          {t('contract.payments')} ({mine.length})
        </CardHeading>
        {mine.length === 0 ? <EmptyState compact icon={ReceiptText} title={t('contract.noPayments')} body={t('contract.noPaymentsBody')} /> : <PaymentsTable payments={mine} />}
      </Card>

      <ContractDialog open={editing} contract={contract} onClose={() => setEditing(false)} />
      <InstalmentsDialog open={planning} contract={contract} unplanned={unplanned} payments={mine} onClose={() => setPlanning(false)} />
      <VariationDialog open={variation.open} contractId={contract.id} variation={variation.v} onClose={() => setVariation({ open: false })} />
    </>
  )
}
