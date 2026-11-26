import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Dialog, EmptyState } from '@/components/common'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Banknote, Bell, BellOff, CalendarClock, ChartColumn, Check, ChevronDown, ChevronRight, Ellipsis, FileSignature, FileText, FolderOpen, GitCompareArrows, House, KeyRound, Layers3, Loader2, LogOut, Plus, ReceiptText, RefreshCw, Scale, Search, Settings as SettingsIcon, ShieldCheck, TriangleAlert, Users, WifiOff } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { BrandLogo, BrandMark } from '@/components/Brand'
import { useApp } from '@/app/AppContext'
import { ConflictsDialog } from '@/components/ConflictsDialog'
import { SyncChip } from '@/components/SyncChip'
import { useToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConflictCount, useContracts, usePayments, usePhases } from '@/db/hooks'
import { setSetting } from '@/db/actions'
import type { Key } from '@/i18n/en'
import { addPaymentPath } from '@/lib/addLink'
import { initials, todayISO } from '@/lib/format'
import { contractAlerts } from '@/lib/contracts'
import type { Action } from '@/lib/permissions'
import { buildAlerts } from '@/lib/stats'
import { cn } from '@/lib/utils'
import { syncPushLanguage } from '@/push/push'
import { onRefused } from '@/sync/engine'
import { useSync } from '@/sync/SyncProvider'

const PasswordDialog = lazy(() => import('@/components/AccountDialogs').then((m) => ({ default: m.PasswordDialog })))

const NAV: { to: string; key: Key; icon: typeof House; end?: boolean; ownerOnly?: boolean; permission?: Action }[] = [
  { to: '/', key: 'nav.home', icon: House, end: true },
  { to: '/phases', key: 'nav.phases', icon: Layers3, permission: 'viewPhases' },
  { to: '/vendors', key: 'nav.vendors', icon: Users, permission: 'viewVendors' },
  { to: '/contracts', key: 'nav.contracts', icon: FileSignature, permission: 'viewContracts' },
  { to: '/ledger', key: 'nav.ledger', icon: ReceiptText, permission: 'viewLedger' },
  { to: '/plans', key: 'nav.plans', icon: CalendarClock, permission: 'viewPlans' },
  { to: '/forecast', key: 'nav.forecast', icon: Banknote, permission: 'viewForecast' },
  { to: '/settlement', key: 'nav.settlement', icon: Scale, permission: 'viewSettlement' },
  { to: '/reports', key: 'nav.reports', icon: ChartColumn, permission: 'viewReports' },
  { to: '/compare', key: 'nav.compare', icon: GitCompareArrows, permission: 'viewCompare' },
  { to: '/statements', key: 'nav.statements', icon: FileText, permission: 'viewStatements' },
  { to: '/files', key: 'nav.files', icon: FolderOpen, permission: 'viewFiles' },
  { to: '/roles', key: 'nav.roles', icon: ShieldCheck, ownerOnly: true },
  { to: '/settings', key: 'nav.settings', icon: SettingsIcon },
]

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

