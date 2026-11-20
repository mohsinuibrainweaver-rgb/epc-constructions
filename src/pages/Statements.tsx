import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, FileText, Printer, Share2 } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { EmptyState, PageHeader } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dropdown } from '@/components/ui/dropdown'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { useContracts, usePayments, usePhases, useVendors } from '@/db/hooks'
import type { Payment } from '@/db/types'
import type { Key } from '@/i18n/en'
import { summarizeContract } from '@/lib/contracts'
import { csvEscape, download, formatDate, money, todayISO } from '@/lib/format'
import { buildStatement, type StatementScope } from '@/lib/statements'
import { isAwaitingApproval, isPlanned } from '@/lib/stats'

function initialScope(sp: URLSearchParams): StatementScope {
  if (sp.get('vendor')) return 'vendor'
  if (sp.get('phase')) return 'phase'
  if (sp.get('contract')) return 'contract'
  return 'all'
}

export function Statements() {
  const { t, lang, project, settings, phaseName } = useApp()
  const toast = useToast()
  const [sp] = useSearchParams()
  const payments = usePayments(project?.id)
  const vendors = useVendors(project?.id)
  const phases = usePhases(project?.id)
  const contracts = useContracts(project?.id)

  const [scope, setScope] = useState<StatementScope>(initialScope(sp))
  const [vendorId, setVendorId] = useState(sp.get('vendor') ?? '')
  const [phaseId, setPhaseId] = useState(sp.get('phase') ?? '')
  const [contractId, setContractId] = useState(sp.get('contract') ?? '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [includePlanned, setIncludePlanned] = useState(false)
  const [includePending, setIncludePending] = useState(false)

  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors])
  const phaseLabel = useMemo(() => new Map(phases.map((p) => [p.id, phaseName(p)])), [phases, phaseName])
  const contract = contracts.find((c) => c.id === contractId)

  const result = useMemo(
    () => buildStatement(payments, { scope, vendorId, phaseId, contractId, from, to, includePlanned, includePending }),
    [payments, scope, vendorId, phaseId, contractId, from, to, includePlanned, includePending],
  )

  const what =
    scope === 'vendor'
      ? vendorName.get(vendorId)
      : scope === 'phase'
        ? phaseLabel.get(phaseId)
        : scope === 'contract'
          ? contract?.title
          : undefined
  const title = what ? t('stmt.forWhat', { what }) : t('stmt.forProject')
  const period = from || to ? t('stmt.period', { from: from ? formatDate(from, lang) : '…', to: to ? formatDate(to, lang) : '…' }) : t('stmt.allDates')
  const needsChoice = (scope === 'vendor' && !vendorId) || (scope === 'phase' && !phaseId) || (scope === 'contract' && !contractId)
  const who = (p: Payment) => (p.vendorId && vendorName.get(p.vendorId)) || p.payeeName || '—'
  const stateLabel = (p: Payment): string =>
    isAwaitingApproval(p) ? t('approval.pending') : isPlanned(p) ? t('status.planned') : p.status === 'advance' ? t('status.advance') : t('status.paid')

  if (!project) return null

  const exportCsv = () => {
    // The bank columns come last, so the columns people already use keep their places.
    const head = ['date', 'purpose', 'vendor_or_payee', 'phase', 'mode', 'paid_by', 'status', 'amount', 'bank_name', 'bank_account', 'bank_ref']
    const lines = result.rows.map((p) =>
      [
        p.date,
        p.purpose,
        who(p),
        (p.phaseId && phaseLabel.get(p.phaseId)) || '',
        p.mode,
        p.paidBy,
        isAwaitingApproval(p) ? 'awaiting approval' : p.status,
        p.amount,
        p.mode === 'bank' ? (p.bankName ?? '') : '',
        p.mode === 'bank' ? (p.bankAccount ?? '') : '',
        p.mode === 'bank' ? (p.bankRef ?? '') : '',
      ]
        .map(csvEscape)
        .join(','),
    )
    download(`${project.name} - ${what ?? 'statement'}.csv`, '﻿' + [head.join(','), ...lines, ['', '', '', '', '', '', 'total', result.total].map(csvEscape).join(',')].join('\n'), 'text/csv;charset=utf-8')
  }

  const share = async () => {
    const text = [
      `${project.name} — ${title}`,
      period,
      ...result.rows.map((p) => `${formatDate(p.date, lang)}  ${money(p.amount)}  ${p.purpose}${who(p) !== '—' ? ` (${who(p)})` : ''}`),
      `${t('stmt.total')}: ${money(result.total)}`,
    ].join('\n')
    try {
      if (navigator.share) await navigator.share({ title: `${project.name} — ${title}`, text })
      else {
        await navigator.clipboard.writeText(text)
        toast.show({ kind: 'success', message: t('stmt.copied') })
      }
    } catch {
      /* the share sheet was dismissed */
    }
  }

  const cs = scope === 'contract' && contract ? summarizeContract(contract, payments) : undefined
  const showSign = scope === 'vendor' || scope === 'contract'

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={t('nav.statements')}
          actions={
            <>
              <Button variant="secondary" onClick={() => window.print()} disabled={needsChoice}>
                <Printer aria-hidden="true" />
                {t('stmt.print')}
              </Button>
              <Button variant="outline" onClick={exportCsv} disabled={needsChoice || result.rows.length === 0}>
                <Download aria-hidden="true" />
                {t('common.export')}
              </Button>
              <Button variant="outline" onClick={() => void share()} disabled={needsChoice || result.rows.length === 0}>
                <Share2 aria-hidden="true" />
                {t('stmt.share')}
              </Button>
            </>
          }
        />
        <p className="mt-2 text-sm text-muted-foreground">{t('stmt.pdfHint')}</p>
      </div>

      <Card className="grid gap-4 p-4 print:hidden">
        <div className="grid items-start gap-3 md:grid-cols-[auto_1fr]">
          <PillRadioGroup aria-label={t('stmt.scope')} value={scope} onValueChange={(v) => setScope(v as StatementScope)}>
            {(['all', 'vendor', 'phase', 'contract'] as StatementScope[]).map((s) => (
              <PillRadioItem key={s} value={s}>
                {t(`stmt.scope.${s}` as Key)}
              </PillRadioItem>
            ))}
          </PillRadioGroup>
          {scope === 'vendor' && (
            <Dropdown aria-label={t('stmt.chooseVendor')} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">{t('stmt.chooseVendor')}</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Dropdown>
          )}
          {scope === 'phase' && (
            <Dropdown aria-label={t('stmt.choosePhase')} value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
              <option value="">{t('stmt.choosePhase')}</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {phaseName(p)}
                </option>
              ))}
            </Dropdown>
          )}
          {scope === 'contract' && (
            <Dropdown aria-label={t('stmt.chooseContract')} value={contractId} onChange={(e) => setContractId(e.target.value)}>
              <option value="">{t('stmt.chooseContract')}</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Dropdown>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="stmt-from" className="text-sm font-semibold">
              {t('stmt.from')}
            </Label>
            <Input id="stmt-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="stmt-to" className="text-sm font-semibold">
              {t('stmt.to')}
            </Label>
            <Input id="stmt-to" type="date" value={to} min={from || undefined} max={todayISO()} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-2">
          <label className="flex items-center gap-3">
            <Checkbox checked={includePlanned} onCheckedChange={(c) => setIncludePlanned(c === true)} />
            <span>{t('stmt.includePlanned')}</span>
          </label>
          <label className="flex items-center gap-3">
            <Checkbox checked={includePending} onCheckedChange={(c) => setIncludePending(c === true)} />
            <span>{t('stmt.includePending')}</span>
          </label>
        </div>
      </Card>

      {needsChoice ? (
        <Card className="print:hidden">
          <EmptyState icon={FileText} title={t('stmt.pickFirst')} body={t('stmt.pickFirstBody')} />
        </Card>
      ) : (
        <article
          aria-label={`${project.name} — ${title}`}
          className="grid gap-6 rounded-2xl border bg-card p-5 sm:p-8 print:gap-4 print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
          <header className="grid gap-1 border-b pb-4">
            <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t('stmt.heading')}</p>
            <h2 className="text-2xl font-semibold text-balance">{title}</h2>
            <p className="font-semibold">{project.name}</p>
            {project.location && <p className="text-muted-foreground">{project.location}</p>}
            <p className="text-sm text-muted-foreground">
              {period} · {t('stmt.preparedOn', { date: formatDate(todayISO(), lang) })}
              {settings.userName ? ` · ${t('stmt.preparedBy', { name: settings.userName })}` : ''}
            </p>
          </header>

          {cs && contract && (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                [t('contract.original'), money(contract.amount)],
                [t('contract.variationsTotal'), `${cs.total - contract.amount > 0 ? '+' : ''}${money(cs.total - contract.amount)}`],
                [t('contract.total'), money(cs.total)],
                [t('contract.paid'), money(cs.paid)],
                [cs.state === 'overpaid' ? t('contract.overpaid') : t('contract.remaining'), money(cs.state === 'overpaid' ? cs.over : cs.remaining)],
              ].map(([k, v]) => (
                <div key={k} className="grid gap-0.5">
                  <dt className="text-sm font-medium text-muted-foreground">{k}</dt>
                  <dd className="tabular font-extrabold">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {result.rows.length === 0 ? (
            <p className="text-muted-foreground">{t('stmt.nothing')}</p>
          ) : (
            <>
              {/* Narrow screens: a list. Wide screens and paper: a table. */}
              <ul className="divide-y rounded-xl border md:hidden print:hidden">
                {result.rows.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 p-3">
                    <span className="grid min-w-0 gap-0.5">
                      <span className="font-semibold break-words">{p.purpose}</span>
                      <span className="text-sm text-muted-foreground">
                        {[formatDate(p.date, lang), who(p) !== '—' && who(p), p.phaseId && phaseLabel.get(p.phaseId), t(`mode.${p.mode}` as Key)].filter(Boolean).join(' · ')}
                      </span>
                      {(isPlanned(p) || isAwaitingApproval(p) || p.status === 'advance') && <span className="text-sm font-semibold">{stateLabel(p)}</span>}
                    </span>
                    <span className="tabular font-bold whitespace-nowrap">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>

              <table className="hidden w-full border-collapse text-sm md:table print:table">
                <thead>
                  <tr className="border-b-2 text-start">
                    {(['date', 'purpose', 'payee', 'phase', 'mode', 'paidBy', 'status'] as const).map((c) => (
                      <th key={c} scope="col" className="px-2 py-2 text-start font-bold">
                        {t(`stmt.col.${c}` as Key)}
                      </th>
                    ))}
                    <th scope="col" className="px-2 py-2 text-end font-bold">
                      {t('stmt.col.amount')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((p) => (
                    <tr key={p.id} className="border-b break-inside-avoid">
                      <td className="px-2 py-2 whitespace-nowrap">{formatDate(p.date, lang)}</td>
                      <td className="px-2 py-2">{p.purpose}</td>
                      <td className="px-2 py-2">{who(p)}</td>
                      <td className="px-2 py-2">{(p.phaseId && phaseLabel.get(p.phaseId)) || '—'}</td>
                      <td className="px-2 py-2">{t(`mode.${p.mode}` as Key)}</td>
                      <td className="px-2 py-2">{t(`paidBy.${p.paidBy}` as Key)}</td>
                      <td className="px-2 py-2">{stateLabel(p)}</td>
                      <td className="tabular px-2 py-2 text-end font-semibold whitespace-nowrap">{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="grid gap-2 border-t-2 pt-3 break-inside-avoid">
                <div className="flex items-baseline justify-between gap-4 text-lg font-extrabold">
                  <dt>{t('stmt.total')}</dt>
                  <dd className="tabular">{money(result.total)}</dd>
                </div>
                {includePlanned && result.plannedTotal > 0 && (
                  <div className="flex items-baseline justify-between gap-4 text-muted-foreground">
                    <dt>{t('stmt.plannedTotal')}</dt>
                    <dd className="tabular">{money(result.plannedTotal)}</dd>
                  </div>
                )}
                {includePending && result.pendingTotal > 0 && (
                  <div className="flex items-baseline justify-between gap-4 text-muted-foreground">
                    <dt>{t('stmt.pendingTotal')}</dt>
                    <dd className="tabular">{money(result.pendingTotal)}</dd>
                  </div>
                )}
              </dl>

              <div className="grid gap-4 sm:grid-cols-2 break-inside-avoid">
                <section aria-label={t('stmt.byMode')} className="grid content-start gap-1">
                  <h3 className="font-semibold">{t('stmt.byMode')}</h3>
                  <p className="flex justify-between text-sm"><span>{t('mode.cash')}</span><span className="tabular">{money(result.byMode.cash)}</span></p>
                  <p className="flex justify-between text-sm"><span>{t('mode.bank')}</span><span className="tabular">{money(result.byMode.bank)}</span></p>
                </section>
                <section aria-label={t('stmt.byPaidBy')} className="grid content-start gap-1">
                  <h3 className="font-semibold">{t('stmt.byPaidBy')}</h3>
                  <p className="flex justify-between text-sm"><span>{t('paidBy.investor')}</span><span className="tabular">{money(result.byPaidBy.investor)}</span></p>
                  <p className="flex justify-between text-sm"><span>{t('paidBy.builder')}</span><span className="tabular">{money(result.byPaidBy.builder)}</span></p>
                </section>
                {scope !== 'phase' && result.byPhase.length > 1 && (
                  <section aria-label={t('stmt.byPhase')} className="grid content-start gap-1 sm:col-span-2">
                    <h3 className="font-semibold">{t('stmt.byPhase')}</h3>
                    {result.byPhase.map((b) => (
                      <p key={b.phaseId || 'none'} className="flex justify-between text-sm">
                        <span>{(b.phaseId && phaseLabel.get(b.phaseId)) || t('reports.noPhase')}</span>
                        <span className="tabular">{money(b.amount)}</span>
                      </p>
                    ))}
                  </section>
                )}
              </div>
            </>
          )}

          {showSign && (
            <div className="mt-6 grid gap-8 break-inside-avoid sm:grid-cols-3">
              {(['stmt.receivedBy', 'stmt.signature', 'stmt.signDate'] as const).map((k) => (
                <div key={k} className="grid gap-8">
                  <span className="text-sm text-muted-foreground">{t(k)}</span>
                  <span className="border-b border-foreground/40" />
                </div>
              ))}
            </div>
          )}

          <footer className="text-xs text-muted-foreground">{t('stmt.footer')}</footer>
        </article>
      )}
    </>
  )
}
