import { useEffect, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { MIN_PASSWORD, changePassword, type PasswordResult } from '@/auth/account'
import { supabase } from '@/sync/supabase'

/** Change the password: current one first (to prove it is you), then the new one twice. */
export function PasswordDialog({ open, email, onClose }: { open: boolean; email: string; onClose: () => void }) {
  const { t } = useApp()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [show, setShow] = useState(false)
  const [result, setResult] = useState<PasswordResult>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setCurrent('')
    setNext('')
    setRepeat('')
    setShow(false)
    setResult(undefined)
    setBusy(false)
  }, [open])

  const submit = async () => {
    if (!supabase || busy) return
    setBusy(true)
    const r = await changePassword(supabase, email, current, next, repeat)
    setBusy(false)
    setResult(r)
    if (r === 'ok') {
      toast.show({ kind: 'success', message: t('set.pw.done') })
      onClose()
    } else if (r === 'failed') {
      toast.show({ kind: 'error', message: t('set.pw.failed') })
    } else {
      requestAnimationFrame(() => (document.querySelector('[role=dialog] [aria-invalid="true"]') as HTMLElement | null)?.focus())
    }
  }

  const type = show ? 'text' : 'password'
  const err = (...r: PasswordResult[]) => (result && r.includes(result) ? t(`set.pw.err.${result}` as 'set.pw.err.tooShort', { min: MIN_PASSWORD }) : undefined)

  return (
    <Dialog
      open={open}
      title={t('set.pw.title')}
      description={t('set.pw.intro')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={busy || !current || !next || !repeat} onClick={() => void submit()}>
            {t('set.pw.save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label={t('set.pw.current')} error={err('wrongCurrent')}>
          <Input type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={t('set.pw.new')} hint={t('set.pw.hint', { min: MIN_PASSWORD })} error={err('tooShort', 'weak', 'same')}>
          <Input type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t('set.pw.repeat')} error={err('mismatch')}>
          <Input type={type} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </Field>
        <label className="flex items-center gap-3">
          <Checkbox checked={show} onCheckedChange={(c) => setShow(c === true)} />
          <span>{t('set.pw.show')}</span>
        </label>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}
