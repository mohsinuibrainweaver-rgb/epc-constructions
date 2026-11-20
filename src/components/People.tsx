import { useCallback, useEffect, useState } from 'react'
import { Copy, MessageCircle, Trash2, UserMinus } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { useToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import type { Role } from '@/db/types'
import { formatDate } from '@/lib/format'
import { groupInviteCode } from '@/lib/invite'
import { useSync } from '@/sync/SyncProvider'
import { supabase } from '@/sync/supabase'

interface Member {
  user_id: string
  role: Role
  email: string | null
}
interface Invite {
  id: string
  code: string
  role: Role
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
  const [role, setRole] = useState<Role>('builder')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<string>()
  const manage = can('managePeople')

  const load = useCallback(async () => {
    if (!supabase || !project) return
    const [m, i] = await Promise.all([
      supabase.from('project_members').select('user_id, role, email').eq('project_id', project.id),
      manage
        ? supabase.from('project_invites').select('id, code, role, expires_at').eq('project_id', project.id).is('accepted_at', null)
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
    const { error: err } = await supabase.from('project_invites').insert({ project_id: project.id, role })
    setBusy(false)
    if (err) {
      // Row level security rejects this until the project has reached the server.
      setError(err.code === '42501' ? t('people.syncFirst') : err.message)
      return
    }
    toast.show({ kind: 'success', message: t('people.sent') })
    void load()
  }

  const withdraw = async (id: string) => {
    await supabase?.from('project_invites').delete().eq('id', id)
    void load()
  }

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(groupInviteCode(code))
      toast.show({ kind: 'success', message: t('people.copied') })
    } catch {
      toast.show({ kind: 'error', message: groupInviteCode(code) })
    }
  }

  const whatsapp = (i: Invite) => {
    const link = `${window.location.origin}/join?code=${i.code}`
    const text = t('people.shareText', { project: project?.name ?? '', role: roleLabel(i.role), link, code: groupInviteCode(i.code) })
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

  const roleLabel = (r: Role) => t(r === 'investor' ? 'set.roleInvestor' : 'set.roleBuilder')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('people.title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="divide-y rounded-xl border">
          {members.map((m) => {
            const me = m.user_id === session?.user.id
            return (
              <li key={m.user_id} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {m.email ?? m.user_id.slice(0, 8)}
                  {me && <span className="font-normal text-muted-foreground"> ({t('people.you')})</span>}
                </span>
                <Badge variant="secondary">{roleLabel(m.role)}</Badge>
                {manage && !me &&
                  (removing === m.user_id ? (
                    <Button size="sm" variant="destructive" onClick={() => void removeMember(m)}>
                      {t('people.removeSure')}
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" aria-label={`${t('people.removeMember')}: ${m.email ?? ''}`} onClick={() => setRemoving(m.user_id)}>
                      <UserMinus aria-hidden="true" />
                    </Button>
                  ))}
              </li>
            )
          })}
        </ul>

        {!manage && <p className="text-sm text-muted-foreground">{t('people.onlyInvestor')}</p>}

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
                    <Badge variant="neutral">{roleLabel(i.role)}</Badge>
                    {i.expires_at && <span className="text-sm text-muted-foreground">{t('people.ends', { date: formatDate(i.expires_at.slice(0, 10), lang) })}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void copy(i.code)}>
                      <Copy aria-hidden="true" />
                      {t('people.copy')}
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
            <PillRadioGroup aria-label={t('people.role')} value={role} onValueChange={(v) => setRole(v as Role)}>
              {(['builder', 'investor'] as Role[]).map((r) => (
                <PillRadioItem key={r} value={r}>
                  {roleLabel(r)}
                </PillRadioItem>
              ))}
            </PillRadioGroup>
            {error && (
              <p role="alert" className="text-sm font-semibold text-danger">
                {error}
              </p>
            )}
            <Button className="w-fit" disabled={busy} onClick={() => void create()}>
              {t('people.createCode')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
