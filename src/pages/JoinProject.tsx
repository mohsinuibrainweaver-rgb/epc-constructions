import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, Loader2, MapPin, UserRound } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { BrandLogo } from '@/components/Brand'
import { BackLink, Field, PageHeader } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { setSetting } from '@/db/actions'
import { db } from '@/db/db'
import { groupInviteCode, isCompleteInviteCode } from '@/lib/invite'
import { useObjectUrl } from '@/lib/image'
import { ensureProjectThumbnail, joinProject } from '@/sync/engine'
import { useSync } from '@/sync/SyncProvider'
import { supabase } from '@/sync/supabase'

interface InvitePreview {
  valid: boolean
  project: {
    name: string
    location: string
    ownerName: string
    image: string
  } | null
}

/** Join a project with the one-time code its owner sent. Standalone, so it also works before any project exists. */
export function JoinProject() {
  const { t, projects } = useApp()
  const { status, syncNow } = useSync()
  const nav = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const linkedCode = params.get('invite') ?? params.get('code') ?? ''
  const [code, setCode] = useState(() => groupInviteCode(linkedCode))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [inviteState, setInviteState] = useState<'checking' | 'available' | 'already_member'>('checking')
  const [existingProjectId, setExistingProjectId] = useState('')
  const back = projects.length > 0 ? '/projects' : '/welcome'
  const joiningFromLink = isCompleteInviteCode(linkedCode)
  const autoAccept = joiningFromLink && params.get('accept') === 'auto'
  const existingProject = projects.find((project) => project.id === existingProjectId)
  const existingProjectImage = useObjectUrl(existingProject?.thumbnail)

  useEffect(() => {
    if (inviteState !== 'already_member' || !existingProject || existingProject.thumbnail || !existingProject.thumbnailPath) return
    void ensureProjectThumbnail(existingProject)
  }, [existingProject, inviteState])

  useEffect(() => {
    if (!joiningFromLink || !supabase) {
      setInviteState('available')
      return
    }
    let alive = true
    setInviteState('checking')
    void supabase.rpc('invite_status', { p_code: linkedCode }).then(({ data, error: statusError }) => {
      if (!alive) return
      const result = data as { status?: string; project_id?: string } | null
      if (!statusError && result?.status === 'already_member' && result.project_id) {
        setExistingProjectId(result.project_id)
        setInviteState('already_member')
      } else setInviteState('available')
    })
    return () => {
      alive = false
    }
  }, [joiningFromLink, linkedCode])

  useEffect(() => {
    if (!joiningFromLink || autoAccept) return
    const controller = new AbortController()
    setPreviewLoading(true)
    void fetch(`/api/invite?invite=${encodeURIComponent(linkedCode)}&format=json`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('preview unavailable')
        return response.json() as Promise<InvitePreview>
      })
      .then((data) => setPreview(data.valid ? data : null))
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) setPreview(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false)
      })
    return () => controller.abort()
  }, [autoAccept, joiningFromLink, linkedCode])

  const join = useCallback(async () => {
    if (busy) return
    if (!isCompleteInviteCode(code)) {
      setError(t('join.enter'))
      return
    }
    setBusy(true)
    setError('')
    const res = await joinProject(code)
    setBusy(false)
    if (!res.ok) {
      setError(
        res.reason === 'invalid'
          ? t('join.invalid')
          : res.reason === 'offline'
            ? t('join.offline')
            : res.reason === 'notReady'
              ? t('join.notReady')
              : t('join.error', { message: res.message ?? '' }),
      )
      return
    }
    // Open the project that was just joined, when it has arrived on this phone.
    if (await db.projects.get(res.projectId)) await setSetting('currentProjectId', res.projectId)
    toast.show({ kind: 'success', message: t('join.joined') })
    nav('/')
  }, [busy, code, nav, t, toast])

  const openExistingProject = useCallback(async () => {
    if (!existingProjectId) return
    if (!(await db.projects.get(existingProjectId))) await syncNow()
    if (await db.projects.get(existingProjectId)) await setSetting('currentProjectId', existingProjectId)
    nav('/', { replace: true })
  }, [existingProjectId, nav, syncNow])

  const autoTried = useRef(false)
  useEffect(() => {
    const syncReady = status.state !== 'off' && status.state !== 'signedOut'
    if (autoTried.current || !autoAccept || !syncReady || inviteState === 'checking' || !isCompleteInviteCode(linkedCode)) return
    autoTried.current = true
    if (inviteState === 'already_member') void openExistingProject()
    else void join()
  }, [autoAccept, inviteState, join, linkedCode, openExistingProject, status.state])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void join()
  }

  // A person who signed in from the invite link is joined immediately. Someone who was already signed in confirms first,
  // so opening a link can never silently change their project memberships.
  if (autoAccept) {
    return (
      <main className="grid min-h-[calc(100dvh-2*var(--page-gap))] place-items-center">
        <div role="status" className="grid justify-items-center gap-3 text-sm font-semibold text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
          {t('join.joining')}
        </div>
      </main>
    )
  }

  if (joiningFromLink) {
    const previewProject = preview?.project
    const project = {
      name: previewProject?.name || existingProject?.name || '',
      location: previewProject?.location || existingProject?.location || '',
      ownerName: previewProject?.ownerName || '',
      image: previewProject?.image || existingProjectImage || '',
    }
    const alreadyMember = inviteState === 'already_member'
    return (
      <main className="grid min-h-[calc(100dvh-2*var(--page-gap))] place-items-center px-4 py-8">
        <Card className="w-full max-w-lg gap-0 overflow-hidden py-0 shadow-sm">
          <div className="relative aspect-[16/7] min-h-40 overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-background">
            {project.image ? (
              <img src={project.image} alt="" className="size-full object-cover" />
            ) : previewLoading ? (
              <Skeleton className="size-full rounded-none" />
            ) : (
              <div className="grid size-full place-items-center">
                <span className="grid size-16 place-items-center rounded-2xl border bg-background/85 text-primary shadow-sm backdrop-blur">
                  <Building2 aria-hidden="true" className="size-8" />
                </span>
              </div>
            )}
          </div>
          <CardContent className="grid gap-5 px-5 py-5 sm:px-7 sm:py-6">
            <div className="grid gap-2 text-center">
              {previewLoading ? (
                <>
                  <Skeleton className="mx-auto h-8 w-2/3" />
                  <Skeleton className="mx-auto h-4 w-4/5" />
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-semibold tracking-tight">{project.name || t('join.inviteTitle')}</h1>
                  <p className="text-sm text-muted-foreground">{t(alreadyMember ? 'join.alreadySub' : 'join.inviteSub')}</p>
                </>
              )}
            </div>
            {(project.location || project.ownerName) && (
              <dl className="grid gap-3 rounded-control bg-muted/55 p-4 text-left">
                {project.location && (
                  <div className="grid grid-cols-[auto_1fr] gap-x-3">
                    <MapPin aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">{t('join.location')}</dt>
                      <dd className="text-sm font-semibold">{project.location}</dd>
                    </div>
                  </div>
                )}
                {project.ownerName && (
                  <div className="grid grid-cols-[auto_1fr] gap-x-3">
                    <UserRound aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">{t('join.owner')}</dt>
                      <dd className="text-sm font-semibold">{project.ownerName}</dd>
                    </div>
                  </div>
                )}
              </dl>
            )}
            {error && <p role="alert" className="w-full rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p>}
            <div className="grid w-full gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => nav(projects.length > 0 ? '/projects' : '/welcome')} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => void (alreadyMember ? openExistingProject() : join())}
                disabled={busy || inviteState === 'checking'}
              >
                {(busy || inviteState === 'checking') && <Loader2 className="animate-spin" aria-hidden="true" />}
                {t(alreadyMember ? 'join.openProject' : 'join.accept')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-4 px-1 py-4 sm:py-8">
      {projects.length === 0 && <BrandLogo className="h-auto w-28" alt={t('app.full')} />}
      <BackLink to={back} label={t('common.back')} />
      <PageHeader title={t('join.title')} subtitle={t('join.sub')} />
      <form onSubmit={submit} noValidate>
        <Card className="gap-4 py-5">
          <CardContent className="grid gap-4 px-4 sm:px-6">
            <Field label={t('join.code')} error={error}>
              <Input
                value={code}
                onChange={(e) => {
                  setCode(groupInviteCode(e.target.value))
                  setError('')
                }}
                dir="ltr"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                placeholder="ABCD-EFGH-IJKL"
                className="tabular text-lg font-semibold tracking-widest"
              />
            </Field>
            <Button type="submit" size="lg" disabled={busy} className="w-full sm:w-fit">
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t('join.cta')}
            </Button>
          </CardContent>
        </Card>
      </form>
    </main>
  )
}
