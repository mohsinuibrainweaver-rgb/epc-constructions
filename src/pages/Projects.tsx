import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { PageHeader } from '@/components/common'
import { DeleteProjectDialog } from '@/components/DeleteProjectDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import type { Project } from '@/db/types'
import { money } from '@/lib/format'
import { useObjectUrl } from '@/lib/image'
import { isSpent, sum } from '@/lib/stats'
import { cn } from '@/lib/utils'

function ProjectCard({ project, spent, current, onDelete }: { project: Project; spent: number; current: boolean; onDelete: () => void }) {
  const { t } = useApp()
  const url = useObjectUrl(project.thumbnail)
  return (
    <Card className={cn('overflow-hidden transition-colors hover:border-foreground/30', current && 'ring-2 ring-primary')} aria-current={current || undefined}>
      <div className="grid aspect-video place-items-center bg-secondary text-primary">
        {url ? <img src={url} alt="" className="size-full object-cover" /> : <Building2 className="size-9" aria-hidden="true" />}
      </div>
      <CardContent className="grid gap-3 pt-4">
        <div>
          <h2 className="text-lg font-semibold">{project.name}</h2>
          {project.location && <p className="text-sm text-muted-foreground">{project.location}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {t('projects.spent')}: <strong className="tabular text-foreground">{money(spent)}</strong>
          </span>
          {current && <Badge variant="secondary">{t('projects.current')}</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild size="sm" onClick={() => void setSetting('currentProjectId', project.id)}>
            <Link to="/">{t('projects.open')}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`/projects/${project.id}/edit`}>
              <Pencil aria-hidden="true" />
              {t('common.edit')}
            </Link>
          </Button>
          <Button size="sm" variant="outline" className="text-danger hover:text-danger" onClick={onDelete} aria-label={`${t('common.delete')}: ${project.name}`}>
            <Trash2 aria-hidden="true" />
            {t('common.delete')}
          </Button>
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
          <Button variant="secondary" asChild>
            <Link to="/projects/new">
              <Plus aria-hidden="true" />
              {t('projects.new')}
            </Link>
          </Button>
        }
      />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4">
        {projects.map((p) => (
          <li key={p.id}>
            <ProjectCard project={p} spent={spentBy(p.id)} current={p.id === project?.id} onDelete={() => setDeleting(p)} />
          </li>
        ))}
      </ul>
      {deleting && <DeleteProjectDialog open project={deleting} onClose={() => setDeleting(undefined)} />}
    </>
  )
}
