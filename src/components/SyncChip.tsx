import { Link } from 'react-router-dom'
import { Cloud, CloudAlert, CloudOff, RefreshCw, type LucideIcon } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useSync } from '@/sync/SyncProvider'

type Variant = 'neutral' | 'info' | 'warning' | 'danger'

// On the dark sidebar every state sits on the raised sidebar fill with its own light status colour (checked in scripts/contrast-test.ts).
const SIDEBAR_TEXT: Record<Variant, string> = {
  neutral: 'text-sidebar-foreground',
  info: 'text-sidebar-info',
  warning: 'text-sidebar-warning',
  danger: 'text-sidebar-danger',
}

/**
 * Whole-app sync state: synced, syncing, waiting changes, offline or a problem. Hidden when sync is not set up.
 * `tone="sidebar"` is for the dark sidebar; `compact` shows only the icon below the wide-sidebar breakpoint (the word stays for screen readers).
 */
export function SyncChip({ tone = 'default', compact = false }: { tone?: 'default' | 'sidebar'; compact?: boolean }) {
  const { t } = useApp()
  const { configured, session, status } = useSync()
  if (!configured || !session) return null

  const { state, pending } = status
  let Icon: LucideIcon = Cloud
  let variant: Variant = 'neutral'
  let label = t('sync.chip.synced')
  let spin = false
  let link = false
  if (state === 'error') {
    Icon = CloudAlert
    variant = 'danger'
    label = t('sync.chip.problem')
    link = true
  } else if (state === 'offline') {
    Icon = CloudOff
    variant = 'warning'
    label = pending > 0 ? t('sync.chip.offlineWaiting', { count: pending }) : t('pwa.offline')
  } else if (state === 'syncing') {
    Icon = RefreshCw
    variant = 'info'
    label = t('sync.chip.syncing')
    spin = true
  } else if (pending > 0) {
    variant = 'warning'
    label = t('sync.chip.waiting', { count: pending })
  }

  const side = tone === 'sidebar'
  const className = side
    ? cn(
        'min-h-6 min-w-0 shrink border-sidebar-foreground/25 bg-sidebar-accent px-2 py-0 text-[0.6875rem] leading-none',
        SIDEBAR_TEXT[variant],
        compact && 'size-7 justify-center p-0 lg:size-auto lg:min-h-6 lg:px-2',
        link && 'hover:border-sidebar-foreground/60',
      )
    : undefined
  const body = (
    <>
      <Icon aria-hidden="true" className={cn(spin && 'motion-safe:animate-spin', side && compact && 'max-lg:size-3.5')} />
      <span className={cn(side && compact && 'sr-only lg:not-sr-only lg:truncate')}>{label}</span>
    </>
  )

  if (link)
    return (
      <Badge variant={variant} asChild className={className}>
        <Link to="/settings" title={side && compact ? label : undefined}>
          {body}
        </Link>
      </Badge>
    )
  return (
    <Badge variant={variant} role="status" className={className} title={side && compact ? label : undefined}>
      {body}
    </Badge>
  )
}
