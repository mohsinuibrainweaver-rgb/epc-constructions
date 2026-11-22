import { CircleArrowRight, CircleCheck, Clock, TriangleAlert } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { Key } from '@/i18n/en'
import type { ContractState } from '@/lib/contracts'
import { cn } from '@/lib/utils'

/** Where a contract stands. Always an icon and a word, so it reads without colour. */
export function ContractPill({ state }: { state: ContractState }) {
  const { t } = useApp()
  const label = t(`contract.state.${state}` as Key)
  if (state === 'overpaid')
    return (
      <Badge variant="danger">
        <TriangleAlert aria-hidden="true" data-solid="" />
        {label}
      </Badge>
    )
  if (state === 'fullyPaid')
    return (
      <Badge variant="success">
        <CircleCheck aria-hidden="true" data-solid="" />
        {label}
      </Badge>
    )
  if (state === 'inProgress')
    return (
      <Badge variant="info">
        <CircleArrowRight aria-hidden="true" data-solid="" />
        {label}
      </Badge>
    )
  return (
    <Badge variant="neutral">
      <Clock aria-hidden="true" data-solid="" />
      {label}
    </Badge>
  )
}

/** Share of the agreed total that is paid. Unlike a budget, reaching 100% is the goal, so only overpaying turns red. */
export function ContractBar({ pct, state, label }: { pct: number; state: ContractState; label: string }) {
  return (
    <Progress
      value={pct}
      aria-label={label}
      className={cn(
        'h-2 bg-muted',
        state === 'overpaid' && '[&>[data-slot=progress-indicator]]:bg-danger',
        state === 'fullyPaid' && '[&>[data-slot=progress-indicator]]:bg-success',
      )}
    />
  )
}
