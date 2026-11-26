import { useId, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BrandLogo } from '@/components/Brand'
import { useApp } from '@/app/AppContext'
import { Field } from '@/components/common'
import { ConfirmStatus, PasswordInput, PasswordStrength } from '@/components/PasswordFields'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { checkPassword } from '@/lib/password'
import { cleanInviteCode, isCompleteInviteCode } from '@/lib/invite'
import { useSync } from '@/sync/SyncProvider'
import { supabase } from '@/sync/supabase'

/** The destination of Supabase's password-recovery email. The recovery link creates a short-lived session first. */
export function ResetPassword() {
  const { t } = useApp()
  const { session } = useSync()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const invite = cleanInviteCode(params.get('invite') ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const uid = useId()
  const strengthId = `${uid}-strength`
  const confirmId = `${uid}-confirm`
  const check = checkPassword(password)
  const confirmState = confirm === '' ? 'idle' : confirm === password ? 'match' : confirmTouched || confirm.length >= password.length ? 'mismatch' : 'idle'

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!check.ok) {
      setError(t('auth.passwordWeak'))
      return
    }
    if (!confirm || confirm !== password) {
      setError(!confirm ? t('auth.confirmRequired') : t('auth.confirmMismatch'))
      return
    }
    if (!supabase || !session) {
      setError(t('auth.resetInvalid'))
      return
    }
    setBusy(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) setError(updateError.message)
    else {
      // A recovery link creates a temporary authenticated session. End it after changing the
      // password so password recovery never doubles as a login bypass.
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) setError(signOutError.message)
      else {
        const next = new URLSearchParams({ passwordReset: '1', type: 'signin' })
        if (isCompleteInviteCode(invite)) next.set('invite', invite)
        nav(`/?${next.toString()}`, { replace: true })
      }
    }
    setBusy(false)
  }

  return (
    <main className="relative grid min-h-[calc(100dvh-2*var(--page-gap))] place-items-center auth-bg px-4 py-4 sm:rounded-2xl sm:border max-sm:pt-16">
      <LanguageSwitcher />
      <div className="grid w-full max-w-lg gap-4 rounded-2xl border bg-card p-6 shadow-sm sm:p-7">
        <BrandLogo className="h-auto w-[min(55%,9.5rem)] justify-self-center" alt={t('app.full')} />
        <div className="grid gap-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">{t('auth.newPasswordTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.newPasswordBody')}</p>
        </div>

        {!session ? (
          <div className="grid gap-3">
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{t('auth.resetInvalid')}</p>
            <Button type="button" variant="outline" onClick={() => nav('/?forgot=1', { replace: true })}>{t('auth.sendReset')}</Button>
          </div>
        ) : (
          <form className="grid gap-3" onSubmit={(e) => void submit(e)} noValidate>
            {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p>}
            <Field label={t('auth.password')}>
              <PasswordInput
                autoComplete="new-password"
                describedBy={strengthId}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
              />
            </Field>
            <PasswordStrength id={strengthId} check={check} />
            <div className="grid gap-1.5">
              <Field label={t('auth.confirmPassword')}>
                <PasswordInput
                  autoComplete="new-password"
                  describedBy={confirmId}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError('') }}
                  onBlur={() => setConfirmTouched(true)}
                />
              </Field>
              <ConfirmStatus id={confirmId} state={confirmState} />
            </div>
            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t('auth.savePassword')}
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}
