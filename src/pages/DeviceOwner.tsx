import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { BrandLogo } from '@/components/Brand'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { exportBackup } from '@/db/actions'
import { download } from '@/lib/format'
import { useSync } from '@/sync/SyncProvider'

/**
 * Shown after sign-in when this phone still holds the projects of a different account. The app keeps its data in the browser,
 * so they would otherwise be listed under the new account. They are safe on the server for their own account; here the person
 * either signs out (to go back to that account) or removes them from this phone and carries on with the new account.
 */
export function DeviceOwner({ projects, pending }: { projects: number; pending: number }) {
  const { t } = useApp()
  const { session, signOut, takeOverDevice } = useSync()
  const toast = useToast()
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const email = session?.user.email ?? ''

  const backup = async () => {
    try {
      download(`epc-construction-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup(), 'application/json')
    } catch {
      toast.show({ kind: 'error', message: t('set.del.backupFailed') })
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await takeOverDevice()
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-[calc(100dvh-2*var(--page-gap))] place-items-center rounded-2xl border bg-card px-4 py-8">
      <div className="grid w-full max-w-md justify-items-start gap-5">
        <BrandLogo className="h-auto w-[min(70%,14rem)]" alt={t('app.full')} />
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{t('dev.title')}</h1>
        <p className="text-muted-foreground">{t('dev.body', { n: projects, email })}</p>
        <p className="text-muted-foreground">{t('dev.safe')}</p>
        {pending > 0 && (
          <div role="alert" className="grid gap-3 rounded-xl bg-danger-soft p-4 text-sm font-semibold text-danger">
            {t('dev.pending', { n: pending })}
            <Button variant="outline" className="w-fit" onClick={() => void backup()}>
              <Download aria-hidden="true" />
              {t('set.exportJson')}
            </Button>
          </div>
        )}
        <div className="grid w-full gap-2 sm:w-fit">
          <Button size="lg" onClick={() => void signOut()}>
            {t('dev.signOut')}
          </Button>
          {sure ? (
            <Button size="lg" variant="destructive" disabled={busy} onClick={() => void remove()}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t('dev.removeSure')}
            </Button>
          ) : (
            <Button size="lg" variant="outline" onClick={() => setSure(true)}>
              {t('dev.remove')}
            </Button>
          )}
          <p className="text-sm text-muted-foreground">{t('dev.removeHelp', { email })}</p>
        </div>
      </div>
    </main>
  )
}
