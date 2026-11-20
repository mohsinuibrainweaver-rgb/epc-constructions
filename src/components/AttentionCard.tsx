import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Info, TriangleAlert } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { AttentionItem } from '@/lib/attention'

/** How many rows show before "Show more": the most important ones, since the list is ordered danger, warning, tidy-up. */
const VISIBLE = 3

/**
 * Home: the things worth a look, each one line that opens the screen where it is fixed. Budgets over their limit and
 * contracts paid beyond what was agreed come first, then the tidy-up items (no vendor, no bank details, no receipt photo).
 * Every row has an icon and words, so it reads without colour. Long lists show the first rows and a "Show more" button, so
 * the card never pushes the due payments far down a phone. Nothing is rendered when there is nothing to list.
 */
export function AttentionCard({ items }: { items: AttentionItem[] }) {
  const { t } = useApp()
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  const shown = open ? items : items.slice(0, VISIBLE)
  const hidden = items.length - VISIBLE
  return (
    <Card className="gap-0 overflow-hidden py-0" aria-labelledby="attn-title">
      <h2 id="attn-title" className="p-4 text-lg font-semibold">
        {t('attn.title')} ({items.length})
      </h2>
      <ul id="attn-list" className="divide-y border-t">
        {shown.map((a) => (
          <li key={a.id}>
            <Link to={a.to} className="flex min-h-11 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent">
              <Badge variant={a.tone === 'info' ? 'neutral' : a.tone}>
                {a.tone === 'info' ? <Info aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
              </Badge>
              <span className="min-w-0 flex-1 text-sm font-medium">{t(a.key, a.vars)}</span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" />
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="attn-list"
          onClick={() => setOpen((o) => !o)}
          className="min-h-11 w-full border-t px-4 py-3 text-start text-sm font-semibold text-primary transition-colors hover:bg-accent"
        >
          {open ? t('attn.less') : t('attn.more', { count: hidden })}
        </button>
      )}
    </Card>
  )
}
