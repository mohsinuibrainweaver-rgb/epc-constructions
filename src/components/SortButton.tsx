import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { ariaSort, type SortState } from '@/lib/sort'
import { cn } from '@/lib/utils'

/**
 * The button inside a column heading that sorts the table by that column. Put it in the heading cell and give the cell `aria-sort={ariaSort(...)}`:
 * a screen reader then reads "Amount, sorted ascending", and the arrow says the same to the eye. The words stay, so it never relies on the arrow alone.
 * The button fills the cell, so the whole heading is the target.
 */
export function SortButton<K extends string>({
  k,
  sort,
  onSort,
  end,
  children,
  className,
}: {
  k: K
  sort: SortState<K>
  onSort: (key: K) => void
  /** Right-aligned column (an amount). */
  end?: boolean
  children: ReactNode
  className?: string
}) {
  const active = sort?.key === k
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={cn(
        'group/sort -mx-2 inline-flex h-10 w-[calc(100%+1rem)] items-center gap-1.5 px-2 text-start font-[inherit] whitespace-nowrap transition-colors hover:bg-muted',
        end && 'flex-row-reverse text-end',
        className,
      )}
    >
      <span>{children}</span>
      <Icon aria-hidden="true" className={cn('size-3.5 shrink-0 transition-opacity', active ? 'text-primary' : 'text-muted-foreground opacity-0 group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100')} />
    </button>
  )
}

export { ariaSort }
