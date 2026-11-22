import { useCallback, useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { PushPrefsSections } from '@/components/PushPrefs'
import { SettingRow, SettingsSection } from '@/components/settings'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { currentSubscription, disablePush, enablePush, notifPermission, pushSupported, sendTestPush } from '@/push/push'
import { isIos, isStandalone } from '@/pwa/install'
import { useSync } from '@/sync/SyncProvider'

/** Lock-screen reminders for this device: turn on or off, and send a test. */
export function PushSettings() {
  const { t, lang } = useApp()
  const toast = useToast()
  const sync = useSync()
  const [on, setOn] = useState<boolean>()
  const [busy, setBusy] = useState(false)
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(notifPermission)
  const supported = pushSupported()

  const refresh = useCallback(async () => {
    setOn(Boolean(await currentSubscription().catch(() => null)))
    setPerm(notifPermission())
  }, [])
  useEffect(() => {
    if (supported) void refresh()
  }, [supported, refresh])

  const enable = async () => {
    setBusy(true)
    const r = await enablePush(lang)
    setBusy(false)
    await refresh()
    if (r === 'ok') toast.show({ kind: 'success', message: t('push.onDone') })
    else if (r !== 'denied') toast.show({ kind: 'error', message: t('push.error') })
  }
  const disable = async () => {
    setBusy(true)
    await disablePush()
    setBusy(false)
    await refresh()
    toast.show({ kind: 'info', message: t('push.offDone') })
  }
  const test = async () => {
    setBusy(true)
    const ok = await sendTestPush()
    setBusy(false)
    toast.show({ kind: ok ? 'success' : 'error', message: t(ok ? 'push.testSent' : 'push.testFail') })
  }

  const label = t('push.row.title')
  let rows: React.ReactNode
  if (!sync.configured || !sync.session) rows = <SettingRow label={label} help={t('push.signIn')} />
  else if (!supported)
    rows = (
      <SettingRow
        label={label}
        help={isIos() && !isStandalone() ? t('push.iosInstall') : import.meta.env.PROD ? t('set.notifUnsupported') : t('push.devOnly')}
      />
    )
  else if (perm === 'denied') rows = <SettingRow label={label} help={t('set.notifDenied')} />
  else if (on)
    rows = (
      <>
        <SettingRow
          label={label}
          help={<span className="font-semibold text-success">{t('push.enabled')}</span>}
          control={
            <Button variant="outline" disabled={busy} onClick={() => void disable()}>
              {t('push.disable')}
            </Button>
          }
        />
        <SettingRow
          label={t('push.test')}
          help={t('push.row.testHelp')}
          control={
            <Button variant="outline" disabled={busy} onClick={() => void test()}>
              {t('push.test')}
            </Button>
          }
        />
      </>
    )
  else
    rows = (
      <SettingRow
        label={label}
        help={t('push.row.offHelp')}
        control={
          <Button variant="secondary" disabled={busy || on === undefined} onClick={() => void enable()}>
            {t('push.enable')}
          </Button>
        }
      />
    )

  const active = Boolean(sync.configured && sync.session && supported && perm !== 'denied' && on)

  return (
    <>
      <SettingsSection title={t('push.thisDevice')} icon={Smartphone} description={t('push.intro')}>
        {rows}
      </SettingsSection>
      {active && <PushPrefsSections />}
      <p className="text-sm text-muted-foreground">{t('set.notifNote')}</p>
    </>
  )
}
