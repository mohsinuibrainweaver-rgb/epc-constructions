import { useId, useRef, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BrandLogo } from '@/components/Brand'
import { useApp } from '@/app/AppContext'
import { Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ConfirmStatus, PasswordInput, PasswordStrength } from '@/components/PasswordFields'
import { checkPassword } from '@/lib/password'
import { cleanInviteCode, inviteJoinLink, isCompleteInviteCode } from '@/lib/invite'
import { supabase } from '@/sync/supabase'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 6

/**
 * Email and password. Each person creates their own account once, then signs in on every phone.
 * Creating an account also asks for the name shown next to the payments they add and their role (who approves entries): those
 * two are kept on this device and in the account, so a second phone can pick them up.
 */
export function SignIn() {
  const { t } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const invite = cleanInviteCode(params.get('invite') ?? '')
  const invited = isCompleteInviteCode(invite)
  const [mode, setMode] = useState<'signin' | 'create'>(() => invited ? 'create' : 'signin')
  const [forgot, setForgot] = useState(() => params.get('forgot') === '1')
  const create = mode === 'create'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ form?: string; name?: string; email?: string; password?: string; confirm?: string }>({})
  const [notice, setNotice] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const uid = useId()
  const strengthId = `${uid}-strength`
  const confirmStatusId = `${uid}-confirm-status`
  const check = checkPassword(password)
  // Say "do not match" only when the person has typed as much as the password, or has left the field; a half-typed confirmation is not an error yet.
  const confirmState: 'idle' | 'match' | 'mismatch' =
    confirm === '' ? 'idle' : confirm === password ? 'match' : confirmTouched || confirm.length >= password.length ? 'mismatch' : 'idle'

  const switchMode = (m: string) => {
    setMode(m as 'signin' | 'create')
    setForgot(false)
    setConfirm('')
    setConfirmTouched(false)
    setErrors({})
    setNotice('')
  }

  const sendReset = async (ev: FormEvent) => {
    ev.preventDefault()
    setNotice('')
    const address = email.trim()
    if (!EMAIL.test(address)) {
      setErrors({ email: t('auth.invalidEmail') })
      return
    }
    if (!supabase) return
    setBusy(true)
    const target = new URL('/reset-password', window.location.origin)
    if (invited) target.searchParams.set('invite', invite)
    const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: target.toString() })
    if (error) setErrors({ form: error.message })
    else {
      setErrors({})
      // This deliberately does not reveal whether an email is registered.
      setNotice(t('auth.resetSent'))
    }
    setBusy(false)
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    setNotice('')
    const next: typeof errors = {}
    if (create && !name.trim()) next.name = t('auth.nameRequired')
    if (!EMAIL.test(email.trim())) next.email = t('auth.invalidEmail')
    if (create) {
      if (!check.ok) next.password = t('auth.passwordWeak')
      if (!confirm) next.confirm = t('auth.confirmRequired')
      else if (confirm !== password) next.confirm = t('auth.confirmMismatch')
    } else if (password.length < MIN_PASSWORD) next.password = t('auth.passwordShort')
    setErrors(next)
    if (Object.keys(next).length > 0) {
      // Move focus to the first field that needs attention, so a keyboard or screen-reader user lands on it.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    if (!supabase) return

    setBusy(true)
    const creds = { email: email.trim(), password }
    if (create) {
      if (invited) {
        const { data: validInvite, error: inviteError } = await supabase.rpc('signup_invite_is_valid', { p_code: invite })
        if (inviteError || validInvite !== true) {
          setErrors({ form: t('auth.inviteInvalid') })
          setBusy(false)
          return
        }
      }
      const { data, error } = await supabase.auth.signUp({
        ...creds,
        options: {
          data: { name: name.trim(), ...(invited ? { invite_code: invite } : {}) },
          ...(invited ? { emailRedirectTo: inviteJoinLink(window.location.origin, invite, true) } : {}),
        },
      })
      if (error) {
        // The database trigger is the final, atomic guard. The invite can become unavailable between the pre-check and signup.
        if (invited) {
          const { data: stillValid } = await supabase.rpc('signup_invite_is_valid', { p_code: invite })
          setErrors(stillValid === false ? { form: t('auth.inviteInvalid') } : { password: error.message })
        } else setErrors({ password: error.message })
      }
      // With "Confirm email" on, an email that already has an account comes back without an error and with no identities.
      else if (data.user && data.user.identities?.length === 0) setErrors({ email: t('auth.exists') })
      else {
        // With "Confirm email" on, no session comes back until the emailed link is used.
        if (!data.session) setNotice(t('auth.confirmEmail'))
        else if (invited) {
          const next = new URLSearchParams({ invite, accept: 'auto' })
          nav(`/join?${next.toString()}`, { replace: true })
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword(creds)
      if (error) setErrors({ password: /invalid login/i.test(error.message) ? t('auth.wrongLogin') : error.message })
      else if (invited) {
        const next = new URLSearchParams({ invite, accept: 'auto' })
        nav(`/join?${next.toString()}`, { replace: true })
      }
    }
    setBusy(false)
  }

  return (
    <main className="relative grid min-h-[calc(100dvh-2*var(--page-gap))] place-items-center auth-bg px-4 py-4 sm:rounded-2xl sm:border max-sm:pt-16">
      <LanguageSwitcher />
      <div className="grid w-full max-w-lg justify-items-start gap-4 rounded-2xl border bg-card p-6 shadow-sm sm:p-7">
        <BrandLogo className="h-auto w-[min(55%,9.5rem)] justify-self-center" alt={t('app.full')} />
        {forgot ? (
          <section className="grid w-full gap-4">
            <div className="grid gap-1.5">
              <h1 className="text-3xl font-semibold tracking-tight">{t('auth.forgotTitle')}</h1>
              <p className="text-sm text-muted-foreground">{t('auth.forgotBody')}</p>
            </div>
            <form className="grid gap-3" onSubmit={(e) => void sendReset(e)} noValidate>
              {errors.form && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{errors.form}</p>}
              <Field label={t('auth.email')} error={errors.email}>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (errors.email) setErrors((x) => ({ ...x, email: undefined }))
                  }}
                />
              </Field>
              {notice && <p role="status" className="rounded-xl bg-info-soft p-3 text-sm font-semibold text-info">{notice}</p>}
              <Button type="submit" size="lg" disabled={busy} className="w-full">
                {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                {t('auth.sendReset')}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { setForgot(false); setErrors({}); setNotice('') }}>
                {t('auth.backToSignIn')}
              </Button>
            </form>
          </section>
        ) : (
        <Tabs value={mode} onValueChange={switchMode} className="w-full gap-4">
          <TabsList aria-label={t('auth.mode')} className="w-full">
            <TabsTrigger value="signin" className="flex-1 px-2 sm:px-4">{t('auth.signIn')}</TabsTrigger>
            <TabsTrigger value="create" className="flex-1 px-2 sm:px-4">{t('auth.createAccount')}</TabsTrigger>
          </TabsList>
          <TabsContent value={mode} className="grid gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{create ? t('auth.createTitle') : t('auth.title')}</h1>

        <form ref={formRef} className="grid w-full gap-3" onSubmit={(e) => void submit(e)} noValidate>
          {errors.form && (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              {errors.form}
            </p>
          )}
          {create && (
            <Field label={t('set.name')} error={errors.name}>
              <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          <Field label={t('auth.email')} error={errors.email}>
            <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('auth.password')} error={errors.password}>
            <PasswordInput
              autoComplete={create ? 'new-password' : 'current-password'}
              describedBy={create ? strengthId : undefined}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (errors.password) setErrors((x) => ({ ...x, password: undefined }))
              }}
            />
          </Field>
          {!create && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto w-fit justify-self-end px-0 py-0"
              onClick={() => { setForgot(true); setErrors({}); setNotice('') }}
            >
              {t('auth.forgot')}
            </Button>
          )}
          {create && <PasswordStrength id={strengthId} check={check} />}
          {create && (
            <div className="grid gap-1.5">
              <Field label={t('auth.confirmPassword')} error={errors.confirm}>
                <PasswordInput
                  autoComplete="new-password"
                  describedBy={confirmStatusId}
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value)
                    if (errors.confirm) setErrors((x) => ({ ...x, confirm: undefined }))
                  }}
                  onBlur={() => setConfirmTouched(true)}
                />
              </Field>
              <ConfirmStatus id={confirmStatusId} state={errors.confirm ? 'idle' : confirmState} />
            </div>
          )}
          {notice && (
            <p role="status" className="rounded-xl bg-info-soft p-3 text-sm font-semibold text-info">
              {notice}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy} className="w-full">
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {create ? t('auth.createAccount') : t('auth.signIn')}
          </Button>
        </form>
          </TabsContent>
        </Tabs>
        )}
      </div>
    </main>
  )
}
