import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { EmptyState } from '@/components/common'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, BellOff, CalendarClock, ChartColumn, Ellipsis, FileSignature, FileText, FolderOpen, House, Layers3, Package, Plus, ReceiptText, RefreshCw, Scale, Search, Settings as SettingsIcon, TriangleAlert, Users, WifiOff } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { BrandMark } from '@/components/Brand'
import { useApp } from '@/app/AppContext'
import { SyncChip } from '@/components/SyncChip'
import { useToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useContracts, usePayments, usePhases } from '@/db/hooks'
import { setSetting } from '@/db/actions'
import type { Key } from '@/i18n/en'
import { initials, todayISO } from '@/lib/format'
import { contractAlerts } from '@/lib/contracts'
import { buildAlerts } from '@/lib/stats'
import { cn } from '@/lib/utils'
import { syncPushLanguage } from '@/push/push'
import { useSync } from '@/sync/SyncProvider'

const NAV: { to: string; key: Key; icon: typeof House; end?: boolean }[] = [
  { to: '/', key: 'nav.home', icon: House, end: true },
  { to: '/phases', key: 'nav.phases', icon: Layers3 },
  { to: '/vendors', key: 'nav.vendors', icon: Users },
  { to: '/contracts', key: 'nav.contracts', icon: FileSignature },
  { to: '/ledger', key: 'nav.ledger', icon: ReceiptText },
  { to: '/plans', key: 'nav.plans', icon: CalendarClock },
  { to: '/settlement', key: 'nav.settlement', icon: Scale },
  { to: '/materials', key: 'nav.materials', icon: Package },
  { to: '/reports', key: 'nav.reports', icon: ChartColumn },
  { to: '/statements', key: 'nav.statements', icon: FileText },
  { to: '/files', key: 'nav.files', icon: FolderOpen },
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

function AlertsBell() {
  const { t, project, phaseName, settings } = useApp()
  const phases = usePhases(project?.id)
  const payments = usePayments(project?.id)
  const contracts = useContracts(project?.id)
  const [open, setOpen] = useState(false)

  const alerts = useMemo(
    () => [...buildAlerts(project, phases, payments, phaseName, todayISO(), settings.role), ...contractAlerts(contracts, payments)],
    [project, phases, payments, phaseName, settings.role, contracts],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${t('notif.title')}${alerts.length ? `: ${alerts.length}` : ''}`}>
          <Bell className="size-5" aria-hidden="true" />
          {alerts.length > 0 && (
            <span
              aria-hidden="true"
              className="absolute inset-e-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[0.65rem] leading-4 font-extrabold text-destructive-foreground"
            >
              {alerts.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <h2 className="border-b p-4 text-base font-semibold">{t('notif.title')}</h2>
        {alerts.length === 0 ? (
          <EmptyState compact icon={BellOff} title={t('notif.none')} body={t('notif.noneBody')} />
        ) : (
          <ul className="max-h-[60dvh] divide-y overflow-y-auto">
            {alerts.map((a) => (
              <li key={a.id}>
                <Link
                  to={a.to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center gap-3 p-4 transition-colors hover:bg-accent"
                >
                  <Badge variant={a.kind === 'error' ? 'danger' : 'warning'}>
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

export function Shell() {
  const { t, project, projects, settings } = useApp()
  const loc = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnline()
  const sync = useSync()
  const [q, setQ] = useState('')

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
    return () => watch.disconnect()
  }, [loc.pathname, t])

  if (!project) return <Navigate to="/welcome" replace />

  // Forms open full screen on phones (no tab bar, no header).
  const fullscreen = /^\/(add|payments\/)/.test(loc.pathname)
  const who = settings.userName || t(settings.role === 'investor' ? 'set.roleInvestor' : 'set.roleBuilder')

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
        className="sticky top-[var(--page-gap)] hidden h-[calc(100dvh-2*var(--page-gap))] flex-col gap-3 overflow-y-auto rounded-2xl border border-sidebar-border bg-sidebar p-2.5 text-sidebar-foreground [--ring:var(--sidebar-ring)] sm:flex print:hidden"
      >
        <div className="flex flex-col items-center gap-2 lg:flex-row lg:gap-2 lg:[&>[data-slot=badge]]:ms-auto">
          <Link to="/" aria-label={t('app.name')} className="flex min-h-9 items-center justify-center gap-2.5 rounded-control px-1 lg:shrink-0 lg:justify-start">
            <BrandMark onDark className="h-7 w-auto shrink-0" />
            <span aria-hidden="true" className="hidden text-sm leading-tight font-semibold lg:block">
              {t('app.name.1')}
              <br />
              {t('app.name.2')}
            </span>
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
          {NAV.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={t(key)}
              aria-label={t(key)}
              className={({ isActive }) =>
                cn(
                  'flex min-h-9 items-center justify-center gap-2.5 rounded-control px-3 text-sm font-semibold transition-colors duration-150 hover:bg-sidebar-accent/70 lg:justify-start',
                  isActive && 'bg-sidebar-active text-sidebar-active-foreground hover:bg-sidebar-active',
                )
              }
            >
              <Icon className="size-[1.125rem] shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline">{t(key)}</span>
            </NavLink>
          ))}
        </nav>

        <Link
          to="/settings"
          className="mt-auto flex min-h-10 items-center justify-center gap-2.5 rounded-control px-1 text-sm transition-colors hover:bg-sidebar-accent/70 lg:justify-start"
        >
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-primary text-xs font-extrabold text-sidebar-primary-foreground">
            {initials(who)}
          </span>
          <span className="hidden truncate font-semibold lg:inline">{who}</span>
          <span className="sr-only lg:hidden">{who}</span>
        </Link>
      </aside>

      <div className="flex min-h-[calc(100dvh-2*var(--page-gap))] min-w-0 flex-col overflow-clip rounded-2xl border bg-card shadow-sm print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none">
        <header className={cn('sticky top-0 z-20 border-b bg-card pt-[env(safe-area-inset-top)] sm:hidden print:hidden', fullscreen && 'hidden')}>
          <div className="container-page flex min-h-14 items-center gap-3">
            <BrandMark width={18} />
            <Link to="/projects" className="flex min-h-11 min-w-0 flex-1 items-center font-extrabold"><span className="truncate">{project.name}</span>
            </Link>
            {statusChip(false)}
            <AlertsBell />
          </div>
        </header>

        <header className="sticky top-0 z-20 hidden border-b bg-card/95 backdrop-blur sm:block print:hidden">
          <div className="container-page flex min-h-16 items-center gap-3">
            <form onSubmit={submitSearch} role="search" aria-label={t('ledger.search')} className="relative max-w-md flex-1">
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
            </form>
            <span className="flex-1" />
            {!fullscreen && (
              <Button asChild>
                <Link to="/add">
                  <Plus aria-hidden="true" />
                  {t('pay.add')}
                </Link>
              </Button>
            )}
            <AlertsBell />
          </div>
        </header>

        <main
          ref={mainRef}
          id="main"
          tabIndex={-1}
          className={cn('container-page grid flex-1 content-start gap-6 py-5 outline-none sm:pb-8', fullscreen ? 'pb-28' : 'pb-28')}
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
          <Outlet />
        </main>
      </div>

      <nav
        aria-label={t('app.name')}
        className={cn('fixed inset-x-[var(--page-gap)] bottom-[max(var(--page-gap),env(safe-area-inset-bottom))] z-30 rounded-2xl border bg-background shadow-lg sm:hidden print:hidden', fullscreen && 'hidden')}
      >
        <div className="mx-auto grid h-[4.25rem] max-w-lg grid-cols-5 items-center">
          {(
            [
              ['/', 'nav.home', House, true],
              ['/phases', 'nav.phases', Layers3, false],
            ] as const
          ).map(([to, key, Icon, end]) => (
            <TabLink key={to} to={to} end={end} label={t(key)} icon={<Icon className="size-[1.375rem]" aria-hidden="true" />} />
          ))}
          <Link
            to="/add"
            aria-label={t('pay.add')}
            className="-mt-5 grid size-14 place-items-center justify-self-center rounded-control border-4 border-background bg-primary text-primary-foreground shadow-lg transition-transform duration-150 active:scale-95"
          >
            <Plus className="size-7" aria-hidden="true" />
          </Link>
          <TabLink to="/vendors" label={t('nav.vendors')} icon={<Users className="size-[1.375rem]" aria-hidden="true" />} />
          <TabLink to="/more" label={t('nav.more')} icon={<Ellipsis className="size-[1.375rem]" aria-hidden="true" />} />
        </div>
      </nav>
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
