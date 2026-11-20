import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { BudgetBar, PageHeader } from '@/components/common'
import { DeleteProjectDialog } from '@/components/DeleteProjectDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import type { Project } from '@/db/types'
import { money } from '@/lib/format'
import { useObjectUrl } from '@/lib/image'
import { budgetLevel, isSpent, percent, sum } from '@/lib/stats'
import { cn } from '@/lib/utils'

/**
 * One project: the picture with the "Current" mark, the name and place, how much is spent (against the budget when there is one),
 * and the actions. Every card in a row is the same height and its buttons sit on the same line.
 */
function ProjectCard({ project, spent, current, onDelete }: { project: Project; spent: number; current: boolean; onDelete: () => void }) {
  const { t, can, roleOf } = useApp()
  const mine = can('editProject', project.id)
  const url = useObjectUrl(project.thumbnail)
  const level = budgetLevel(spent, project.budget)
  const pct = percent(spent, project.budget)
  const role = roleOf(project.id)
  return (
    <Card
      className={cn('h-full gap-0 overflow-hidden py-0 transition-colors hover:border-foreground/30', current && 'ring-2 ring-primary')}
      aria-current={current || undefined}
    >
      <div className="grid aspect-video place-items-center bg-secondary text-primary">
        {url ? <img src={url} alt="" className="size-full object-cover" /> : <Building2 className="size-10" aria-hidden="true" />}
      </div>
      <CardContent className="flex flex-1 flex-col gap-4 p-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {current && <Badge variant="secondary">{t('projects.current')}</Badge>}
            <Badge variant="neutral">{t(role === 'investor' ? 'set.roleInvestor' : 'set.roleBuilder')}</Badge>
          </div>
          <h2 className="line-clamp-2 text-lg leading-snug font-semibold [overflow-wrap:anywhere]">{project.name}</h2>
          {project.location && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">{project.location}</p>}
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t('projects.spent')}</span>
            {project.budget ? <Badge variant={level === 'error' ? 'danger' : level === 'warning' ? 'warning' : 'neutral'}>{pct}%</Badge> : null}
          </div>
          <p className="tabular text-xl leading-tight font-bold whitespace-nowrap">{money(spent)}</p>
          {project.budget ? (
            <>
              <BudgetBar spent={spent} budget={project.budget} label={`${project.name}: ${pct}%`} />
              <p className="tabular text-sm whitespace-nowrap text-muted-foreground">{t('projects.ofBudget', { amount: money(project.budget) })}</p>
            </>
          ) : null}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button variant="secondary" asChild className="flex-1" onClick={() => void setSetting('currentProjectId', project.id)}>
            <Link to="/">{t('projects.open')}</Link>
          </Button>
          {mine && (
            <>
              <Button asChild variant="outline" size="icon" aria-label={`${t('common.edit')}: ${project.name}`} title={t('common.edit')}>
                <Link to={`/projects/${project.id}/edit`}>
                  <Pencil aria-hidden="true" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="text-danger hover:text-danger"
                onClick={onDelete}
                aria-label={`${t('common.delete')}: ${project.name}`}
                title={t('common.delete')}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function Projects() {
  const { t, projects, project } = useApp()
  const [deleting, setDeleting] = useState<Project>()
  const all = useLiveQuery(() => db.payments.toArray(), []) ?? []
  const spentBy = (id: string) => sum(all.filter((p) => p.projectId === id && isSpent(p)))
  return (
    <>
      <PageHeader
        title={t('projects.title')}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/join">{t('projects.join')}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/projects/new">
                <Plus aria-hidden="true" />
                {t('projects.new')}
              </Link>
            </Button>
          </>
        }
      />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4">
        {projects.map((p) => (
          <li key={p.id} className="min-w-0">
            <ProjectCard project={p} spent={spentBy(p.id)} current={p.id === project?.id} onDelete={() => setDeleting(p)} />
          </li>
        ))}
      </ul>
      {deleting && <DeleteProjectDialog open project={deleting} onClose={() => setDeleting(undefined)} />}
    </>
  )
}
