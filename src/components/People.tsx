import { useCallback, useEffect, useState } from 'react'
import { Copy, MessageCircle, Trash2, UserMinus, Users } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Dialog } from '@/components/common'
import { PermissionEditor } from '@/components/PermissionEditor'
import { useToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/format'
import { groupInviteCode, inviteLink } from '@/lib/invite'
import { EMPTY_PERMISSIONS, type Action, type PermissionMap } from '@/lib/permissions'
import { useSync } from '@/sync/SyncProvider'
import { supabase } from '@/sync/supabase'

interface Member {
  user_id: string
  email: string | null
  display_name: string | null
}
interface Invite {
  id: string
  code: string
  permissions: PermissionMap
  expires_at: string | null
}

/**
 * Who is on this project, and invitations. An invitation is a one-time code the investor sends (WhatsApp, say); the other
 * person signs in, chooses "Join with a code" and enters it. Online only: it reads the server directly.
 * Only an investor can invite or remove people; a builder sees who is on the project.
 */
export function People() {
  const { t, lang, project, can } = useApp()
  const { session } = useSync()
  const toast = useToast()
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [permissions, setPermissions] = useState<PermissionMap>({ ...EMPTY_PERMISSIONS })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<string>()
  const manage = can('managePeople')

  const load = useCallback(async () => {
    if (!supabase || !project) return
    const [m, i] = await Promise.all([
      supabase.from('project_members').select('user_id, email, display_name').eq('project_id', project.id),
      manage
        ? supabase.from('project_invites').select('id, code, permissions, expires_at').eq('project_id', project.id).is('accepted_at', null)
        : Promise.resolve({ data: [] }),
    ])
    setMembers((m.data as Member[]) ?? [])
    const now = Date.now()
    setInvites(((i.data as Invite[]) ?? []).filter((x) => !x.expires_at || new Date(x.expires_at).getTime() > now))
  }, [project, manage])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    setError('')
    if (!supabase || !project || !session) return
    setBusy(true)
    const { data, error: err } = await supabase
      .from('project_invites')
      .insert({ project_id: project.id, role: 'builder', permissions })
      .select('id, code, permissions, expires_at')
      .single()
    setBusy(false)
    if (err) {
      // Row level security rejects this until the project has reached the server.
      setError(err.code === '42501' ? t('people.syncFirst') : err.message)
      return
    }
    if (data) setInvites((current) => [data as Invite, ...current])
    setInviteOpen(false)
    setPermissions({ ...EMPTY_PERMISSIONS })
    toast.show({ kind: 'success', message: t('people.sent') })
  }

  const withdraw = async (id: string) => {
    await supabase?.from('project_invites').delete().eq('id', id)
    void load()
  }

  const linkFor = (code: string) => inviteLink(window.location.origin, code)

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(code))
      toast.show({ kind: 'success', message: t('people.copied') })
    } catch {
      toast.show({ kind: 'error', message: linkFor(code) })
    }
  }

  const whatsapp = (i: Invite) => {
    const link = linkFor(i.code)
    const text = t('people.shareText', { project: project?.name ?? '', link, code: groupInviteCode(i.code) })
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  const removeMember = async (m: Member) => {
    if (!supabase || !project) return
    const { error: err } = await supabase.from('project_members').delete().eq('project_id', project.id).eq('user_id', m.user_id)
    setRemoving(undefined)
    if (err) {
      toast.show({ kind: 'error', message: err.message })
      return
    }
    toast.show({ kind: 'success', message: t('people.removed') })
    void load()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-lg">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
            <Users className="size-[18px]" />
          </span>
          {t('people.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="divide-y rounded-xl border">
          {members.map((m) => {
            const me = m.user_id === session?.user.id
            const owner = m.user_id === project?.ownerId
            return (
              <li key={m.user_id} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {m.display_name || m.email || m.user_id.slice(0, 8)}
                  {me && <span className="font-normal text-muted-foreground"> ({t('people.you')})</span>}
                </span>
                {owner && <Badge variant="neutral">{t('people.owner')}</Badge>}
                {manage && !me && !owner &&
                  (removing === m.user_id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="destructive" onClick={() => void removeMember(m)}>{t('people.removeSure')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(undefined)}>{t('common.cancel')}</Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" aria-label={`${t('people.removeMember')}: ${m.email ?? ''}`} onClick={() => setRemoving(m.user_id)}>
                      <UserMinus aria-hidden="true" />
                      {t('people.removeMember')}
                    </Button>
                  ))}
              </li>
            )
          })}
        </ul>

        {!manage && <p className="text-sm text-muted-foreground">{t('people.onlyOwner')}</p>}

        {manage && invites.length > 0 && (
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">{t('people.codes')}</h3>
            <ul className="divide-y rounded-xl border">
              {invites.map((i) => (
                <li key={i.id} className="grid gap-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="tabular rounded-lg bg-muted px-2 py-1 text-base font-semibold tracking-wider" dir="ltr">
                      {groupInviteCode(i.code)}
                    </code>
                    <Badge variant="neutral">{Object.values(i.permissions ?? {}).filter(Boolean).length} permissions</Badge>
                    {i.expires_at && <span className="text-sm text-muted-foreground">{t('people.ends', { date: formatDate(i.expires_at.slice(0, 10), lang) })}</span>}
                  </div>
                  <p className="break-all text-xs text-muted-foreground" dir="ltr">{linkFor(i.code)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void copy(i.code)}>
                      <Copy aria-hidden="true" />
                      {t('people.copyLink')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => whatsapp(i)}>
                      <MessageCircle aria-hidden="true" />
                      {t('people.whatsapp')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void withdraw(i.id)} aria-label={`${t('people.remove')}: ${groupInviteCode(i.code)}`}>
                      <Trash2 aria-hidden="true" />
                      {t('people.remove')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {manage && (
          <div className="grid gap-3">
            <h3 className="text-sm font-semibold">{t('people.inviteTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('people.inviteHelp')}</p>
            {error && (
              <p role="alert" className="text-sm font-semibold text-danger">
                {error}
              </p>
            )}
            <Button className="w-fit" disabled={busy} onClick={() => setInviteOpen(true)}>
              {t('people.createCode')}
            </Button>
          </div>
        )}
      </CardContent>
      <Dialog open={inviteOpen} title={t('people.permissionsTitle')} description={t('people.permissionsHelp')} onClose={() => setInviteOpen(false)}
        footer={<><Button variant="outline" onClick={() => setInviteOpen(false)}>{t('common.cancel')}</Button><Button disabled={busy} onClick={() => void create()}>{t('people.createCode')}</Button></>}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setPermissions(Object.fromEntries(Object.keys(EMPTY_PERMISSIONS).map((key) => [key, true])) as PermissionMap)}>{t('people.selectAll')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setPermissions({ ...EMPTY_PERMISSIONS })}>{t('people.clearAll')}</Button>
        </div>
        <PermissionEditor compact values={permissions} onChange={(permission: Action, enabled) => setPermissions((current) => ({ ...current, [permission]: enabled }))} />
        {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      </Dialog>
    </Card>
  )
}
