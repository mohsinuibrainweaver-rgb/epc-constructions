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
import { usePayments, useVendors } from '@/db/hooks'
import type { Key } from '@/i18n/en'
import { formatDate, money } from '@/lib/format'
import { isPlanned, isSpent, sum } from '@/lib/stats'

export function Vendors() {
  const { t, project } = useApp()
  const vendors = useVendors(project?.id)
  const payments = usePayments(project?.id).filter((p) => !p.deletedAt)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)

  const rows = useMemo(
    () =>
      vendors
        .filter((v) => v.name.toLowerCase().includes(q.trim().toLowerCase()))
        .map((v) => ({ v, paid: sum(payments.filter((p) => p.vendorId === v.id && isSpent(p))) })),
    [vendors, payments, q],
  )

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
        <div className="relative max-w-md">
          <Search aria-hidden="true" className="pointer-events-none absolute inset-s-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted-foreground" />
          <label className="sr-only" htmlFor="vq">
            {t('vendors.search')}
          </label>
          <Input id="vq" type="search" className="ps-10" placeholder={t('vendors.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
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
            {rows.map(({ v, paid }) => (
              <li key={v.id}>
                <Link to={`/vendors/${v.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{v.name}</span>
                    <span className="text-sm text-muted-foreground">{t(`role.${v.role}` as Key)}</span>
                  </span>
                  <strong className="tabular">{money(paid)}</strong>
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
  const payments = usePayments(project?.id).filter((p) => !p.deletedAt && p.vendorId === id)
  const [editing, setEditing] = useState(false)
  if (!vendor) return null

  const paid = sum(payments.filter(isSpent))
  const planned = sum(payments.filter(isPlanned))

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
      </div>

      <div className="grid grid-cols-2 gap-3 md:max-w-xl md:gap-6">
        <Card className="gap-1 p-4">
          <p className="text-sm font-medium text-muted-foreground">{t('vendors.paid')}</p>
          <p className="tabular text-xl font-extrabold whitespace-nowrap sm:text-2xl">{money(paid)}</p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-sm font-medium text-muted-foreground">{t('vendors.planned')}</p>
          <p className="tabular text-xl font-extrabold whitespace-nowrap sm:text-2xl">{money(planned)}</p>
        </Card>
      </div>

      {vendor.notes && <Card className="p-4">{vendor.notes}</Card>}

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center justify-between gap-3 p-4">
          <h2 className="text-lg font-semibold">{t('vendors.payments')}</h2>
          <Button variant="secondary" asChild size="sm">
            <Link to="/add">
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
