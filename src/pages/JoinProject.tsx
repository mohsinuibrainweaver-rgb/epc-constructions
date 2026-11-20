import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { BrandLogo } from '@/components/Brand'
import { BackLink, Field, PageHeader } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { setSetting } from '@/db/actions'
import { db } from '@/db/db'
import { groupInviteCode, isCompleteInviteCode } from '@/lib/invite'
import { joinProject } from '@/sync/engine'

/** Join a project with the one-time code the investor sent. Standalone, so it also works before any project exists. */
export function JoinProject() {
  const { t, projects } = useApp()
  const nav = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const [code, setCode] = useState(() => groupInviteCode(params.get('code') ?? ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const back = projects.length > 0 ? '/projects' : '/welcome'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
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
  }

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-4 px-1 py-4 sm:py-8">
      {projects.length === 0 && <BrandLogo className="h-auto w-28" alt={t('app.full')} />}
      <BackLink to={back} label={t('common.back')} />
      <PageHeader title={t('join.title')} subtitle={t('join.sub')} />
      <form onSubmit={(e) => void submit(e)} noValidate>
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
