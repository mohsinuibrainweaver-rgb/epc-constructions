import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { BrandLogo } from '@/components/Brand'
import { useApp } from '@/app/AppContext'
import { Field, GroupField } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { setSetting } from '@/db/actions'
import type { Role } from '@/db/types'
import { supabase } from '@/sync/supabase'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 6

/**
 * Email and password. Each person creates their own account once, then signs in on every phone.
 * Creating an account also asks for the name shown next to the payments they add and their role (who approves entries): those
 * two are kept on this device and in the account, so a second phone can pick them up.
 */
export function SignIn() {
  const { t, lang } = useApp()
  const [mode, setMode] = useState<'signin' | 'create'>('signin')
  const create = mode === 'create'
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('investor')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({})
  const [notice, setNotice] = useState('')

  const switchMode = (m: string) => {
    setMode(m as 'signin' | 'create')
    setErrors({})
    setNotice('')
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    setNotice('')
    const next: typeof errors = {}
    if (create && !name.trim()) next.name = t('auth.nameRequired')
    if (!EMAIL.test(email.trim())) next.email = t('auth.invalidEmail')
    if (password.length < MIN_PASSWORD) next.password = t('auth.passwordShort')
    setErrors(next)
    if (Object.keys(next).length > 0 || !supabase) return

    setBusy(true)
    const creds = { email: email.trim(), password }
    if (create) {
      const { data, error } = await supabase.auth.signUp({ ...creds, options: { data: { name: name.trim(), role } } })
      if (error) setErrors({ password: error.message })
      // With "Confirm email" on, an email that already has an account comes back without an error and with no identities.
      else if (data.user && data.user.identities?.length === 0) setErrors({ email: t('auth.exists') })
      else {
        // Kept on this device straight away, so it is there when the first session starts (even after the emailed link).
        await setSetting('userName', name.trim())
        await setSetting('role', role)
        // With "Confirm email" on, no session comes back until the emailed link is used.
        if (!data.session) setNotice(t('auth.confirmEmail'))
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword(creds)
      if (error) setErrors({ password: /invalid login/i.test(error.message) ? t('auth.wrongLogin') : error.message })
    }
    setBusy(false)
  }

  return (
    <main className="grid min-h-[calc(100dvh-2*var(--page-gap))] place-items-center rounded-2xl border bg-card px-4 py-8">
      <div className="grid w-full max-w-md justify-items-start gap-5">
        <BrandLogo className="h-auto w-[min(70%,14rem)]" alt={t('app.full')} />
        <PillRadioGroup aria-label={t('auth.mode')} value={mode} onValueChange={switchMode}>
          <PillRadioItem value="signin">{t('auth.signIn')}</PillRadioItem>
          <PillRadioItem value="create">{t('auth.createAccount')}</PillRadioItem>
        </PillRadioGroup>
        <div className="grid gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{create ? t('auth.createTitle') : t('auth.title')}</h1>
          <p className="text-muted-foreground">{create ? t('auth.createBody') : t('auth.body')}</p>
        </div>

        <form className="grid w-full gap-4" onSubmit={(e) => void submit(e)} noValidate>
          {create && (
            <Field label={t('set.name')} hint={t('set.nameHelp')} error={errors.name}>
              <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          <Field label={t('auth.email')} error={errors.email}>
            <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('auth.password')} hint={create ? t('auth.passwordHint') : undefined} error={errors.password}>
            <div className="relative">
              <Input
                type={show ? 'text' : 'password'}
                autoComplete={create ? 'new-password' : 'current-password'}
                className="pe-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute inset-y-0 end-0"
                aria-label={show ? t('auth.hide') : t('auth.show')}
                aria-pressed={show}
                onClick={() => setShow((v) => !v)}
              >
                {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            </div>
          </Field>
          {create && (
            <GroupField label={t('set.role')}>
              {(labelId) => (
                <>
                  <PillRadioGroup aria-labelledby={labelId} value={role} onValueChange={(v) => setRole(v as Role)}>
                    <PillRadioItem value="investor">{t('set.roleInvestor')}</PillRadioItem>
                    <PillRadioItem value="builder">{t('set.roleBuilder')}</PillRadioItem>
                  </PillRadioGroup>
                  <p className="text-sm text-muted-foreground">{t('auth.roleHelp')}</p>
                </>
              )}
            </GroupField>
          )}
          {notice && (
            <p role="status" className="rounded-xl bg-info-soft p-3 text-sm font-semibold text-info">
              {notice}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy} className="w-full sm:w-fit">
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {create ? t('auth.createAccount') : t('auth.signIn')}
          </Button>
        </form>

        <Button variant="ghost" size="sm" onClick={() => void setSetting('language', lang === 'en' ? 'ur' : 'en')} lang={lang === 'en' ? 'ur' : 'en'}>
          {lang === 'en' ? 'اردو' : 'English'}
        </Button>
      </div>
    </main>
  )
}
