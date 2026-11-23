import * as React from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { useApp } from '@/app/AppContext'
import { cn } from '@/lib/utils'

/** shadcn/ui Tabs (new-york), with the app's 8 px control radius and 44 px targets on phones. */
function Tabs({ className, dir, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const { lang } = useApp() // arrow keys follow the reading direction of the app language
  return <TabsPrimitive.Root data-slot="tabs" dir={dir ?? (lang === 'ur' ? 'rtl' : 'ltr')} className={cn('flex flex-col gap-5', className)} {...props} />
}

/**
 * Where the active tab is, inside its list, so one highlight can glide to it instead of each tab flipping its own background.
 * Measured before the browser paints (no flash), and again whenever the list resizes, the tabs wrap, or another tab becomes active.
 * `ready` stays false for the first measurement so the highlight appears in place and does not slide in from the corner.
 */
function useActiveBox(listRef: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [ready, setReady] = React.useState(false)
  React.useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
      if (!active || active.offsetWidth === 0) return setBox(null)
      setBox((b) => (b && b.x === active.offsetLeft && b.y === active.offsetTop && b.w === active.offsetWidth && b.h === active.offsetHeight ? b : { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight }))
    }
    measure()
    const frame = requestAnimationFrame(() => setReady(true))
    const resize = new ResizeObserver(measure)
    resize.observe(list)
    list.querySelectorAll('[role="tab"]').forEach((t) => resize.observe(t))
    const mutate = new MutationObserver(measure)
    mutate.observe(list, { attributes: true, attributeFilter: ['data-state'], subtree: true, childList: true })
    // Switching between English and Urdu flips the tabs right to left without changing any size, so no resize fires: watch the direction too.
    const flip = new MutationObserver(() => requestAnimationFrame(measure))
    flip.observe(document.documentElement, { attributes: true, attributeFilter: ['dir', 'lang'] })
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutate.disconnect()
      flip.disconnect()
    }
  }, [listRef])
  return { box, ready }
}

/**
 * `size="xs"` is the compact one for settings rows and filters: 28 px tall from tablet up, still 44 px on phones where fingers need the room.
 * The white highlight behind the active tab is one element that slides and resizes to the tab you choose (and stays put for people who ask
 * their system for reduced motion).
 */
function TabsList({ className, size = 'default', children, ...props }: React.ComponentProps<typeof TabsPrimitive.List> & { size?: 'default' | 'xs' }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const { box, ready } = useActiveBox(ref)
  return (
    <TabsPrimitive.List
      ref={ref}
      data-slot="tabs-list"
      data-size={size}
      className={cn(
        'group/tabs-list relative isolate inline-flex w-fit items-center justify-center gap-1 rounded-control bg-muted p-1 text-muted-foreground',
        'data-[size=xs]:gap-0.5 data-[size=xs]:p-0.5',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        data-slot="tabs-indicator"
        className={cn(
          'pointer-events-none absolute top-0 left-0 -z-10 rounded-[calc(var(--radius-control)-2px)] bg-background shadow-sm',
          ready && 'transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
          !box && 'opacity-0',
        )}
        style={box ? { width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` } : undefined}
      />
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, onPointerDown, onBlur, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      // A tap or click already shows which tab is chosen (the highlight), so the focus outline only shows when the keyboard moved here.
      onPointerDown={(e) => {
        e.currentTarget.dataset.pointer = ''
        onPointerDown?.(e)
      }}
      onBlur={(e) => {
        delete e.currentTarget.dataset.pointer
        onBlur?.(e)
      }}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-200 sm:h-9',
        'group-data-[size=xs]/tabs-list:gap-1 group-data-[size=xs]/tabs-list:px-3 group-data-[size=xs]/tabs-list:text-[13px] sm:group-data-[size=xs]/tabs-list:h-7',
        'relative hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[pointer]:focus-visible:outline-none',
        'data-[state=active]:text-foreground',
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
  oneLine,
}: {
  tabs: ViewTab[]
  /** `xs` is compact (settings, filters); `default` is the roomy one for a form choice. */
  size?: 'default' | 'xs'
  /** Stretch across the width and share it between the tabs equally (a segmented control). */
  fill?: boolean
  /** On a phone: many short tabs stay on one line, sharing the width with tight padding, and slide sideways only if the screen is too narrow even so. Wider screens are unchanged. */
  oneLine?: boolean
  /** The name of the group, as text; or `labelledBy`, the id of a visible label (a settings row). */
  label?: string
  labelledBy?: string
  describedBy?: string
  value: string
  onValueChange: (v: string) => void
  className?: string
}) {
  // On a screen too narrow even for one tight line the list slides sideways: keep the chosen tab in view (only that list moves, never the page).
  const root = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!oneLine) return
    const list = root.current?.querySelector<HTMLElement>('[data-slot="tabs-list"]')
    const active = list?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
    if (!list || !active || list.scrollWidth <= list.clientWidth) return
    const a = active.getBoundingClientRect()
    const b = list.getBoundingClientRect()
    list.scrollBy({ left: a.left - b.left - (b.width - a.width) / 2, behavior: 'smooth' })
  }, [oneLine, value])
  return (
    <Tabs ref={root} value={value} onValueChange={onValueChange} className={cn('gap-0', className)}>
      <TabsList size={size} aria-label={label} aria-labelledby={labelledBy} aria-describedby={describedBy} className={cn(!fill && 'flex-wrap', fill && 'w-full', oneLine && 'max-sm:w-full max-sm:flex-nowrap max-sm:gap-0 max-sm:p-0.5 max-sm:justify-start max-sm:overflow-x-auto max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden')}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} disabled={tab.disabled} lang={tab.lang} aria-controls={undefined} className={cn(fill && 'flex-1', oneLine && 'max-sm:flex-1 max-sm:px-1.5 max-sm:text-xs max-sm:focus-visible:outline-offset-[-2px] max-sm:group-data-[size=xs]/tabs-list:px-1.5 max-sm:group-data-[size=xs]/tabs-list:text-xs')}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, ViewTabs }
