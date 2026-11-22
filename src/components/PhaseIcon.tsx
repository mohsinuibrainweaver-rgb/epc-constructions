import { Building2, BrickWall, Cable, ClipboardList, DoorOpen, Grid3x3, Hammer, HardHat, KeyRound, Lightbulb, PaintBucket, Pickaxe, Shovel, type LucideIcon } from 'lucide-react'
import type { Phase } from '@/db/types'
import { cn } from '@/lib/utils'

/** An icon for each standard phase, so a long list is easy to scan. A phase you added yourself gets a hard hat. One list, used everywhere a phase is shown. */
const PHASE_ICONS: Record<string, LucideIcon> = {
  planning: ClipboardList,
  site: Shovel,
  foundation: Pickaxe,
  grey: Building2,
  services: Cable,
  windows: DoorOpen,
  ceiling: BrickWall,
  flooring: Grid3x3,
  woodwork: Hammer,
  paint: PaintBucket,
  finishing: Lightbulb,
  handover: KeyRound,
}

export const phaseIcon = (ph: Pick<Phase, 'key'>): LucideIcon => (ph.key && PHASE_ICONS[ph.key]) || HardHat

/** The phase's icon in a tinted tile. Decoration: the phase name always sits beside it. */
export function PhaseIcon({ phase, colour, className }: { phase: Pick<Phase, 'key'>; /** Tile colour from colourMap (lib/avatarColours): a light fill with a colour-500 icon. */ colour?: string; className?: string }) {
  const Icon = phaseIcon(phase)
  return (
    <span aria-hidden="true" className={cn('grid size-7 shrink-0 place-items-center rounded-control', colour ?? 'bg-secondary text-primary', className)}>
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  )
}
