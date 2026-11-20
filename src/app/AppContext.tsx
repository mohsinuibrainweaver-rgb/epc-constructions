import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Loader2 } from 'lucide-react'
import { db } from '../db/db'
import { DEFAULT_SETTINGS, ensurePlanPayments, purgeBin } from '../db/actions'
import type { Lang, Phase, Project, Role, Settings } from '../db/types'
import { en, type Key } from '../i18n/en'
import { ur } from '../i18n/ur'
import { interpolate } from '../lib/format'
import { can as canDo, type Action } from '../lib/permissions'
import { currencyLabel, regionFrom, setRegion } from '../lib/region'

interface AppCtx {
  /** The settings of this device, with `role` already worked out for the open project (see `roleFromProject`). */
  settings: Settings
  /** True when the role comes from the project (the server says what this person is there); false when it is this device's own setting. */
  roleFromProject: boolean
  /** Whether the person may do this in the open project. Only an investor may do the things in lib/permissions.ts. */
  can: (action: Action, projectId?: string) => boolean
  /** What the person is in the given project (the Projects list shows several). */
  roleOf: (projectId: string) => Role
  lang: Lang
  t: (key: Key, vars?: Record<string, string | number>) => string
  project?: Project
  projects: Project[]
  phaseName: (p: Phase) => string
}

const Ctx = createContext<AppCtx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const rows = useLiveQuery(() => db.settings.toArray(), [])
  const projects = useLiveQuery(
    async () => (await db.projects.orderBy('updatedAt').reverse().toArray()).filter((p) => !p.deletedAt),
    [],
  )

  const deviceSettings = useMemo<Settings>(() => {
    const s: Settings = { ...DEFAULT_SETTINGS }
    for (const r of rows ?? []) (s as unknown as Record<string, unknown>)[r.key] = r.value
    return s
  }, [rows])

  // The region choices (date, number and money writing) are read by plain functions such as money(), so they are
  // handed over here, before anything below renders. Everything that shows them re-renders when `settings` changes.
  setRegion(deviceSettings.region)
  const currency = regionFrom(deviceSettings.region).currency

  const lang = deviceSettings.language
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr'
    // Inside the app the shell sets the title from the page heading; this covers the screens outside it.
    if (!document.getElementById('main')) document.title = lang === 'ur' ? ur['app.name'] : en['app.name']
  }, [lang])

  useEffect(() => {
    void purgeBin()
  }, [])

  // Weekly plans: create this week's (and next week's) due payments, now and whenever the app is opened again.
  const planKey = useLiveQuery(
    async () => {
      const id = (await db.projects.toArray()).find((p) => !p.deletedAt && p.id === deviceSettings.currentProjectId)?.id
      if (!id) return ''
      return (await db.plans.where('projectId').equals(id).toArray())
        .filter((p) => p.active && !p.deletedAt)
        .map((p) => `${p.id}:${p.weekday}:${p.startDate}:${p.generatedThrough ?? ''}`)
        .join('|')
    },
    [deviceSettings.currentProjectId],
  )
  useEffect(() => {
    const id = deviceSettings.currentProjectId
    if (!id || !planKey) return
    const run = () => void ensurePlanPayments(id)
    run()
    const onVisible = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(run, 60 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [deviceSettings.currentProjectId, planKey])

  // {cur} in a text is the currency word of the field labels: "Amount ({cur})".
  const t = useCallback(
    (key: Key, vars?: Record<string, string | number>) =>
      interpolate((lang === 'ur' ? ur[key] : en[key]) ?? en[key], { cur: currencyLabel(lang, true, regionFrom({ currency })), ...vars }),
    [lang, currency],
  )

  const list = projects ?? []
  const project = list.find((p) => p.id === deviceSettings.currentProjectId) ?? list[0]

  // The role belongs to the project: the server says what this person is in it (kept as `member.role.<id>` by the sync).
  // Without that (a project that has not reached the server, or no account) the device's own setting is used.
  const memberRole = project ? rows?.find((r) => r.key === `member.role.${project.id}`)?.value : undefined
  const fromProject = memberRole === 'investor' || memberRole === 'builder'
  const role: Role = fromProject ? memberRole : deviceSettings.role
  const settings = useMemo<Settings>(() => ({ ...deviceSettings, role }), [deviceSettings, role])
  // The same for any project (the Projects list shows several, and the person may be an investor in one and a builder in another).
  const roleIn = useCallback(
    (id: string): Role => {
      const v = rows?.find((r) => r.key === `member.role.${id}`)?.value
      return v === 'investor' || v === 'builder' ? v : deviceSettings.role
    },
    [rows, deviceSettings.role],
  )
  const can = useCallback((action: Action, projectId?: string) => canDo(projectId ? roleIn(projectId) : role, action), [role, roleIn])

  const phaseName = useCallback(
    (p: Phase) => p.name || (p.key ? t(`phase.${p.key}` as Key) : ''),
    [t],
  )

  const value = useMemo<AppCtx>(
    () => ({ settings, roleFromProject: fromProject, can, roleOf: roleIn, lang, t, project, projects: list, phaseName }),
    [settings, fromProject, can, roleIn, lang, t, project, list, phaseName],
  )

  // Wait for the first read from the local database so the app never flashes empty.
  if (rows === undefined || projects === undefined)
    return (
      <div role="status" aria-busy="true" className="grid min-h-[calc(100dvh-2*var(--page-gap))] place-items-center">
        <Loader2 aria-hidden="true" className="size-8 animate-spin text-primary motion-reduce:animate-none" />
        <span className="sr-only">Loading</span>
      </div>
    )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('AppProvider missing')
  return c
}
