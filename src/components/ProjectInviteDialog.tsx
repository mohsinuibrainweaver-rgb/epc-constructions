import { useEffect, useState } from 'react'
import { Copy, MessageCircle } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Dialog } from '@/components/common'
import { PermissionEditor } from '@/components/PermissionEditor'
import { useToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Project } from '@/db/types'
import { formatDate } from '@/lib/format'
import { groupInviteCode, inviteLink } from '@/lib/invite'
import { EMPTY_PERMISSIONS, type Action, type PermissionMap } from '@/lib/permissions'
import { supabase } from '@/sync/supabase'

export interface ProjectInvite {
  id: string
  code: string
  permissions: PermissionMap
  expires_at: string | null
}

/** Shared invite flow used from Project settings and directly from a project card. */
export function ProjectInviteDialog({ open, project, onClose, onCreated }: {
  open: boolean
  project: Project
  onClose: () => void
  onCreated?: (invite: ProjectInvite) => void
}) {
  const { t, lang } = useApp()
  const toast = useToast()
  const [permissions, setPermissions] = useState<PermissionMap>({ ...EMPTY_PERMISSIONS })
  const [created, setCreated] = useState<ProjectInvite>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPermissions({ ...EMPTY_PERMISSIONS })
    setCreated(undefined)
    setError('')
    setBusy(false)
  }, [open, project.id])

  const linkFor = (code: string) => inviteLink(window.location.origin, code)

  const create = async () => {
    if (!supabase) return
    setError('')
    setBusy(true)
    const { data, error: createError } = await supabase
      .from('project_invites')
      .insert({ project_id: project.id, role: 'builder', permissions })
      .select('id, code, permissions, expires_at')
      .single()
    setBusy(false)
    if (createError) {
      setError(createError.code === '42501' ? t('people.syncFirst') : createError.message)
      return
    }
    if (!data) return
    const invite = data as ProjectInvite
    setCreated(invite)
    onCreated?.(invite)
    toast.show({ kind: 'success', message: t('people.sent') })
  }

  const copy = async () => {
    if (!created) return
    const link = linkFor(created.code)
    try {
      await navigator.clipboard.writeText(link)
      toast.show({ kind: 'success', message: t('people.copied') })
    } catch {
      toast.show({ kind: 'error', message: link })
    }
  }

  const whatsapp = () => {
    if (!created) return
    const link = linkFor(created.code)
    const text = t('people.shareText', { project: project.name, link, code: groupInviteCode(created.code) })
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  return (
    <Dialog
      open={open}
      title={created ? t('people.inviteTitle') : t('people.permissionsTitle')}
      description={created ? project.name : t('people.permissionsHelp')}
      onClose={onClose}
      footer={created ? (
        <Button onClick={onClose}>{t('common.close')}</Button>
      ) : (
        <>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={busy} onClick={() => void create()}>{t('people.createCode')}</Button>
        </>
      )}
    >
      {created ? (
        <div className="grid gap-4">
          <div className="grid gap-2 rounded-control border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <code className="tabular rounded-control bg-card px-2.5 py-1.5 text-base font-semibold tracking-wider" dir="ltr">
                {groupInviteCode(created.code)}
              </code>
              <Badge variant="neutral">{Object.values(created.permissions ?? {}).filter(Boolean).length} permissions</Badge>
              {created.expires_at && <span className="text-sm text-muted-foreground">{t('people.ends', { date: formatDate(created.expires_at.slice(0, 10), lang) })}</span>}
            </div>
            <p className="break-all text-sm text-muted-foreground" dir="ltr">{linkFor(created.code)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copy()}>
              <Copy aria-hidden="true" />
              {t('people.copyLink')}
            </Button>
            <Button variant="outline" onClick={whatsapp}>
              <MessageCircle aria-hidden="true" />
              {t('people.whatsapp')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setPermissions(Object.fromEntries(Object.keys(EMPTY_PERMISSIONS).map((key) => [key, true])) as PermissionMap)}>{t('people.selectAll')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setPermissions({ ...EMPTY_PERMISSIONS })}>{t('people.clearAll')}</Button>
          </div>
          <PermissionEditor compact values={permissions} onChange={(permission: Action, enabled) => setPermissions((current) => ({ ...current, [permission]: enabled }))} />
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
        </>
      )}
    </Dialog>
  )
}
