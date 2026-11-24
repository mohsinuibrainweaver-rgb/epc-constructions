import { Link } from 'react-router-dom'
import { Banknote, CalendarClock, ChartColumn, ChevronRight, Clock, Compass, FileSignature, FileText, FolderOpen, GitCompareArrows, ReceiptText, Scale, Settings as SettingsIcon, ShieldCheck } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { EmptyState, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Key } from '@/i18n/en'
import type { Action } from '@/lib/permissions'

/** The "More" tab on phones. */
export function More() {
  const { t, isOwner, can } = useApp()
  const items: { to: string; key: Key; icon: typeof ReceiptText; ownerOnly?: boolean; permission?: Action }[] = [
    { to: '/contracts', key: 'nav.contracts', icon: FileSignature, permission: 'viewContracts' },
    { to: '/ledger', key: 'nav.ledger', icon: ReceiptText, permission: 'viewLedger' },
    { to: '/plans', key: 'nav.plans', icon: CalendarClock, permission: 'viewPlans' },
    { to: '/forecast', key: 'nav.forecast', icon: Banknote, permission: 'viewForecast' },
    { to: '/settlement', key: 'nav.settlement', icon: Scale, permission: 'viewSettlement' },
    { to: '/reports', key: 'nav.reports', icon: ChartColumn, permission: 'viewReports' },
    { to: '/compare', key: 'nav.compare', icon: GitCompareArrows, permission: 'viewCompare' },
    { to: '/statements', key: 'nav.statements', icon: FileText, permission: 'viewStatements' },
    { to: '/files', key: 'nav.files', icon: FolderOpen, permission: 'viewFiles' },
    { to: '/projects', key: 'nav.projects', icon: FolderOpen },
    { to: '/roles', key: 'nav.roles', icon: ShieldCheck, ownerOnly: true },
    { to: '/settings', key: 'nav.settings', icon: SettingsIcon },
  ]
  return (
    <>
      <PageHeader title={t('more.title')} />
      <Card className="gap-0 overflow-hidden py-0">
        <ul className="divide-y">
          {items.filter(({ ownerOnly, permission }) => (!ownerOnly || isOwner()) && (!permission || can(permission))).map(({ to, key, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="flex min-h-14 items-center gap-3 px-4 transition-colors hover:bg-accent">
                <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 font-semibold">{t(key)}</span>
                <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

/** Honest placeholder for the screens that come with the next stage. */
export function Soon({ titleKey, bodyKey }: { titleKey: Key; bodyKey: Key }) {
  const { t } = useApp()
  return (
    <>
      <PageHeader title={t(titleKey)} />
      <Card>
        <EmptyState icon={Clock} title={t('soon.title')} body={t(bodyKey)} />
      </Card>
    </>
  )
}

export function NotFound() {
  const { t } = useApp()
  return (
    <Card>
      <EmptyState
        icon={Compass}
        asH1
        title={t('err.notFound')}
        action={
          <Button variant="secondary" asChild>
            <Link to="/">{t('nav.home')}</Link>
          </Button>
        }
      />
    </Card>
  )
}
