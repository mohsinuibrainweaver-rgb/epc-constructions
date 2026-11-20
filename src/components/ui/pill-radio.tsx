import * as React from 'react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

/** A row of pill-shaped options that behaves as one radio group (arrow keys move, one tab stop). */
function PillRadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn('flex flex-wrap gap-2', className)} {...props} />
}

function PillRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-control border border-input bg-background px-4 text-sm font-semibold',
        'transition-colors duration-150 hover:bg-accent',
        'data-[state=checked]:border-primary data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </RadioGroupPrimitive.Item>
  )
}

export { PillRadioGroup, PillRadioItem }