function AlertsBell({ conflicts, onReviewConflicts }: { conflicts: number; onReviewConflicts: () => void }) {
  const { t, project, phaseName, can, isOwner } = useApp()
  const phases = usePhases(project?.id)
  const payments = usePayments(project?.id)
  const contracts = useContracts(project?.id)
  const [open, setOpen] = useState(false)

  const alerts = useMemo(
    () => isOwner() ? [...buildAlerts(project, phases, payments, phaseName, todayISO(), can('approvePayments') ? 'investor' : 'builder'), ...contractAlerts(contracts, payments)] : [],
    [project, phases, payments, phaseName, can, contracts, isOwner],
  )
  const total = alerts.length + (conflicts > 0 ? 1 : 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${t('notif.title')}${total ? `: ${total}` : ''}`}>
          <Bell className="size-5" aria-hidden="true" />
          {total > 0 && (
            <span
              aria-hidden="true"
              className="absolute inset-e-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[0.65rem] leading-4 font-extrabold text-destructive-foreground"
            >
              {total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <h2 className="border-b p-4 text-base font-semibold">{t('notif.title')}</h2>
        {total === 0 ? (
          <EmptyState compact icon={BellOff} title={t('notif.none')} body={t('notif.noneBody')} />
        ) : (
          <ul className="max-h-[60dvh] divide-y overflow-y-auto">
            {conflicts > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onReviewConflicts()
                  }}
                  className="flex min-h-11 w-full items-center gap-3 p-4 text-start transition-colors hover:bg-accent"
                >
                  <Badge variant="warning" className="size-7 justify-center rounded-full p-0 [&>svg]:size-3.5">
                    <TriangleAlert aria-hidden="true" />
                  </Badge>
                  <span className="flex-1 text-sm font-medium">{t('conflict.bell', { count: conflicts })}</span>
                  <span className="text-sm font-semibold text-primary">{t('conflict.review')}</span>
                </button>
              </li>
            )}
            {alerts.map((a) => (
              <li key={a.id}>
                <Link
                  to={a.to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center gap-3 p-4 transition-colors hover:bg-accent"
                >
                  <Badge variant={a.kind === 'error' ? 'danger' : 'warning'} className="size-7 justify-center rounded-full p-0 [&>svg]:size-3.5">
                    <TriangleAlert aria-hidden="true" />
                  </Badge>
                  <span className="flex-1 text-sm font-medium">{t(a.key, a.vars)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Account actions stay one tap away on every regular screen, on phones and in the desktop sidebar. */
function AccountMenu({ phone = false }: { phone?: boolean }) {
  const { t, settings, isOwner } = useApp()
  const sync = useSync()
  const [open, setOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const who = settings.userName || t(settings.role === 'investor' ? 'set.roleInvestor' : 'set.roleBuilder')

  const signOut = async () => {
    if (busy) return
    setBusy(true)
    try {
      await sync.signOut()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {phone ? (
          <Button variant="ghost" size="icon" aria-label={t('set.sec.account')} className="shrink-0">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-full mesh-violet text-xs font-extrabold text-white">
              {initials(who)}
            </span>
          </Button>
        ) : (
          <button
            type="button"
            className="mt-auto flex min-h-10 w-full cursor-pointer items-center justify-center gap-2.5 nav-glass rounded-control px-1 text-start text-sm lg:justify-start"
          >
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full mesh-violet text-xs font-extrabold text-white">
              {initials(who)}
            </span>
            <span className="hidden min-w-0 lg:grid">
              <span className="truncate font-semibold">{who}</span>
              {isOwner() && <span className="text-[0.6875rem] leading-tight text-sidebar-foreground/70">{t('people.owner')}</span>}
            </span>
            <span className="sr-only lg:hidden">{t('set.sec.account')}</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        side={phone ? 'bottom' : 'top'}
        align={phone ? 'end' : 'start'}
        className={cn('p-1', phone ? 'w-[min(13.5rem,calc(100vw-2rem))]' : 'w-[min(12.5rem,calc(100vw-2rem))]')}
      >
        <div className={cn('border-b', phone ? 'px-2.5 py-2' : 'px-2.5 py-1.5')}>
          <p className="truncate text-sm font-semibold">{who}</p>
          {sync.session?.user.email && <p className="truncate text-[0.6875rem] text-muted-foreground">{sync.session.user.email}</p>}
        </div>
        <Link
          to="/settings/account"
          onClick={() => setOpen(false)}
          className={cn('mt-1 flex items-center rounded-control text-sm font-medium transition-colors hover:bg-accent', phone ? 'min-h-10 gap-2.5 px-2.5' : 'min-h-9 gap-2 px-2.5')}
        >
          <SettingsIcon className="size-4" aria-hidden="true" />
          {t('nav.settings')}
        </Link>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setPasswordOpen(true)
          }}
          className={cn('flex w-full cursor-pointer items-center rounded-control text-start text-sm font-medium transition-colors hover:bg-accent', phone ? 'min-h-10 gap-2.5 px-2.5' : 'min-h-9 gap-2 px-2.5')}
        >
          <KeyRound className="size-4" aria-hidden="true" />
          {t('set.pw.title')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void signOut()}
          className={cn('flex w-full cursor-pointer items-center rounded-control text-start text-sm font-semibold text-danger transition-colors hover:bg-danger-soft disabled:cursor-wait disabled:opacity-60', phone ? 'min-h-10 gap-2.5 px-2.5' : 'min-h-9 gap-2 px-2.5')}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4 rtl:-scale-x-100" aria-hidden="true" />}
          {t('sync.signOut')}
        </button>
      </PopoverContent>
    </Popover>
    {passwordOpen && sync.session?.user.email && (
      <Suspense fallback={null}>
        <PasswordDialog open email={sync.session.user.email} onClose={() => setPasswordOpen(false)} />
      </Suspense>
    )}
    </>
  )
}

export function Shell() {
  const { t, project, projects, settings, isOwner, can } = useApp()
  const loc = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnline()
  const sync = useSync()
  const [q, setQ] = useState('')
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  // The server did not accept some changes (only the investor may make them): they were taken off this phone, so say so.
  useEffect(() => onRefused(() => toast.show({ kind: 'warning', message: t('sync.refused') })), [toast, t])

  // Edits that a newer edit from another phone replaced: a message when one appears, and a place to review them.
  const conflictCount = useConflictCount()
  const [conflictsOpen, setConflictsOpen] = useState(false)
  const seenConflicts = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (conflictCount === undefined) return
    if (seenConflicts.current !== undefined && conflictCount > seenConflicts.current) {
      toast.show({ kind: 'warning', message: t('conflict.toast'), actionLabel: t('conflict.review'), onAction: () => setConflictsOpen(true) })
    }
    seenConflicts.current = conflictCount
  }, [conflictCount, toast, t])

  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (offlineReady) {
      toast.show({ kind: 'info', message: t('pwa.offlineReady') })
      setOfflineReady(false)
    }
  }, [offlineReady, setOfflineReady, toast, t])

  const wasOffline = useRef(false)
  useEffect(() => {
    if (!online) wasOffline.current = true
    else if (wasOffline.current) {
      wasOffline.current = false
      toast.show({ kind: 'info', message: t('pwa.online') })
    }
  }, [online, toast, t])

  // A device that gets reminders keeps the language chosen in the app.
  const pushLang = settings.language
  const signedIn = Boolean(sync.session)
  useEffect(() => {
    if (signedIn) void syncPushLanguage(pushLang)
  }, [pushLang, signedIn])

  // New page: scroll to the top and move keyboard focus to the content (WCAG 2.4.3).
  const mainRef = useRef<HTMLElement>(null)
  const first = useRef(true)
  useEffect(() => {
    window.scrollTo(0, 0)
    if (first.current) first.current = false
    else mainRef.current?.focus({ preventScroll: true })
  }, [loc.pathname])

  // The tab title says which page this is ("Ledger · EndPoint Construction"), so a screen-reader user, the browser history
  // and the task switcher can tell pages apart (WCAG 2.4.2). It follows the page's own heading, even when that heading
  // appears a moment later (the project name on Home, once the data has loaded).
  useEffect(() => {
    const app = t('app.name')
    const update = () => {
      const h = document.querySelector('#main h1')?.textContent?.trim()
      document.title = h ? `${h} · ${app}` : app
    }
    update()
    const main = document.getElementById('main')
    if (!main) return
    const watch = new MutationObserver(update)
    watch.observe(main, { childList: true, subtree: true, characterData: true })
    return () => {
      watch.disconnect()
      document.title = app
    }
  }, [loc.pathname, t])

  if (!project) return <Navigate to="/welcome" replace />

  // Forms open full screen on phones (no tab bar, no header).
  const fullscreen = /^\/(add|payments\/)/.test(loc.pathname)
  const submitSearch = (e: FormEvent) => {
    e.preventDefault()
    navigate(`/ledger?q=${encodeURIComponent(q.trim())}`)
  }

  // The sync state shows under the app name in the sidebar (sm and up) and in the top bar on phones, which have no sidebar.
  const statusChip = (side: boolean) =>
    sync.configured && sync.session ? (
      <SyncChip tone={side ? 'sidebar' : 'default'} compact={side} />
    ) : (
      !online && (
        <Badge
          variant="warning"
          title={side ? t('pwa.offline') : undefined}
          className={side ? 'min-h-6 size-7 justify-center border-sidebar-foreground/25 bg-sidebar-accent p-0 text-[0.6875rem] text-sidebar-warning lg:size-auto lg:px-2 lg:py-0 lg:leading-none' : undefined}
        >
          <WifiOff aria-hidden="true" className={side ? 'max-lg:size-3.5' : undefined} />
          <span className={side ? 'sr-only lg:not-sr-only' : undefined}>{t('pwa.offline')}</span>
        </Badge>
      )
    )

  const sideChip = statusChip(true)
  const mobileStatusChip = sync.configured && sync.session
    ? (sync.status.state === 'offline' || sync.status.state === 'error' || (sync.status.state !== 'syncing' && sync.status.pending > 0) ? statusChip(false) : null)
    : statusChip(false)
  const mobileTabs = [
    { to: '/', key: 'nav.home' as Key, icon: House, end: true },
    ...(can('viewPhases') ? [{ to: '/phases', key: 'nav.phases' as Key, icon: Layers3, end: false }] : []),
    ...(can('viewVendors') ? [{ to: '/vendors', key: 'nav.vendors' as Key, icon: Users, end: false }] : []),
  ]
  const moreItems: { to: string; key: Key; icon: typeof ReceiptText; ownerOnly?: boolean; permission?: Action }[] = [
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
  const accessibleMoreItems = moreItems.filter(({ ownerOnly, permission }) => (!ownerOnly || isOwner()) && (!permission || can(permission)))
  const allMobileTabs = [
    ...mobileTabs,
    ...accessibleMoreItems.map(({ to, key, icon }) => ({ to, key, icon, end: false })),
  ]
  const canAddPayment = can('addPayments')
  // Keep the first three destinations visible. When there are more, the original five-slot
  // balance stays intact: two tabs, centred +, one tab, then More.
  const useMore = allMobileTabs.length > 3
  const directLimit = useMore ? 3 : allMobileTabs.length
  const visibleMobileTabs = allMobileTabs.slice(0, directLimit)
  const sheetItems = useMore ? allMobileTabs.slice(directLimit) : []
  const mobileTabSplit = Math.ceil(visibleMobileTabs.length / 2)
  const mobileTabCount = visibleMobileTabs.length + (canAddPayment ? 1 : 0) + (useMore ? 1 : 0)
  return (
    <div className="grid min-h-[calc(100dvh-2*var(--page-gap))] grid-cols-1 gap-[var(--page-gap)] sm:grid-cols-[4.5rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)] print:block">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:inset-s-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground"
      >
        {t('a11y.skip')}
      </a>

      <aside
        aria-label={t('app.full')}
        className="sticky top-[var(--page-gap)] hidden h-[calc(100dvh-2*var(--page-gap))] flex-col gap-3 overflow-y-auto rounded-2xl border border-sidebar-border sidebar-mesh p-4 text-sidebar-foreground [--ring:var(--sidebar-ring)] sm:flex print:hidden"
      >
        <div className="flex flex-col items-center gap-2 lg:flex-row lg:gap-2 lg:[&>[data-slot=badge]]:ms-auto">
          <Link to="/" aria-label={t('app.name')} className="flex min-h-9 items-center justify-center gap-2.5 rounded-control px-1 lg:shrink-0 lg:justify-start">
            <BrandMark onDark className="h-7 w-auto shrink-0 lg:hidden" />
            <BrandLogo onDark alt="" className="hidden h-8 w-auto shrink-0 lg:block" />
          </Link>
          {sideChip}
        </div>

        <div className="hidden lg:block">
          <label className="sr-only" htmlFor="project-select">
            {t('nav.projects')}
          </label>
          <Dropdown
            id="project-select"
            tone="sidebar"
            value={project.id}
            onChange={(e) => {
              if (e.target.value === '__all') navigate('/projects')
              else void setSetting('currentProjectId', e.target.value)
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="__all">{t('nav.projects')}…</option>
          </Dropdown>
        </div>

        <nav aria-label={t('app.name')} className="grid gap-0.5">
          {NAV.filter(({ ownerOnly, permission }) => (!ownerOnly || isOwner()) && (!permission || can(permission))).map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={t(key)}
              aria-label={t(key)}
              className={({ isActive }) =>
                cn(
                  'flex min-h-9 items-center justify-center gap-2.5 nav-glass rounded-control px-3 text-sm font-semibold lg:justify-start',
                  isActive && 'text-white',
                )
              }
            >
              <Icon className="size-[1.125rem] shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline">{t(key)}</span>
            </NavLink>
          ))}
        </nav>

        <AccountMenu />
      </aside>

      <div className="flex min-h-[calc(100dvh-2*var(--page-gap))] min-w-0 flex-col overflow-clip bg-card sm:rounded-2xl sm:border sm:shadow-sm print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none">
        <header className={cn('sticky top-0 z-20 border-b bg-card pt-[env(safe-area-inset-top)] sm:hidden print:hidden', fullscreen && 'hidden')}>
          <div className="container-page flex min-h-14 items-center gap-3">
            <BrandMark width={18} />
            {projects.length > 1 ? (
              <Popover open={projectSwitcherOpen} onOpenChange={setProjectSwitcherOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-control px-1 text-start font-extrabold transition-colors hover:bg-accent"
                    aria-label={`${t('nav.projects')}: ${project.name}`}
                  >
                    <span className="truncate">{project.name}</span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-1">
                  <p className="px-3 py-2 text-xs font-semibold text-muted-foreground">{t('nav.projects')}</p>
                  <div className="grid gap-0.5">
                    {projects.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setProjectSwitcherOpen(false)
                          if (item.id !== project.id) void setSetting('currentProjectId', item.id)
                        }}
                        className={cn(
                          'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-control px-3 text-start text-sm transition-colors hover:bg-accent',
                          item.id === project.id && 'bg-accent font-semibold',
                        )}
                        aria-current={item.id === project.id ? 'true' : undefined}
                      >
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        {item.id === project.id && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                  <Link
                    to="/projects/new"
                    onClick={() => setProjectSwitcherOpen(false)}
                    className="mt-1 flex min-h-11 items-center gap-3 border-t px-3 pt-1 text-sm font-semibold text-primary"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {t('projects.new')}
                  </Link>
                </PopoverContent>
              </Popover>
            ) : (
              <div className="flex min-h-11 min-w-0 flex-1 items-center px-1 font-extrabold">
                <span className="truncate">{project.name}</span>
              </div>
            )}
            {mobileStatusChip}
            <AlertsBell conflicts={conflictCount ?? 0} onReviewConflicts={() => setConflictsOpen(true)} />
            <AccountMenu phone />
          </div>
        </header>

        <header className="sticky top-0 z-20 hidden border-b bg-card/95 backdrop-blur sm:block print:hidden">
          <div className="container-page flex min-h-16 items-center gap-3">
            {can('viewLedger') ? <form onSubmit={submitSearch} role="search" aria-label={t('ledger.search')} className="relative max-w-md flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute inset-s-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted-foreground" />
              <label className="sr-only" htmlFor="top-search">
                {t('common.search')}
              </label>
              <Input
                id="top-search"
                type="search"
                value={q}
                placeholder={t('ledger.search')}
                onChange={(e) => setQ(e.target.value)}
                className="ps-10"
              />
            </form> : <span className="flex-1" />}
            <span className="flex-1" />
            <AlertsBell conflicts={conflictCount ?? 0} onReviewConflicts={() => setConflictsOpen(true)} />
            {!fullscreen && can('addPayments') && (
              <Button asChild>
                <Link to={addPaymentPath(loc.pathname)}>
                  <Plus aria-hidden="true" />
                  {t('pay.add')}
                </Link>
              </Button>
            )}
          </div>
        </header>

        <main
          ref={mainRef}
          id="main"
          tabIndex={-1}
          className={cn('container-page grid flex-1 content-start gap-4 py-4 outline-none sm:gap-6 sm:py-5 sm:pb-8', fullscreen ? 'max-sm:pt-3 max-sm:pb-0' : 'pb-[calc(5.75rem+env(safe-area-inset-bottom))]')}
        >
          {needRefresh && (
            <div role="status" className="flex items-start gap-3 rounded-xl bg-info-soft p-4 text-sm font-semibold text-info">
              <RefreshCw aria-hidden="true" className="mt-0.5 size-4" />
              <div className="grid gap-2">
                {t('pwa.update')}
                <Button variant="secondary" size="sm" onClick={() => void updateServiceWorker(true)} className="w-fit">
                  {t('pwa.reload')}
                </Button>
              </div>
            </div>
          )}
          <div key={loc.pathname} className="page-in grid min-w-0 content-start gap-4 sm:gap-6">
            <Outlet />
          </div>
        </main>
      </div>

      <nav
        data-mobile-nav
        aria-label={t('app.name')}
        className={cn('fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden print:hidden', fullscreen && 'hidden')}
      >
        <div className="mx-auto grid h-[4.25rem] max-w-lg items-center" style={{ gridTemplateColumns: `repeat(${mobileTabCount}, minmax(0, 1fr))` }}>
          {visibleMobileTabs.slice(0, mobileTabSplit).map(({ to, key, icon: Icon, end }) => (
            <TabLink key={to} to={to} end={end} label={t(key)} icon={<Icon className="size-[1.375rem]" aria-hidden="true" />} />
          ))}
          {canAddPayment && (
            <Link
              to={addPaymentPath(loc.pathname)}
              aria-label={t('pay.add')}
              className="fab-orbit -mt-5 grid size-14 place-items-center justify-self-center rounded-full border-4 border-background transition-transform duration-150 active:scale-95"
            >
              <Plus className="size-7" aria-hidden="true" />
            </Link>
          )}
          {visibleMobileTabs.slice(mobileTabSplit).map(({ to, key, icon: Icon, end }) => (
            <TabLink key={to} to={to} end={end} label={t(key)} icon={<Icon className="size-[1.375rem]" aria-hidden="true" />} />
          ))}
          {useMore && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(
                'grid min-h-11 cursor-pointer content-center justify-items-center gap-0.5 text-xs font-semibold transition-colors',
                moreOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Ellipsis className="size-[1.375rem]" aria-hidden="true" />
              {t('nav.more')}
            </button>
          )}
        </div>
      </nav>
      <Dialog open={moreOpen} title={t('more.title')} onClose={() => setMoreOpen(false)} contentClassName="sm:hidden">
        <ul className="-m-4 divide-y">
          {sheetItems.map(({ to, key, icon: Icon }) => {
              const selected = loc.pathname === to || loc.pathname.startsWith(`${to}/`)
              return (
                <li key={to}>
                  <Link
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    aria-current={selected ? 'page' : undefined}
                    className={cn(
                      'flex min-h-14 items-center gap-3 border-s-2 border-transparent px-4 transition-colors hover:bg-accent active:bg-accent',
                      selected && 'border-primary bg-primary/10 text-primary',
                    )}
                  >
                    <Icon className={cn('size-5 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                    <span className="min-w-0 flex-1 font-semibold">{t(key)}</span>
                    {selected ? (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
                    )}
                  </Link>
                </li>
              )
            })}
        </ul>
      </Dialog>
      <ConflictsDialog open={conflictsOpen} onClose={() => setConflictsOpen(false)} />
    </div>
  )
}

function TabLink({ to, end, label, icon }: { to: string; end?: boolean; label: string; icon: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'grid min-h-11 content-center justify-items-center gap-0.5 text-xs font-semibold transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
