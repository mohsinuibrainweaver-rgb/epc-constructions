import { useApp } from '@/app/AppContext'
import { Dialog } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { useConflicts } from '@/db/hooks'
import type { Phase } from '@/db/types'
import type { Key } from '@/i18n/en'
import { formatDate, money } from '@/lib/format'
import { diffFields, keepCurrent, restoreMine, type ConflictItem, type FieldDiff } from '@/sync/conflicts'

/**
 * Edits of this device that a newer edit from another phone replaced. For each one the person sees the two versions
 * side by side and either keeps the current one or puts their own back (which then counts as the newest edit).
 */
export function ConflictsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang, phaseName } = useApp()
  const toast = useToast()
  const items = useConflicts()

  const value = (f: FieldDiff, v: unknown): string => {
    if (f.kind === 'state') return t(v ? 'conflict.v.deleted' : 'conflict.v.present')
    if (v === undefined || v === null || v === '') return '—'
    if (f.kind === 'money') return money(Number(v))
    if (f.kind === 'date') return formatDate(String(v), lang)
    if (f.kind === 'status') return t(`status.${String(v)}` as Key)
    if (f.kind === 'mode') return t(`mode.${String(v)}` as Key)
    return String(v)
  }

  const title = ({ conflict, current }: ConflictItem): string => {
    const row = { ...(current ?? {}), ...conflict.mine } as Record<string, unknown>
    const named = conflict.table === 'phases' ? phaseName(row as unknown as Phase) : String(row.purpose ?? row.title ?? row.item ?? row.name ?? '')
    const label = named || (row.amount !== undefined ? money(Number(row.amount)) : '')
    return `${t(`conflict.kind.${conflict.table}` as Key)}${label ? `: ${label}` : ''}`
  }

  const keep = async (id: string) => {
    await keepCurrent(id)
    toast.show({ kind: 'info', message: t('conflict.kept') })
    if (items.length <= 1) onClose()
  }
  const mine = async (item: ConflictItem) => {
    await restoreMine(item.conflict)
    toast.show({ kind: 'success', message: t('conflict.restored') })
    if (items.length <= 1) onClose()
  }

  return (
    <Dialog
      open={open}
      title={t('conflict.title')}
      description={t('conflict.intro')}
      onClose={onClose}
      footer={
        <Button variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <ul className="grid gap-4">
        {items.map((item) => {
          const diff = diffFields(item.conflict.mine, item.current)
          return (
            <li key={item.conflict.id} className="grid gap-3 rounded-xl border bg-card p-3">
              <h3 className="text-sm font-semibold">{title(item)}</h3>
              <dl className="grid gap-2 text-sm">
                {diff.map((f) =>
                  f.kind === 'other' ? (
                    <p key={f.key} className="text-muted-foreground">
                      {t('conflict.other')}
                    </p>
                  ) : (
                    <div key={f.key} className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <dt className="col-span-2 text-xs font-semibold text-muted-foreground">{t(f.label)}</dt>
                      <dd className="min-w-0 rounded-md bg-muted px-2.5 py-1.5">
                        <span className="block text-xs text-muted-foreground">{t('conflict.yours')}</span>
                        <bdi className="break-words">{value(f, f.mine)}</bdi>
                      </dd>
                      <dd className="min-w-0 rounded-md bg-muted px-2.5 py-1.5">
                        <span className="block text-xs text-muted-foreground">{t('conflict.current')}</span>
                        <bdi className="break-words">{value(f, f.current)}</bdi>
                      </dd>
                    </div>
                  ),
                )}
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void keep(item.conflict.id)}>
                  {t('conflict.keep')}
                </Button>
                <Button variant="secondary" onClick={() => void mine(item)}>
                  {t('conflict.useMine')}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}
