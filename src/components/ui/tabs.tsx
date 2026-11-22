import * as React from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { useApp } from '@/app/AppContext'
import { cn } from '@/lib/utils'

/** shadcn/ui Tabs (new-york), with the app's 8 px control radius and 44 px targets on phones. */
function Tabs({ className, dir, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const { lang } = useApp() // arrow keys follow the reading direction of the app language
  return <TabsPrimitive.Root data-slot="tabs" dir={dir ?? (lang === 'ur' ? 'rtl' : 'ltr')} className={cn('flex flex-col gap-5', className)} {...props} />
}

/** `size="xs"` is the compact one for settings rows and filters: 28 px tall from tablet up, still 44 px on phones where fingers need the room. */
function TabsList({ className, size = 'default', ...props }: React.ComponentProps<typeof TabsPrimitive.List> & { size?: 'default' | 'xs' }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-size={size}
      className={cn(
        'group/tabs-list inline-flex w-fit items-center justify-center gap-1 rounded-control bg-muted p-1 text-muted-foreground',
        'data-[size=xs]:gap-0.5 data-[size=xs]:p-0.5',
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex h-11 items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-4 text-sm font-semibold whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 sm:h-9',
        'group-data-[size=xs]/tabs-list:gap-1 group-data-[size=xs]/tabs-list:px-3 group-data-[size=xs]/tabs-list:text-[13px] sm:group-data-[size=xs]/tabs-list:h-7',
        'hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />
}

interface ViewTab {
  value: string
  label: React.ReactNode
  disabled?: boolean
  lang?: string
}

/**
 * Tabs that switch what a screen shows (a filter, a scope, a basis) when the content below is the page's own and is not wrapped in
 * TabsContent. Radix always points `aria-controls` at a panel; with no panel that id does not exist, so it is left off here.
 */
function ViewTabs({
  tabs,
  label,
  labelledBy,
  describedBy,
  value,
  onValueChange,
  className,
  size = 'xs',
  fill,
}: {
  tabs: ViewTab[]
  /** `xs` is compact (settings, filters); `default` is the roomy one for a form choice. */
  size?: 'default' | 'xs'
  /** Stretch across the width and share it between the tabs equally (a segmented control). */
  fill?: boolean
  /** The name of the group, as text; or `labelledBy`, the id of a visible label (a settings row). */
  label?: string
  labelledBy?: string
  describedBy?: string
  value: string
  onValueChange: (v: string) => void
  className?: string
}) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={cn('gap-0', className)}>
      <TabsList size={size} aria-label={label} aria-labelledby={labelledBy} aria-describedby={describedBy} className={cn(!fill && 'flex-wrap', fill && 'w-full')}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} disabled={tab.disabled} lang={tab.lang} aria-controls={undefined} className={fill ? 'flex-1' : undefined}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, ViewTabs }
