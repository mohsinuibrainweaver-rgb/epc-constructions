import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * A tooltip for an icon-only button: it appears when a mouse rests on the button or when the button gets the keyboard focus (never on a
 * tap, where the button simply does its job). The button keeps its own aria-label for screen readers, so the tooltip adds sight, not
 * a second announcement. Use it instead of the `title` attribute, which is slow, unstyled and not shown on focus.
 */
export function Tip({ label, children, side = 'top' }: { label: string; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
