import { Globe } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Dropdown } from '@/components/ui/dropdown'
import { setSetting } from '@/db/actions'
import type { Lang } from '@/db/types'
import { cn } from '@/lib/utils'

/**
 * Language drop-down with a globe icon. Each language is written in its own script so a person who cannot read the current one can
 * still find theirs. Used in Settings, where the row supplies the ids that tie it to its label and help.
 */
export function LanguageSelect({ id, labelId, describedBy, className, compact }: { id?: string; labelId?: string; describedBy?: string; className?: string; compact?: boolean }) {
  const { lang, t } = useApp()
  return (
    <div className={cn('relative w-full sm:w-44', className)}>
      <Globe aria-hidden="true" className={cn('pointer-events-none absolute top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground', compact ? 'inset-s-2.5' : 'inset-s-3')} />
      <Dropdown
        id={id}
        aria-label={labelId ? undefined : t('set.language')}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        size="sm"
        className={cn('max-sm:h-11', compact ? 'h-8 gap-1 ps-8 pe-2 max-sm:w-auto max-sm:min-w-28' : 'ps-9')}
        value={lang}
        onChange={(e) => void setSetting('language', e.target.value as Lang)}
      >
        <option value="en">English</option>
        <option value="ur">اردو</option>
      </Dropdown>
    </div>
  )
}

/** The same drop-down pinned to the top right corner (in both languages) of a `relative` parent: sign in and welcome. */
export function LanguageSwitcher() {
  return (
    <div className="absolute right-3 top-3">
      <LanguageSelect className="sm:w-32" compact />
    </div>
  )
}
