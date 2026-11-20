import { useEffect, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { SettingRow, SettingsSection } from '@/components/settings'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Dropdown } from '@/components/ui/dropdown'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { Switch } from '@/components/ui/switch'
import type { Key } from '@/i18n/en'
import { loadDevicePrefs, saveDevicePrefs, type DevicePrefs } from '@/push/push'
import { PUSH_PRESETS, PUSH_PRESET_IDS, PUSH_TYPES, countOn, hourLabel, presetOf, reminderHours, type PushPrefs, type PushType } from '@/push/prefs'

/**
 * What this device is told about: a quick setup (three presets), the hour of the daily reminder, and one switch
 * per type. Choices apply at once and belong to this device (they are saved on its row in push_subscriptions).
 */
export function PushPrefsSections() {
  const { t, lang } = useApp()
  const toast = useToast()
  const [dev, setDev] = useState<DevicePrefs>()

  const load = () => void loadDevicePrefs().then(setDev)
  useEffect(load, [])

  if (!dev) return null
  if (dev.state !== 'ok') {
    return (
      <SettingsSection title={t('push.prefs.title')}>
        <SettingRow
          label={t('push.prefs.unavailable')}
          help={t(dev.state === 'oldSchema' ? 'push.prefs.oldSchema' : 'push.prefs.error')}
          control={
            dev.state === 'error' ? (
              <Button variant="outline" onClick={load}>
                {t('common.retry')}
              </Button>
            ) : undefined
          }
        />
      </SettingsSection>
    )
  }

  const { prefs, hour } = dev
  const apply = async (change: { prefs?: PushPrefs; hour?: number }) => {
    const before = dev
    setDev({ ...dev, ...(change.prefs ? { prefs: change.prefs } : {}), ...(change.hour !== undefined ? { hour: change.hour } : {}) })
    const ok = await saveDevicePrefs(change)
    if (ok) toast.show({ kind: 'success', message: t('push.prefs.saved') })
    else {
      setDev(before)
      toast.show({ kind: 'error', message: t('push.prefs.saveFail') })
    }
  }

  const preset = presetOf(prefs)

  return (
    <>
      <SettingsSection title={t('push.quick.title')} description={t('push.quick.desc')}>
        <SettingRow
          label={t('push.quick.label')}
          help={t(`push.preset.${preset}.help` as Key)}
          control={(a) => (
            <PillRadioGroup
              aria-labelledby={a.labelId}
              aria-describedby={a.describedBy}
              value={preset === 'custom' ? '' : preset}
              onValueChange={(v) => void apply({ prefs: { ...PUSH_PRESETS[v as keyof typeof PUSH_PRESETS] } })}
            >
              {PUSH_PRESET_IDS.map((id) => (
                <PillRadioItem key={id} value={id}>
                  {t(`push.preset.${id}` as Key)}
                </PillRadioItem>
              ))}
            </PillRadioGroup>
          )}
        />
        <SettingRow
          label={t('push.hour.label')}
          help={t('push.hour.help')}
          control={(a) => (
            <Dropdown id={a.id} aria-describedby={a.describedBy} value={hour} onChange={(e) => void apply({ hour: Number(e.target.value) })}>
              {reminderHours(hour).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h, lang)}
                </option>
              ))}
            </Dropdown>
          )}
        />
      </SettingsSection>

      <SettingsSection title={t('push.types.title')} description={t('push.types.desc', { on: countOn(prefs), total: PUSH_TYPES.length })}>
        {PUSH_TYPES.map((type) => (
          <TypeRow key={type} type={type} on={prefs[type]} onChange={(v) => void apply({ prefs: { ...prefs, [type]: v } })} />
        ))}
      </SettingsSection>
    </>
  )
}

function TypeRow({ type, on, onChange }: { type: PushType; on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useApp()
  return (
    <SettingRow
      inline
      label={t(`push.type.${type}` as Key)}
      help={t(`push.type.${type}.help` as Key)}
      control={(a) => (
        <Switch
          id={a.id}
          checked={on}
          onCheckedChange={onChange}
          aria-describedby={a.describedBy}
          className="relative before:absolute before:-inset-x-3 before:-inset-y-4 before:content-['']"
        />
      )}
    />
  )
}
