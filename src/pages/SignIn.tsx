import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { BrandLogo } from '@/components/Brand'
import { useApp } from '@/app/AppContext'
import { Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { setSetting } from '@/db/actions'
import { supabase } from '@/sync/supabase'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Email and password. Each person creates their own account once, then signs in. */
export function SignIn() {
  const { t, lang } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const submit = async (ev: FormEvent | React.MouseEvent, create: boolean) => {
    ev.preventDefault()
    setError('')
    setEmailError('')
    setNotice('')
    if (!EMAIL.test(email.trim())) {
      setEmailError(t('auth.invalidEmail'))
      return
    }
    if (!supabase) return
    setBusy(true)
    const creds = { email: email.trim(), password }
    if (create) {
      const { data, error: e } = await supabase.auth.signUp(creds)
      // With "Confirm email" on, no session comes back until the emailed link is used.
      if (e) setError(e.message)
      else if (!data.session) setNotice(t('auth.confirmEmail'))
    } else {
      const { error: e } = await supabase.auth.signInWithPassword(creds)
      if (e) setError(e.message)
    }
    setBusy(false)
  }

  const short = password.length < 6

  return (
    <main className="grid min-h-[calc(100dvh-2*var(--page-gap))] place-items-center rounded-2xl border bg-card px-4 py-8">
      <div className="grid w-full max-w-md justify-items-start gap-5">
        <BrandLogo className="h-auto w-[min(70%,14rem)]" alt={t('app.full')} />
        <h1 className="text-3xl font-semibold tracking-tight">{t('auth.title')}</h1>
        <p className="text-muted-foreground">{t('auth.body')}</p>

        <form className="grid w-full gap-4" onSubmit={(e) => void submit(e, false)} noValidate>
          <Field label={t('auth.email')} error={emailError}>
            <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('auth.password')} error={error}>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {notice && (
            <p role="status" className="rounded-xl bg-info-soft p-3 text-sm font-semibold text-info">
              {notice}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || short}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t('auth.signIn')}
            </Button>
            <Button type="button" variant="outline" disabled={busy || short} onClick={(e) => void submit(e, true)}>
              {t('auth.createAccount')}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t('auth.firstTime')}</p>
        </form>

        <Button variant="ghost" size="sm" onClick={() => void setSetting('language', lang === 'en' ? 'ur' : 'en')} lang={lang === 'en' ? 'ur' : 'en'}>
          {lang === 'en' ? 'اردو' : 'English'}
        </Button>
      </div>
    </main>
  )
}
