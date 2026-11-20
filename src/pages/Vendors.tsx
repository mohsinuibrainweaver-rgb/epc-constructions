import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Copy, FileText, Pencil, Phone, Plus, ReceiptText, Search, SearchX, Share2, Users } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { BackLink, EmptyState, PageHeader } from '@/components/common'
import { PaymentsTable } from '@/components/PaymentsTable'
import { useToast } from '@/components/Toast'
import { VendorDialog } from '@/components/VendorDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { ContractBar, ContractPill } from '@/components/ContractParts'
import { useContracts, usePayments, useVendors } from '@/db/hooks'
import type { Key } from '@/i18n/en'
import { summarizeContract } from '@/lib/contracts'
import { formatDate, money } from '@/lib/format'
import { isSpent, sum } from '@/lib/stats'
import { sortVendors, vendorFigures, vendorMatches, VENDOR_SORTS, type VendorSort } from '@/lib/vendors'

export function Vendors() {
  const { t, lang, project } = useApp()
  const vendors = useVendors(project?.id)
  const payments = usePayments(project?.id).filter((p) => !p.deletedAt)
  const contracts = useContracts(project?.id)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<VendorSort>('name')
  const [adding, setAdding] = useState(false)

  const rows = useMemo(
    () =>
      sortVendors(
        vendors
          .filter((v) => vendorMatches(v, t(`role.${v.role}` as Key), q))
          .map((v) => ({ v, f: vendorFigures(v.id, payments, contracts) })),
        sort,
      ),
    [vendors, payments, contracts, q, sort, t],
  )
  const totalPaid = rows.reduce((n, r) => n + r.f.paid, 0)

  return (
    <>
      <PageHeader
        title={t('vendors.title')}
        actions={
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            {t('vendors.add')}
          </Button>
        }
      />

      {vendors.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 max-w-md flex-1 basis-60">
            <Search aria-hidden="true" className="pointer-events-none absolute inset-s-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted-foreground" />
            <label className="sr-only" htmlFor="vq">
              {t('vendors.search')}
            </label>
            <Input id="vq" type="search" className="ps-10" placeholder={t('vendors.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Dropdown aria-label={t('vendors.sort')} value={sort} onChange={(e) => setSort(e.target.value as VendorSort)} className="w-auto min-w-44">
            {VENDOR_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`vendors.sort.${s}` as Key)}
              </option>
            ))}
          </Dropdown>
        </div>
      )}
      {rows.length > 0 && (
        <p className="text-muted-foreground" role="status" aria-live="polite">
          {t(rows.length === 1 ? 'vendors.countOne' : 'vendors.count', { count: rows.length, total: money(totalPaid) })}
        </p>
      )}

      {vendors.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={t('vendors.empty')}
            body={t('vendors.emptyBody')}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title={t('vendors.noMatch')}
            body={t('vendors.noMatchBody')}
            action={
              <Button variant="outline" onClick={() => setQ('')}>
                {t('vendors.clearSearch')}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {rows.map(({ v, f }) => (
              <li key={v.id}>
                <Link to={`/vendors/${v.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold [overflow-wrap:anywhere]">{v.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {[t(`role.${v.role}` as Key), f.lastPaid && t('vendors.lastPaid', { date: formatDate(f.lastPaid, lang) })].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="grid shrink-0 justify-items-end gap-0.5">
                    <strong className="tabular">{money(f.paid)}</strong>
                    {f.owed > 0 && <span className="tabular text-sm text-muted-foreground">{t('vendors.owed', { amount: money(f.owed) })}</span>}
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <VendorDialog open={adding} onClose={() => setAdding(false)} />
    </>
  )
}

export function VendorDetail() {
  const { id } = useParams()
  const { t, lang, project } = useApp()
  const toast = useToast()
  const vendor = useVendors(project?.id).find((v) => v.id === id)
  const everyPayment = usePayments(project?.id)
  const allContracts = useContracts(project?.id)
  const payments = everyPayment.filter((p) => !p.deletedAt && p.vendorId === id)
  const [editing, setEditing] = useState(false)
  if (!vendor) return null

  const paid = sum(payments.filter(isSpent))
  const fig = vendorFigures(vendor.id, everyPayment, allContracts)
  const contracts = allContracts.filter((c) => !c.deletedAt && c.vendorId === vendor.id)

  const copyAccount = async () => {
    if (!vendor.bankAccount) return
    try {
      await navigator.clipboard.writeText(vendor.bankAccount)
      toast.show({ kind: 'success', message: t('vendors.copied') })
    } catch {
      toast.show({ kind: 'error', message: t('err.generic') })
    }
  }

  const share = async () => {
    const lines = [
      `${vendor.name} — ${project?.name ?? ''}`,
      ...payments
        .filter((p) => p.status !== 'planned')
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((p) => `${formatDate(p.date, lang)}  ${money(p.amount)}  ${p.purpose}`),
      `${t('common.total')}: ${money(paid)}`,
    ]
    const text = lines.join('\n')
    try {
      if (navigator.share) await navigator.share({ title: vendor.name, text })
      else {
        await navigator.clipboard.writeText(text)
        toast.show({ kind: 'success', message: t('vendors.copied') })
      }
    } catch {
      /* the share sheet was dismissed */
    }
  }

  return (
    <>
      <div className="grid gap-1">
        <BackLink to="/vendors" label={t('vendors.title')} />
        <PageHeader
          title={vendor.name}
          actions={
            <>
              {vendor.phone && (
                <Button asChild variant="outline">
                  <a href={`tel:${vendor.phone}`}>
                    <Phone aria-hidden="true" />
                    {t('common.call')}
                  </a>
                </Button>
              )}
              {vendor.bankAccount && (
                <Button variant="outline" onClick={() => void copyAccount()}>
                  <Copy aria-hidden="true" />
                  {t('vendors.copyAccount')}
                </Button>
              )}
              <Button asChild variant="outline">
                <Link to={`/statements?vendor=${vendor.id}`}>
                  <FileText aria-hidden="true" />
                  {t('stmt.open')}
                </Link>
              </Button>
              <Button variant="outline" onClick={() => void share()}>
                <Share2 aria-hidden="true" />
                {t('vendors.statement')}
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil aria-hidden="true" />
                {t('common.edit')}
              </Button>
            </>
          }
        />
        <Badge variant="secondary" className="w-fit">
          {t(`role.${vendor.role}` as Key)}
        </Badge>
        {(vendor.bankName || vendor.bankAccount) && (
          <p className="text-sm text-muted-foreground">
            <bdi>{[vendor.bankName, vendor.bankAccount].filter(Boolean).join(' · ')}</bdi>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:max-w-3xl md:grid-cols-4 md:gap-6">
        <Card className="gap-1 p-4">
          <p className="text-sm font-medium text-muted-foreground">{t('vendors.paid')}</p>
          <p className="tabular text-xl font-extrabold whitespace-nowrap xl:text-2xl">{money(paid)}</p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-sm font-medium text-muted-foreground">{t('vendors.planned')}</p>
          <p className="tabular text-xl font-extrabold whitespace-nowrap xl:text-2xl">{money(fig.planned)}</p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-sm font-medium text-muted-foreground">{t('vendors.lastPaidStat')}</p>
          <p className="text-xl font-extrabold xl:text-2xl">{fig.lastPaid ? formatDate(fig.lastPaid, lang) : '—'}</p>
        </Card>
        {contracts.some((c) => c.status === 'active') && (
          <Card className="gap-1 p-4">
            <p className="text-sm font-medium text-muted-foreground">{t('vendors.owedStat')}</p>
            <p className="tabular text-xl font-extrabold whitespace-nowrap xl:text-2xl">{money(fig.owed)}</p>
          </Card>
        )}
      </div>

      {vendor.notes && <Card className="p-4">{vendor.notes}</Card>}

      {contracts.length > 0 && (
        <Card className="gap-3 p-4">
          <h2 className="text-lg font-semibold">{t('vendors.contracts')}</h2>
          <ul className="grid gap-4">
            {contracts.map((c) => {
              const s = summarizeContract(c, everyPayment)
              return (
                <li key={c.id}>
                  <Link to={`/contracts/${c.id}`} className="grid gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-semibold">{c.title}</span>
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
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center justify-between gap-3 p-4">
          <h2 className="text-lg font-semibold">{t('vendors.payments')}</h2>
          <Button variant="secondary" asChild size="sm">
            <Link to={`/add?vendor=${vendor.id}`}>
              <Plus aria-hidden="true" />
              {t('pay.add')}
            </Link>
          </Button>
        </div>
        {payments.length === 0 ? <EmptyState compact icon={ReceiptText} title={t('home.recentEmpty')} /> : <PaymentsTable payments={payments} />}
      </Card>

      <VendorDialog open={editing} vendor={vendor} onClose={() => setEditing(false)} />
    </>
  )
}
