import { useApp } from '@/app/AppContext'
import { SettingRow, SettingsSection } from '@/components/settings'
import { ViewTabs } from '@/components/ui/tabs'
import { setSetting } from '@/db/actions'
import type { Key } from '@/i18n/en'
import { formatDate, formatMoney, formatTime, weekdayName } from '@/lib/format'
import { CLOCKS, CURRENCIES, DATE_STYLES, GROUPINGS, WEEK_STARTS, groupNumber, regionFrom, type Region } from '@/lib/region'

/** A moment to show examples with: 15 November 2026, 9:05 in the morning. */
const SAMPLE_DAY = '2026-11-15'
const SAMPLE_TIME = new Date(2026, 10, 15, 9, 5)
const SAMPLE_AMOUNT = 1300000

/**
 * Region and format (Settings, Preferences): which day the week starts on, how times, dates, numbers and money are
 * written. They belong to this device; the defaults are how the app always looked. Each choice shows an example.
 */
export function RegionSettings() {
  const { t, lang, settings } = useApp()
  const region = regionFrom(settings.region)
  const choose = <K extends keyof Region>(key: K, value: Region[K]) => void setSetting('region', { ...region, [key]: value })
  const deviceZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    } catch {
      return ''
    }
  })()

  return (
    <>
      <SettingsSection title={t('set.region.dt.title')} description={t('set.region.dt.desc')}>
        <SettingRow
          label={t('set.region.week')}
          help={t('set.region.weekHelp')}
          control={(a) => (
            <ViewTabs
              labelledBy={a.labelId}
              describedBy={a.describedBy}
              value={String(region.weekStart)}
              onValueChange={(v) => choose('weekStart', Number(v) as Region['weekStart'])}
              tabs={WEEK_STARTS.map((d) => ({ value: String(d), label: weekdayName(d, lang) }))}
            />
          )}
        />
        <SettingRow
          label={t('set.region.clock')}
          help={t('set.region.example', { example: formatTime(SAMPLE_TIME, lang, region.clock) })}
          control={(a) => (
            <ViewTabs
              labelledBy={a.labelId}
              describedBy={a.describedBy}
              value={region.clock}
              onValueChange={(v) => choose('clock', v as Region['clock'])}
              tabs={CLOCKS.map((c) => ({ value: c, label: t(`set.region.clock.${c}` as Key) }))}
            />
          )}
        />
        <SettingRow
          label={t('set.region.date')}
          help={t('set.region.example', { example: formatDate(SAMPLE_DAY, lang, region.dateStyle) })}
          control={(a) => (
            <ViewTabs
              labelledBy={a.labelId}
              describedBy={a.describedBy}
              value={region.dateStyle}
              onValueChange={(v) => choose('dateStyle', v as Region['dateStyle'])}
              tabs={DATE_STYLES.map((s) => ({ value: s, label: <bdi>{formatDate(SAMPLE_DAY, lang, s)}</bdi> }))}
            />
          )}
        />
        <SettingRow
          label={t('set.region.zone')}
          help={t('set.region.zoneHelp', { zone: deviceZone || '—' })}
          control={<span className="font-semibold">{t('set.region.zoneValue')}</span>}
        />
      </SettingsSection>

      <SettingsSection title={t('set.region.num.title')} description={t('set.region.num.desc')}>
        <SettingRow
          label={t('set.region.grouping')}
          help={t('set.region.groupingHelp')}
          control={(a) => (
            <ViewTabs
              labelledBy={a.labelId}
              describedBy={a.describedBy}
              value={region.grouping}
              onValueChange={(v) => choose('grouping', v as Region['grouping'])}
              tabs={GROUPINGS.map((g) => ({ value: g, label: <bdi className="tabular">{groupNumber(SAMPLE_AMOUNT, g)}</bdi> }))}
            />
          )}
        />
        <SettingRow
          label={t('set.region.currency')}
          help={t('set.region.currencyHelp', { example: formatMoney(SAMPLE_AMOUNT, region) })}
          control={(a) => (
            <ViewTabs
              labelledBy={a.labelId}
              describedBy={a.describedBy}
              value={region.currency}
              onValueChange={(v) => choose('currency', v as Region['currency'])}
              tabs={CURRENCIES.map((c) => ({ value: c, lang: c === 'روپے' ? 'ur' : undefined, label: c === 'auto' ? t('set.region.currency.auto') : c }))}
            />
          )}
        />
      </SettingsSection>
      <p className="text-sm text-muted-foreground">{t('set.region.note')}</p>
    </>
  )
}
