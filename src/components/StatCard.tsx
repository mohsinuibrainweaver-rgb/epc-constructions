import type { ComponentProps, ElementType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { MESH_TILE, meshCard } from '@/lib/mesh'
import { cn } from '@/lib/utils'

interface Base {
  icon: ElementType
  /** Position in the row: picks the card's mesh gradient (lib/mesh.ts). */
  mesh: number
  label: string
  value: ReactNode
  /** A short line under the value: a count, a date, what happens on click. */
  sub?: ReactNode
  className?: string
}

/** Filter-style card: pressing it turns a view on, pressing it again turns it off (`aria-pressed`). */
type Pressable = Base & { pressed: boolean; onPress: () => void; to?: never; onGo?: never; controls?: string }
/** Link card: goes to another screen. */
type Linked = Base & { to: string; pressed?: never; onPress?: never; onGo?: never; controls?: never }
/** Shortcut card: runs an action, such as scrolling to a section. */
type Action = Base & { onGo: () => void; to?: never; pressed?: never; onPress?: never; controls?: never }
/** Plain figure with nothing behind it. */
type Static = Base & { to?: never; pressed?: never; onPress?: never; onGo?: never; controls?: never }

const FRAME =
  'group relative flex w-full flex-col gap-3 rounded-xl border p-4 text-start shadow-xs ' +
  'transition-[border-color,box-shadow,transform] duration-150 motion-reduce:transition-none'
const LIVE =
  'cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100'

/**
 * A figure with an icon, a label, the value and a line of context. The tint says what kind of figure it is, and the words say the rest
 * (a tint is never the only signal). A card that does something is a real button or link, so it gets focus, Enter and Space for free.
 */
export function StatCard(props: Pressable | Linked | Action | Static) {
  const { icon: Icon, mesh, label, value, sub, className } = props
  const body = (
    <>
      <span className="flex items-center gap-3">
        <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-lg', MESH_TILE)}>
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium text-muted-foreground">{label}</span>
        {(props.to || props.onGo) && (
          <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rtl:-scale-x-100" />
        )}
      </span>
      <span className="grid gap-0.5">
        <span className="tabular text-2xl leading-tight font-extrabold">{value}</span>
        {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
      </span>
    </>
  )

  if (props.to) {
    return (
      <Link to={props.to} className={cn(FRAME, LIVE, meshCard(mesh), className)}>
        {body}
      </Link>
    )
  }
  if (props.onPress) {
    const on = props.pressed
    return (
      <button
        type="button"
        aria-pressed={on}
        aria-controls={props.controls}
        onClick={props.onPress}
        className={cn(FRAME, LIVE, on && 'border-primary ring-2 ring-primary hover:border-primary', meshCard(mesh), className)}
      >
        {body}
      </button>
    )
  }
  if (props.onGo) {
    return (
      <button type="button" onClick={props.onGo} className={cn(FRAME, LIVE, meshCard(mesh), className)}>
        {body}
      </button>
    )
  }
  return <div className={cn(FRAME, meshCard(mesh), className)}>{body}</div>
}

export type StatCardProps = ComponentProps<typeof StatCard>
