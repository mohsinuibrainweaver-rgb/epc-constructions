import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Building2, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { BudgetBar, PageHeader } from '@/components/common'
import { DeleteProjectDialog } from '@/components/DeleteProjectDialog'
import { ProjectInviteDialog } from '@/components/ProjectInviteDialog'
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import type { Project } from '@/db/types'
import { money } from '@/lib/format'
import { useObjectUrl } from '@/lib/image'
import { budgetState, budgetTone, isSpent, percent, sum } from '@/lib/stats'
import { cn } from '@/lib/utils'
import { ProjectForm } from '@/pages/ProjectForm'

/**
 * One project: the picture with the "Current" mark, the name and place, how much is spent (against the budget when there is one),
 * and the actions. Every card is the same height: the picture is always 16:9, and the name, the place and the budget part always take the
 * same room, so there is no empty gap in any card.
 */
function ProjectCard({ project, spent, current, onDelete, onInvite, onEdit }: { project: Project; spent: number; current: boolean; onDelete: () => void; onInvite: () => void; onEdit: () => void }) {
  const { t, can, isOwner } = useApp()
  const mine = can('editProject', project.id)
  const url = useObjectUrl(project.thumbnail)
  const tone = budgetTone(budgetState(spent, project.budget))
  const pct = percent(spent, project.budget)
  return (
    <Card
      className={cn('h-full gap-0 overflow-hidden py-0 transition-colors hover:border-foreground/30', current && 'ring-2 ring-primary')}
      aria-current={current || undefined}
    >
      {/* The picture fills a fixed 16:9 box whatever its own shape, so every card has the same picture size. */}
      <div className="relative aspect-video overflow-hidden bg-secondary text-primary">
        {url ? <img src={url} alt="" className="absolute inset-0 size-full object-cover" /> : <Building2 className="absolute inset-0 m-auto size-10" aria-hidden="true" />}
      </div>
      <CardContent className="flex flex-1 flex-col justify-end gap-4 p-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {current && <Badge variant="secondary">{t('projects.current')}</Badge>}
            {isOwner(project.id) && <Badge variant="secondary">{t('people.owner')}</Badge>}
          </div>
          <h2 className="line-clamp-2 min-h-[2lh] text-lg leading-snug font-semibold [overflow-wrap:anywhere]">{project.name}</h2>
          <p className="mt-0.5 line-clamp-2 min-h-[2lh] text-sm text-muted-foreground [overflow-wrap:anywhere]">{project.location}</p>
        </div>

        <div className="grid gap-1.5">
          <div className="flex h-6 items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t('projects.spent')}</span>
            {project.budget ? <Badge variant={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'neutral'}>{pct}%</Badge> : null}
          </div>
          <p className="tabular text-xl leading-tight font-bold whitespace-nowrap">{money(spent)}</p>
          <BudgetBar spent={spent} budget={project.budget} label={`${project.name}: ${pct}%`} />
          <p className="tabular text-sm whitespace-nowrap text-muted-foreground">{project.budget ? t('projects.ofBudget', { amount: money(project.budget) }) : t('projects.noBudget')}</p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button variant="secondary" asChild className="flex-1" onClick={() => void setSetting('currentProjectId', project.id)}>
            <Link to="/">{t('projects.open')}</Link>
          </Button>
          {mine && (
            <>
              {isOwner(project.id) && (
                <Button variant="outline" size="icon" onClick={onInvite} aria-label={`${t('people.inviteTitle')}: ${project.name}`} title={t('people.inviteTitle')}>
                  <UserPlus aria-hidden="true" />
                </Button>
              )}
              <Button variant="outline" size="icon" onClick={onEdit} aria-label={`${t('common.edit')}: ${project.name}`} title={t('common.edit')}>
                <Pencil aria-hidden="true" />
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
  const [inviting, setInviting] = useState<Project>()
  const [editing, setEditing] = useState<Project>()
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
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),22rem))] gap-5">
        {projects.map((p) => (
          <li key={p.id} className="min-w-0">
            {/* With only one project there is nothing to tell apart, so none is marked; with several, the open one is. */}
            <ProjectCard project={p} spent={spentBy(p.id)} current={projects.length > 1 && p.id === project?.id} onDelete={() => setDeleting(p)} onInvite={() => setInviting(p)} onEdit={() => setEditing(p)} />
          </li>
        ))}
      </ul>
      {deleting && <DeleteProjectDialog open project={deleting} onClose={() => setDeleting(undefined)} />}
      {inviting && <ProjectInviteDialog open project={inviting} onClose={() => setInviting(undefined)} />}
      <Drawer open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(undefined)}>
        {editing && (
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="truncate text-lg font-semibold">{t('pf.edit')}</DrawerTitle>
              <DrawerDescription className="truncate text-sm text-muted-foreground">{editing.name}</DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <ProjectForm projectId={editing.id} embedded onClose={() => setEditing(undefined)} onSaved={() => setEditing(undefined)} />
            </DrawerBody>
          </DrawerContent>
        )}
      </Drawer>
    </>
  )
}
