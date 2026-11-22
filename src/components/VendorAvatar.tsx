import type { ElementType } from 'react'
import { BrickWall, Flame, Grid3x3, HardHat, Hammer, PaintBucket, Package, Tractor, UserRound, Users, Wrench, Zap } from 'lucide-react'
import type { VendorRole } from '@/db/types'
import { cn } from '@/lib/utils'

/** What the person does, as a picture. */
const ICONS: Record<VendorRole, ElementType> = {
  builder: HardHat,
  foreman: Users,
  carpenter: Hammer,
  painter: PaintBucket,
  plumber: Wrench,
  electrician: Zap,
  tiler: Grid3x3,
  welder: Flame,
  ceiling: BrickWall,
  supplier: Package,
  machinery: Tractor,
  other: UserRound,
}

/** `colour` comes from assignColours (lib/avatarColours), which looks at the whole list so neighbours differ. */
export function VendorAvatar({ colour, role, className }: { colour: string; role: VendorRole; className?: string }) {
  const Icon = ICONS[role] ?? UserRound
  return (
    <span aria-hidden="true" className={cn('grid size-10 shrink-0 place-items-center rounded-full transition-transform duration-200 motion-reduce:transition-none', colour, className)}>
      <Icon className="size-5" />
    </span>
  )
}
