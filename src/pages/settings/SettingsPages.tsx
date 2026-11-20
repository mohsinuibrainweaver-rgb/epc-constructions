import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, NavLink, Navigate, Outlet, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { BackLink, PageHeader } from '@/components/common'
import { PasswordDialog, SignOutEverywhereDialog } from '@/components/AccountDialogs'
import { AppearanceCards } from '@/components/AppearanceCards'
import { DeleteProjectDialog } from '@/components/DeleteProjectDialog'
import { People } from '@/components/People'
import { PushSettings } from '@/components/PushCard'
import { RegionSettings } from '@/components/RegionSettings'
import { SettingRow, SettingsSection } from '@/components/settings'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { db } from '@/db/db'
import { exportBackup, importBackup, restorePayment, setSetting } from '@/db/actions'
import type { Lang, Role } from '@/db/types'
import type { Key } from '@/i18n/en'
import { download, formatDate, formatTime, money } from '@/lib/format'
import { useInstall } from '@/pwa/install'
import { supabase } from '@/sync/supabase'
import { useSync } from '@/sync/SyncProvider'
import { useTheme } from '@/theme'
import { SECTIONS, type SectionId } from './sections'

const APP_VERSION = '0.26.0'

/** True from 840 px up: the menu and the section sit side by side. Below that the menu is its own screen. */
function useWide(): boolean {
  const q = '(min-width: 52.5rem)'
  const [wide, setWide] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const m = matchMedia(q)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

/** The frame around every settings page: a menu on wide screens, nothing extra on a phone. */
export function SettingsLayout() {
  const { t } = useApp()
  return (
    <div className="grid items-start gap-6 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
      <nav aria-label={t('set.menu')} className="sticky top-20 hidden md:block">
        <ul className="grid gap-1">
          {SECTIONS.map(({ id, icon: Icon, title }) => (
            <li key={id}>
              <NavLink
                to={`/settings/${id}`}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 font-semibold transition-colors hover:bg-accent aria-[current=page]:bg-secondary aria-[current=page]:text-secondary-foreground"
              >
                <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
                {t(title)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid max-w-[45rem] min-w-0 content-start gap-6">
        <Outlet />
      </div>
    </div>
  )
}

/** /settings: on a wide screen it opens the first section; on a phone it is the list of sections. */
export function SettingsIndex() {
  const { t, lang, settings, project } = useApp()
  const wide = useWide()
  const theme = useTheme()
  const sync = useSync()
  if (wide) return <Navigate to="account" replace />

  const summary: Partial<Record<SectionId, string>> = {
    account: settings.userName || t(settings.role === 'investor' ? 'set.roleInvestor' : 'set.roleBuilder'),
    preferences: `${lang === 'ur' ? 'اردو' : 'English'} · ${t(`set.theme.${theme.pref}` as Key)}`,
    project: project?.name,
    data: !sync.configured ? t('sync.notConfigured') : t(sync.status.state === 'error' ? 'sync.state.error' : sync.status.state === 'offline' ? 'sync.state.offline' : 'sync.state.idle'),
    about: `${t('set.version')} ${APP_VERSION}`,
  }
  return (
    <>
      <PageHeader title={t('set.title')} />
      <Card className="gap-0 overflow-hidden py-0">
        <ul className="divide-y">
          {SECTIONS.map(({ id, icon: Icon, title }) => (
            <li key={id}>
              <Link to={id} className="flex min-h-16 items-center gap-3 px-4 py-2 transition-colors hover:bg-accent">
                <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                <span className="grid min-w-0 flex-1">
                  <span className="font-semibold">{t(title)}</span>
                  {summary[id] && <span className="truncate text-sm text-muted-foreground">{summary[id]}</span>}
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

/** One section's page: its title, its sentence, its groups of settings. */
export function SettingsSectionPage() {
  const { section } = useParams()
  const { t } = useApp()
  const meta = SECTIONS.find((s) => s.id === section)
  if (!meta) return <Navigate to="/settings" replace />
  const body: Record<SectionId, React.ReactNode> = {
    account: <AccountSection />,
    preferences: <PreferencesSection />,
    notifications: <PushSettings />,
    project: <ProjectSection />,
    data: <DataSection />,
    about: <AboutSection />,
  }
  return (
    <>
      <div className="md:hidden">
        <BackLink to="/settings" label={t('set.title')} />
      </div>
      <PageHeader title={t(meta.title)} />
      {body[meta.id]}
    </>
  )
}

/* ---------------------------------------------------------------- Account */

function AccountSection() {
  const { t, settings } = useApp()
  const sync = useSync()
  const [pw, setPw] = useState(false)
  const [everywhere, setEverywhere] = useState(false)
  const email = sync.session?.user.email ?? ''
  // The name and role are kept in the account too, so the next phone or sign-in has the same ones.
  const saveProfile = (patch: { name?: string; role?: Role }) => {
    if (sync.session) void supabase?.auth.updateUser({ data: patch })
  }
  return (
    <>
      <SettingsSection title={t('set.you')}>
        <SettingRow
          label={t('set.name')}
          help={t('set.nameHelp')}
          control={(a) => (
            <Input
              id={a.id}
              aria-describedby={a.describedBy}
              className="sm:w-64"
              value={settings.userName}
              autoComplete="name"
              onChange={(e) => void setSetting('userName', e.target.value)}
              onBlur={(e) => saveProfile({ name: e.target.value.trim() })}
            />
          )}
        />
        <SettingRow
          label={t('set.role')}
          help={t('set.roleHelp')}
          control={(a) => (
            <PillRadioGroup aria-labelledby={a.labelId} aria-describedby={a.describedBy} value={settings.role} onValueChange={(v) => {
                void setSetting('role', v as Role)
                saveProfile({ role: v as Role })
              }}>
              {(['investor', 'builder'] as Role[]).map((r) => (
                <PillRadioItem key={r} value={r}>
                  {t(r === 'investor' ? 'set.roleInvestor' : 'set.roleBuilder')}
                </PillRadioItem>
              ))}
            </PillRadioGroup>
          )}
        />
      </SettingsSection>

      <SettingsSection title={t('set.signIn')}>
        {sync.configured && sync.session ? (
          <>
            <SettingRow label={t('set.email')} control={<span className="break-all">{email}</span>} />
            <SettingRow
              label={t('set.password')}
              help={t('set.passwordHelp')}
              control={
                <Button variant="outline" onClick={() => setPw(true)}>
                  {t('set.pw.title')}
                </Button>
              }
            />
            <SettingRow
              label={t('sync.signOut')}
              help={t('set.signOutHelp')}
              control={
                <Button variant="outline" onClick={() => void sync.signOut()}>
                  {t('sync.signOut')}
                </Button>
              }
            />
            <SettingRow
              label={t('set.out.title')}
              help={t('set.out.help')}
              control={
                <Button variant="outline" onClick={() => setEverywhere(true)}>
                  {t('set.out.title')}
                </Button>
              }
            />
          </>
        ) : (
          <SettingRow label={t('sync.notConfigured')} help={t('sync.notConfiguredBody')} />
        )}
      </SettingsSection>

      {sync.session && (
        <>
          <PasswordDialog open={pw} email={email} onClose={() => setPw(false)} />
          <SignOutEverywhereDialog open={everywhere} userId={sync.session.user.id} onClose={() => setEverywhere(false)} />
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------ Preferences */

function PreferencesSection() {
  const { t, lang } = useApp()
  return (
    <>
      <SettingsSection title={t('set.langRegion')}>
        <SettingRow
          label={t('set.language')}
          help={t('set.langHelp')}
          control={(a) => (
            <PillRadioGroup aria-labelledby={a.labelId} aria-describedby={a.describedBy} value={lang} onValueChange={(v) => void setSetting('language', v as Lang)}>
              <PillRadioItem value="en">English</PillRadioItem>
              <PillRadioItem value="ur" lang="ur">
                اردو
              </PillRadioItem>
            </PillRadioGroup>
          )}
        />
      </SettingsSection>
      <RegionSettings />
      <SettingsSection title={t('set.appearance')}>
        <SettingRow label={t('set.themeLabel')} help={t('set.themeHint')} below={(a) => <AppearanceCards aria={a} />} />
      </SettingsSection>
    </>
  )
}

/* ---------------------------------------------------------------- Project */

function ProjectSection() {
  const { t, project } = useApp()
  const sync = useSync()
  const [deleting, setDeleting] = useState(false)
  if (!project) return <p className="text-muted-foreground">{t('set.noProject')}</p>
  return (
    <>
      <SettingsSection title={t('set.projectDetails')}>
        <SettingRow
          label={project.name}
          help={t('set.projectDetailsHelp')}
          control={
            <Button asChild variant="outline">
              <Link to={`/projects/${project.id}/edit`}>{t('pf.edit')}</Link>
            </Button>
          }
        />
        <SettingRow
          label={t('nav.projects')}
          help={t('set.allProjectsHelp')}
          control={
            <Button asChild variant="outline">
              <Link to="/projects">{t('set.allProjects')}</Link>
            </Button>
          }
        />
      </SettingsSection>

      {sync.configured && sync.session && <People />}

      <SettingsSection title={t('set.danger')} tone="danger">
        <SettingRow
          label={t('set.deleteProject')}
          help={t('set.deleteHelp')}
          control={
            <Button variant="destructive" onClick={() => setDeleting(true)}>
              {t('set.deleteProject')}
            </Button>
          }
        />
      </SettingsSection>
      <DeleteProjectDialog open={deleting} project={project} onClose={() => setDeleting(false)} />
    </>
  )
}

/* ------------------------------------------------------------------- Data */

function DataSection() {
  const { t, lang } = useApp()
  const toast = useToast()
  const sync = useSync()
  const bin =
    useLiveQuery(
      async () => (await db.payments.where('deletedAt').above(0).toArray()).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
      [],
    ) ?? []

  const backup = async () => {
    download(`epc-construction-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup(), 'application/json')
  }
  const restore = async (file: File | undefined) => {
    if (!file) return
    try {
      await importBackup(await file.text())
      toast.show({ kind: 'success', message: t('set.restored') })
    } catch {
      toast.show({ kind: 'error', message: t('set.restoreFailed') })
    }
  }

  /** Copies the current database schema (safe to run again), so updating Supabase is one paste in its SQL Editor. */
  const copySchema = async () => {
    try {
      const { default: sql } = await import('../../../supabase/schema.sql?raw')
      await navigator.clipboard.writeText(sql)
      toast.show({ kind: 'success', message: t('sync.sqlCopied'), duration: 12000 })
    } catch {
      toast.show({ kind: 'error', message: t('err.generic') })
    }
  }

  const syncMessage =
    sync.status.state === 'error'
      ? `${t('sync.state.error')}: ${sync.status.error ?? ''}`
      : t(sync.status.state === 'syncing' ? 'sync.state.syncing' : sync.status.state === 'offline' ? 'sync.state.offline' : 'sync.state.idle')
  const lastSync = useMemo(
    () =>
      sync.status.lastSync
        ? formatTime(new Date(sync.status.lastSync), lang)
        : undefined,
    [sync.status.lastSync, lang],
  )

  return (
    <>
      <SettingsSection title={t('sync.title')}>
        {!sync.configured ? (
          <SettingRow label={t('sync.notConfigured')} help={t('sync.notConfiguredBody')} />
        ) : (
          <>
            <SettingRow
              label={t('set.syncStatus')}
              help={
                <span role="status" className={sync.status.state === 'error' ? 'font-semibold text-danger' : undefined}>
                  {syncMessage}
                  {lastSync && ` · ${t('sync.lastSync', { time: lastSync })}`}
                  {sync.status.pending > 0 && ` · ${t('sync.pending', { count: sync.status.pending })}`}
                </span>
              }
              control={
                <Button variant="outline" onClick={() => void sync.syncNow()}>
                  {t('sync.syncNow')}
                </Button>
              }
              below={
                sync.status.warning ? (
                  <div className="grid gap-2">
                    <p role="status" className="rounded-xl bg-warning-soft p-3 text-sm font-semibold text-warning">
                      {t('sync.schemaOld', { what: sync.status.warning })}
                    </p>
                    <Button variant="outline" className="w-fit" onClick={() => void copySchema()}>
                      {t('sync.copySql')}
                    </Button>
                  </div>
                ) : undefined
              }
            />
          </>
        )}
      </SettingsSection>

      <SettingsSection title={t('set.backup')} description={t('set.backupNote')}>
        <SettingRow
          label={t('set.exportJson')}
          help={t('set.exportHelp')}
          control={
            <Button variant="outline" onClick={() => void backup()}>
              {t('set.exportJson')}
            </Button>
          }
        />
        <SettingRow
          label={t('set.importJson')}
          help={t('set.importHelp')}
          control={
            <Button asChild variant="outline" className="cursor-pointer">
              <label>
                {t('set.importJson')}
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(e) => {
                    void restore(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </label>
            </Button>
          }
        />
      </SettingsSection>

      <SettingsSection title={t('set.bin')}>
        {bin.length === 0 ? (
          <SettingRow label={t('set.binEmpty')} />
        ) : (
          bin.map((p) => (
            <SettingRow
              key={p.id}
              label={p.purpose}
              help={
                <>
                  {formatDate(p.date, lang)} · <span className="tabular">{money(p.amount)}</span>
                </>
              }
              inline
              control={
                <Button size="sm" variant="outline" onClick={() => void restorePayment(p.id)}>
                  {t('common.restore')}
                </Button>
              }
            />
          ))
        )}
      </SettingsSection>
    </>
  )
}

/* ------------------------------------------------------------------ About */

function AboutSection() {
  const { t } = useApp()
  const install = useInstall()
  return (
    <>
      <SettingsSection title={t('set.thisApp')}>
        {install.installed ? (
          <SettingRow label={t('set.install')} help={t('set.installed')} />
        ) : install.canPrompt ? (
          <SettingRow label={t('set.install')} help={t('set.installHelp')} control={<Button variant="secondary" onClick={() => void install.prompt()}>{t('set.installBtn')}</Button>} />
        ) : (
          <SettingRow label={t('set.install')} help={install.ios ? t('set.installIos') : t('set.installNone')} />
        )}
        <SettingRow label={t('set.version')} control={<span className="tabular">{APP_VERSION}</span>} />
      </SettingsSection>
    </>
  )
}
