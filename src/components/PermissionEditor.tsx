import { ShieldCheck } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Switch } from '@/components/ui/switch'
import { PERMISSIONS, type Action, type PermissionMap } from '@/lib/permissions'
import type { Key } from '@/i18n/en'

const GROUPS = ['access', 'payments', 'project', 'money', 'people'] as const

export function PermissionEditor({ values, onChange, disabled, compact = false, neutral = false, mobileDense = false }: {
  values: PermissionMap
  onChange: (permission: Action, enabled: boolean) => void
  disabled?: boolean | Action
  compact?: boolean
  neutral?: boolean
  mobileDense?: boolean
}) {
  const { t } = useApp()
  return (
    <div className={compact ? 'grid' : mobileDense ? 'grid gap-3 sm:gap-4' : 'grid gap-4'}>
      {GROUPS.map((group) => (
        <section key={group} className={compact ? 'border-b last:border-b-0' : 'rounded-control border bg-card'}>
          <h3 className={`flex items-center gap-2 border-b text-sm font-semibold ${compact ? 'py-3' : mobileDense ? 'px-3 py-2.5 sm:px-4 sm:py-3' : 'px-4 py-3'}`}>
            <ShieldCheck aria-hidden="true" className={`size-4 ${neutral ? 'text-muted-foreground' : 'text-primary'}`} />
            {t(`perm.group.${group}` as Key)}
          </h3>
          <div className={`divide-y ${compact ? '' : mobileDense ? 'px-3 sm:px-4' : 'px-4'}`}>
            {PERMISSIONS.filter((p) => p.group === group).map((permission) => (
              <label key={permission.key} className={`flex cursor-pointer items-center gap-3 ${mobileDense ? 'py-2 sm:py-2.5' : 'py-2.5'}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{t(`perm.${permission.key}.label` as Key)}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{t(`perm.${permission.key}.desc` as Key)}</span>
                </span>
                <Switch checked={values[permission.key] === true} disabled={disabled === true || disabled === permission.key}
                  onCheckedChange={(checked) => onChange(permission.key, checked)} aria-label={t(`perm.${permission.key}.label` as Key)} />
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
