import { Link, Navigate } from 'react-router-dom'
import { BrandLogo } from '@/components/Brand'
import { useApp } from '@/app/AppContext'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useSync } from '@/sync/SyncProvider'

export function Welcome() {
  const { t, projects } = useApp()
  const sync = useSync()
  if (projects.length > 0) return <Navigate to="/" replace />
  return (
    <main className="relative grid min-h-[calc(100dvh-2*var(--page-gap))] place-items-center rounded-2xl border auth-bg px-4 py-8 max-sm:pt-20">
      <LanguageSwitcher />
      <div className="grid w-full max-w-md justify-items-start gap-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <BrandLogo className="h-auto w-[min(70%,14rem)]" alt={t('app.full')} />
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{t('welcome.title')}</h1>
        <p className="text-muted-foreground">{t('welcome.body')}</p>
        {sync.configured && sync.session && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-info-soft p-4 text-sm font-semibold text-info">
            {t('welcome.syncNote')}
            <Button size="sm" variant="outline" onClick={() => void sync.syncNow()}>
              {t('sync.syncNow')}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link to="/projects/new">{t('welcome.cta')}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/join">{t('welcome.join')}</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
