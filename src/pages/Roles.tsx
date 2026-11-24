import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { PageHeader } from '@/components/common'
import { PermissionEditor } from '@/components/PermissionEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { db } from '@/db/db'
import { EMPTY_PERMISSIONS, FULL_PERMISSIONS, type Action, type PermissionMap } from '@/lib/permissions'
import { supabase } from '@/sync/supabase'

interface Member { user_id: string; email: string | null; display_name: string | null }

/** Individual project-member permissions. The project owner always bypasses these rows. */
export function Roles() {
  const { project, isOwner, t } = useApp()
  const [members, setMembers] = useState<Member[]>([])
  const [selected, setSelected] = useState('')
  const [values, setValues] = useState<Record<string, PermissionMap>>({})
  const [mobileOpen, setMobileOpen] = useState(false)
  const [busy, setBusy] = useState<Action>()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!project || !supabase || !isOwner()) return
    setMobileOpen(false)
    void Promise.all([
      supabase.from('project_members').select('user_id, email, display_name').eq('project_id', project.id),
      supabase.from('member_permissions').select('user_id, permission, enabled').eq('project_id', project.id),
    ]).then(([memberResult, permissionResult]) => {
      const list = (memberResult.data as Member[] | null) ?? []
      const next: Record<string, PermissionMap> = {}
      for (const member of list) next[member.user_id] = member.user_id === project.ownerId ? { ...FULL_PERMISSIONS } : { ...EMPTY_PERMISSIONS }
      for (const row of (permissionResult.data ?? []) as { user_id: string; permission: Action; enabled: boolean }[]) {
        next[row.user_id] = { ...(next[row.user_id] ?? EMPTY_PERMISSIONS), [row.permission]: row.enabled }
      }
      setMembers(list)
      setValues(next)
      setSelected((current) => current || list.find((m) => m.user_id !== project.ownerId)?.user_id || list[0]?.user_id || '')
    })
  }, [project, isOwner])

  const change = async (permission: Action, enabled: boolean) => {
    if (!project || !supabase || !selected || selected === project.ownerId) return
    const previous = values[selected]?.[permission] === true
    const nextForMember = { ...values[selected], [permission]: enabled }
    setValues((current) => ({ ...current, [selected]: nextForMember }))
    setBusy(permission)
    setError('')
    const { error: saveError } = await supabase.from('member_permissions').upsert(
      { project_id: project.id, user_id: selected, permission, enabled, updated_at: new Date().toISOString() },
      { onConflict: 'project_id,user_id,permission' },
    )
    setBusy(undefined)
    if (saveError) {
      setValues((current) => ({ ...current, [selected]: { ...current[selected], [permission]: previous } }))
      setError(saveError.message)
      return
    }
    const accountId = (await db.settings.get('account.userId'))?.value
    if (accountId === selected) await db.settings.put({ key: `member.permissions.${project.id}`, value: nextForMember })
  }

  if (!project || !isOwner()) return null
  const label = (member: Member) => member.display_name || member.email || member.user_id.slice(0, 8)
  const selectedMember = members.find((member) => member.user_id === selected)

  return (
    <div className="grid gap-5 max-sm:gap-2.5 md:h-[calc(100dvh-8.5rem)] md:grid-rows-[auto_minmax(0,1fr)_auto] md:overflow-hidden">
      <div className={mobileOpen ? 'max-md:hidden' : undefined}>
        <PageHeader
          title={t('roles.title')}
          subtitle={t('roles.subtitle')}
          titleClassName="max-sm:text-[1.375rem] max-sm:leading-tight"
          subtitleClassName="max-sm:mt-1 max-sm:text-sm max-sm:leading-relaxed"
        />
      </div>
      {members.length <= 1 ? (
        <Card><CardContent className="p-5 text-sm text-muted-foreground">{t('roles.empty')}</CardContent></Card>
      ) : (
        <>
          <div className="md:hidden">
            {!mobileOpen ? (
              <div className="grid gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">{t('roles.members')}</h2>
                  <span className="text-xs text-muted-foreground">{t('roles.peopleCount', { count: members.length })}</span>
                </div>
                <ul className="grid gap-2">
                  {members.map((member) => {
                    const owner = member.user_id === project.ownerId
                    const secondary = member.display_name && member.email ? member.email : owner ? t('roles.fullAccess') : t('roles.customAccess')
                    return (
                      <li key={member.user_id}>
                        <button type="button" onClick={() => { setSelected(member.user_id); setMobileOpen(true) }}
                          className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-control border bg-card p-3 text-start shadow-sm transition-colors hover:bg-muted/60 active:bg-muted">
                          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground">
                            {owner ? <ShieldCheck className="size-5" /> : <UserRound className="size-5" />}
                          </span>
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            <span className="truncate font-semibold">{label(member)}</span>
                            <span className="truncate text-xs text-muted-foreground">{secondary}</span>
                          </span>
                          {owner && <Badge variant="neutral" className="px-1.5 text-[0.625rem]">{t('people.owner')}</Badge>}
                          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : selectedMember ? (
              <div className="grid gap-3">
                <Button type="button" size="sm" variant="ghost" className="-ms-2 w-fit px-2" onClick={() => setMobileOpen(false)}>
                    <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
                    {t('roles.members')}
                </Button>
                <div className="flex items-center gap-3 rounded-control border bg-card p-3 shadow-sm">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-control bg-muted text-foreground">
                    {selectedMember.user_id === project.ownerId ? <ShieldCheck className="size-5" /> : <UserRound className="size-5" />}
                  </span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <h1 className="truncate text-lg font-semibold">{label(selectedMember)}</h1>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedMember.user_id === project.ownerId ? t('roles.ownerFull') : selectedMember.email || t('roles.customAccess')}
                    </p>
                  </div>
                  <Badge variant="neutral">{selectedMember.user_id === project.ownerId ? t('people.owner') : t('roles.customAccess')}</Badge>
                </div>
                <div className="flex items-end justify-between gap-3 px-0.5">
                  <div>
                    <h2 className="font-semibold">{t('roles.permissions')}</h2>
                    <p className="text-xs text-muted-foreground">{t('roles.choose')}</p>
                  </div>
                  {selectedMember.user_id !== project.ownerId && <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{t('roles.saved')}</span>}
                </div>
                <div className="overflow-hidden rounded-control border bg-card px-3">
                  <PermissionEditor compact neutral mobileDense values={values[selectedMember.user_id] ?? EMPTY_PERMISSIONS}
                    disabled={selectedMember.user_id === project.ownerId ? true : busy}
                    onChange={(permission, enabled) => void change(permission, enabled)} />
                </div>
              </div>
            ) : null}
          </div>

          <Tabs value={selected} onValueChange={setSelected} className="hidden gap-2.5 md:grid md:h-full md:min-h-0 md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-4">
          <aside className="min-w-0 md:z-10 md:self-start md:overflow-hidden md:rounded-control md:border md:bg-card md:shadow-sm">
            <div className="hidden items-center gap-3 border-b px-4 py-3.5 md:flex">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-control bg-muted text-foreground">
                <UsersRound className="size-[1.125rem]" />
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <h2 className="font-semibold">{t('roles.members')}</h2>
                <p className="text-xs text-muted-foreground">{t('roles.peopleCount', { count: members.length })}</p>
              </div>
            </div>
            <TabsList aria-label={t('roles.members')} className="h-auto w-fit max-w-full justify-start gap-1 overflow-x-auto rounded-md bg-muted p-1 md:flex md:w-full md:flex-col md:items-stretch md:justify-start md:gap-1.5 md:overflow-visible md:rounded-none md:bg-transparent md:p-2.5 md:[&>[data-slot=tabs-indicator]]:hidden">
              {members.map((member) => {
                const owner = member.user_id === project.ownerId
                const secondary = member.display_name && member.email ? member.email : owner ? t('roles.fullAccess') : t('roles.customAccess')
                return (
                  <TabsTrigger key={member.user_id} value={member.user_id} className="group/member max-w-44 shrink-0 gap-2 px-2 py-2 md:h-auto md:w-full md:max-w-none md:min-w-0 md:justify-start md:rounded-control md:border md:border-transparent md:px-2.5 md:py-2.5 md:text-start md:shadow-none md:hover:bg-muted/70 md:data-[state=active]:border-border md:data-[state=active]:bg-muted md:data-[state=active]:text-foreground">
                    <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-background text-muted-foreground shadow-sm md:size-8 md:group-data-[state=active]/member:text-foreground">
                      <UserRound className="size-4" />
                    </span>
                    <span className="grid min-w-0 gap-0.5 text-start md:flex-1">
                      <span className="truncate">{label(member)}</span>
                      <span className="hidden truncate text-xs font-normal text-muted-foreground md:block">{secondary}</span>
                    </span>
                    {owner && <Badge variant="neutral" className="px-1.5 text-[0.625rem] max-md:ms-1">{t('people.owner')}</Badge>}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </aside>
          <div className="min-w-0 md:h-full md:min-h-0 md:overflow-hidden md:rounded-control md:border md:bg-card md:shadow-sm">
            {members.map((member) => {
              const owner = member.user_id === project.ownerId
              return (
                <TabsContent key={member.user_id} value={member.user_id} className="m-0 md:grid md:h-full md:min-h-0 md:grid-rows-[auto_minmax(0,1fr)]">
                  <div className="hidden items-center gap-3 border-b px-4 py-4 sm:px-5 md:flex md:px-6">
                    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-control bg-muted text-foreground">
                      {owner ? <ShieldCheck className="size-5" /> : <UserRound className="size-5" />}
                    </span>
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <h2 className="truncate text-lg font-semibold">{label(member)}</h2>
                      <p className="text-sm text-muted-foreground">{owner ? t('roles.ownerFull') : t('roles.chooseExact')}</p>
                    </div>
                  </div>
                  <div className="pt-0 sm:px-5 sm:pb-5 md:overflow-y-auto md:px-6 md:pb-6 md:[scrollbar-color:color-mix(in_oklab,var(--foreground)_25%,transparent)_transparent] md:[scrollbar-width:thin] md:[&::-webkit-scrollbar]:w-1.5 md:[&::-webkit-scrollbar-thumb]:rounded-full md:[&::-webkit-scrollbar-thumb]:bg-foreground/20 md:[&::-webkit-scrollbar-track]:bg-transparent">
                    <PermissionEditor compact neutral mobileDense values={values[member.user_id] ?? EMPTY_PERMISSIONS} disabled={owner ? true : busy}
                      onChange={(permission, enabled) => void change(permission, enabled)} />
                  </div>
                </TabsContent>
              )
            })}
          </div>
          </Tabs>
        </>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  )
}
