import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A small picture in a tinted tile, the same one that sits beside a Settings section heading. Decoration: the words next to it say what it is. */
export function IconTile({ icon: Icon, className }: { icon: ElementType; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary', className)}>
      <Icon className="size-[18px]" />
    </span>
  )
}

/** The heading of a card, with its icon. Keep the heading text the same as it was: the icon is only there to help the eye find the card. */
export function CardHeading({ icon, id, className, children }: { icon: ElementType; id?: string; className?: string; children: ReactNode }) {
  return (
    <h2 id={id} className={cn('flex items-center gap-2.5 text-lg font-semibold', className)}>
      <IconTile icon={icon} />
      <span className="min-w-0">{children}</span>
    </h2>
  )
}
