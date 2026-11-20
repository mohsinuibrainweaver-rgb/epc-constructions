import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Field, GroupField } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import type { Role } from '@/db/types'
import { useSync } from '@/sync/SyncProvider'
import { supabase } from '@/sync/supabase'

interface Member {
  user_id: string
  role: Role
  email: string | null
}
interface Invite {
  id: string
  email: string
  role: Role
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Who is on this project, and invitations by email. Online only: it reads the server directly. */
export function People() {
  const { t, project } = useApp()
  const { session } = useSync()
  const toast = useToast()
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('builder')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!supabase || !project) return
    const [m, i] = await Promise.all([
      supabase.from('project_members').select('user_id, role, email').eq('project_id', project.id),
      supabase.from('project_invites').select('id, email, role').eq('project_id', project.id).is('accepted_at', null),
    ])
    setMembers((m.data as Member[]) ?? [])
    setInvites((i.data as Invite[]) ?? [])
  }, [project])

  useEffect(() => {
    void load()
  }, [load])

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!EMAIL.test(email.trim())) {
      setError(t('auth.invalidEmail'))
      return
    }
    if (!supabase || !project || !session) return
    setBusy(true)
    const { error: err } = await supabase.from('project_invites').insert({
      project_id: project.id,
      email: email.trim().toLowerCase(),
      role,
      invited_by: session.user.id,
    })
    setBusy(false)
    if (err) {
      // Row level security rejects this until the project has reached the server.
      setError(err.code === '42501' ? t('people.syncFirst') : err.message)
      return
    }
    setEmail('')
    toast.show({ kind: 'success', message: t('people.sent') })
    void load()
  }

  const removeInvite = async (id: string) => {
    await supabase?.from('project_invites').delete().eq('id', id)
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
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1 truncate font-semibold">
                {m.email ?? m.user_id.slice(0, 8)}
                {m.user_id === session?.user.id && <span className="font-normal text-muted-foreground"> ({t('people.you')})</span>}
              </span>
              <Badge variant="secondary">{roleLabel(m.role)}</Badge>
            </li>
          ))}
          {invites.map((i) => (
            <li key={i.id} className="flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{i.email}</span>
                <span className="text-sm text-muted-foreground">{t('people.pending')}</span>
              </span>
              <Badge variant="neutral">{roleLabel(i.role)}</Badge>
              <Button variant="ghost" size="icon" aria-label={`${t('people.remove')}: ${i.email}`} onClick={() => void removeInvite(i.id)}>
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>

        <form className="grid gap-4" onSubmit={(e) => void invite(e)} noValidate>
          <Field label={t('people.inviteEmail')} error={error}>
            <Input type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <GroupField label={t('people.role')}>
            {(labelId) => (
              <PillRadioGroup aria-labelledby={labelId} value={role} onValueChange={(v) => setRole(v as Role)}>
                {(['builder', 'investor'] as Role[]).map((r) => (
                  <PillRadioItem key={r} value={r}>
                    {roleLabel(r)}
                  </PillRadioItem>
                ))}
              </PillRadioGroup>
            )}
          </GroupField>
          <Button type="submit" className="w-fit" disabled={busy}>
            {t('people.send')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
