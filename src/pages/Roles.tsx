import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { PageHeader } from '@/components/common'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { db } from '@/db/db'
import type { Role } from '@/db/types'
import { DEFAULT_PERMISSIONS, PERMISSIONS, type Action, type PermissionMap } from '@/lib/permissions'
import { supabase } from '@/sync/supabase'

const GROUPS = ['payments', 'project', 'money', 'people'] as const
const TITLES = { payments: 'Payments', project: 'Project', money: 'Contracts and money', people: 'People' }

/** Project-specific role permissions. Only the project creator can change these rows (enforced by RLS). */
export function Roles() {
  const { project, isOwner } = useApp()
  const [role, setRole] = useState<Role>('investor')
  const [values, setValues] = useState<Record<Role, Record<Action, boolean>>>(DEFAULT_PERMISSIONS)
  const [busy, setBusy] = useState<Action>()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!project || !supabase) return
    void supabase.from('role_permissions').select('role, permission, enabled').eq('project_id', project.id).then(({ data }) => {
      if (!data) return
      setValues((current) => {
        const next = { investor: { ...current.investor }, builder: { ...current.builder } }
        for (const row of data as { role: Role; permission: Action; enabled: boolean }[]) next[row.role][row.permission] = row.enabled
        return next
      })
    })
  }, [project])

  const change = async (permission: Action, enabled: boolean) => {
    if (!project || !supabase || !isOwner()) return
    const previous = values[role][permission]
    setValues((v) => ({ ...v, [role]: { ...v[role], [permission]: enabled } }))
    setBusy(permission)
    setError('')
    const { error: saveError } = await supabase.from('role_permissions').upsert(
      { project_id: project.id, role, permission, enabled, updated_at: new Date().toISOString() },
      { onConflict: 'project_id,role,permission' },
    )
    setBusy(undefined)
    if (saveError) {
      setValues((v) => ({ ...v, [role]: { ...v[role], [permission]: previous } }))
      setError(saveError.message)
      return
    }
    const ownRole = (await db.settings.get(`member.role.${project.id}`))?.value as Role | undefined
    if (ownRole === role) {
      const key = `member.permissions.${project.id}`
      const cached = ((await db.settings.get(key))?.value ?? {}) as PermissionMap
      await db.settings.put({ key, value: { ...cached, [permission]: enabled } })
    }
  }

  if (!project) return null
  if (!isOwner()) {
    return (
      <div className="grid gap-4">
        <PageHeader title="Roles and permissions" subtitle="Only the project owner can manage role permissions." />
        <Card><CardContent className="p-5 text-sm text-muted-foreground">You can use the project according to the permissions assigned to your role.</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <PageHeader title="Roles and permissions" subtitle="Choose what investors and builders can do in this project. The project owner always has full access." />
      <Tabs value={role} onValueChange={(value) => setRole(value as Role)}>
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="investor" className="flex-1 sm:flex-none">Investor</TabsTrigger>
          <TabsTrigger value="builder" className="flex-1 sm:flex-none">Builder</TabsTrigger>
        </TabsList>
        {(['investor', 'builder'] as Role[]).map((tabRole) => (
          <TabsContent key={tabRole} value={tabRole} className="grid gap-4">
            {GROUPS.map((group) => (
              <Card key={group}>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" />{TITLES[group]}</CardTitle></CardHeader>
                <CardContent className="divide-y">
                  {PERMISSIONS.filter((p) => p.group === group).map((permission) => (
                    <label key={permission.key} className="flex min-h-16 cursor-pointer items-center gap-4 py-3">
                      <span className="min-w-0 flex-1"><span className="block font-semibold">{permission.label}</span><span className="block text-sm text-muted-foreground">{permission.description}</span></span>
                      <Switch checked={values[tabRole][permission.key]} disabled={busy === permission.key} onCheckedChange={(checked) => void change(permission.key, checked)} aria-label={permission.label} />
                    </label>
                  ))}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        ))}
      </Tabs>
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  )
}
