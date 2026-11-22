import { CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Badge } from '@/components/ui/badge'
import { money } from '@/lib/format'
import { percent, type BudgetState } from '@/lib/stats'

/**
 * What a phase's cost says about its estimate, in one small badge. Only the states that carry news get one: a phase well within its
 * estimate (or with none) shows nothing. Red is for a clear overspend only; finishing on or under the estimate is green.
 */
export function BudgetChip({ state, spent, estimate, className }: { state: BudgetState; spent: number; estimate: number | undefined; className?: string }) {
  const { t } = useApp()
  const est = estimate ?? 0
  switch (state) {
    case 'near':
      return (
        <Badge variant="warning" className={className}>
          {t('phases.used', { pct: percent(spent, estimate) })}
        </Badge>
      )
    case 'full':
      return (
        <Badge variant="info" className={className}>
          <Info aria-hidden="true" data-solid="" />
          {t('phases.estimateUsed')}
        </Badge>
      )
    case 'overSlight':
    case 'over':
      return (
        <Badge variant={state === 'over' ? 'danger' : 'warning'} className={className}>
          <TriangleAlert aria-hidden="true" data-solid="" />
          {t('phases.overAmount', { amount: money(spent - est) })}
        </Badge>
      )
    case 'onEstimate':
      return (
        <Badge variant="success" className={className}>
          <CircleCheck aria-hidden="true" data-solid="" />
          {t('phases.onEstimate')}
        </Badge>
      )
    case 'under':
      return (
        <Badge variant="success" className={className}>
          <CircleCheck aria-hidden="true" data-solid="" />
          {t('phases.underBy', { amount: money(est - spent) })}
        </Badge>
      )
    default:
      return null
  }
}
