import { useMemo, useState } from 'react'
import { FileText, FolderOpen, Images, Loader2, Plus, SearchX } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { EmptyState, PageHeader } from '@/components/common'
import { FileDialog } from '@/components/FileDialog'
import { FileViewer, useFileBlob } from '@/components/FileViewer'
import { useToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dropdown } from '@/components/ui/dropdown'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { deleteFile, restoreFile } from '@/db/actions'
import { useFiles, usePhases } from '@/db/hooks'
import { DOC_TYPES, type DocType, type FileKind, type ProjectFile } from '@/db/types'
import type { Key } from '@/i18n/en'
import { fileSize, formatDate } from '@/lib/format'
import { useObjectUrl } from '@/lib/image'

function PhotoTile({ file, onOpen }: { file: ProjectFile; onOpen: () => void }) {
  const { blob } = useFileBlob(file)
  const url = useObjectUrl(blob)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid min-w-0 gap-1.5 rounded-xl text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="relative block aspect-square overflow-hidden rounded-xl border bg-muted">
        {url ? (
          <img src={url} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <Loader2 aria-hidden="true" className="absolute inset-0 m-auto size-5 animate-spin text-muted-foreground" />
        )}
      </span>
      <span className="truncate text-sm font-semibold">{file.title}</span>
    </button>
  )
}

export function Files() {
  const { t, lang, project, phaseName } = useApp()
  const toast = useToast()
  const files = useFiles(project?.id)
  const phases = usePhases(project?.id)
  const [kind, setKind] = useState<FileKind>('photo')
  const [phase, setPhase] = useState('')
  const [docType, setDocType] = useState<'' | DocType>('')
  const [viewing, setViewing] = useState<ProjectFile | undefined>()
  const [editing, setEditing] = useState<ProjectFile | undefined>()
  const [adding, setAdding] = useState(false)

  const phaseLabel = useMemo(() => new Map(phases.map((p) => [p.id, phaseName(p)])), [phases, phaseName])
  const ofKind = files.filter((f) => f.kind === kind)
  const rows = ofKind.filter((f) => (!phase || f.phaseId === phase) && (kind !== 'document' || !docType || f.docType === docType))
  const photoCount = files.filter((f) => f.kind === 'photo').length
  const docCount = files.length - photoCount

  /** Photos grouped by the day they were taken, newest day first. */
  const byDay = useMemo(() => {
    const m = new Map<string, ProjectFile[]>()
    for (const f of rows) m.set(f.date, [...(m.get(f.date) ?? []), f])
    return [...m.entries()]
  }, [rows])

  const remove = async (f: ProjectFile) => {
    setViewing(undefined)
    await deleteFile(f.id)
    toast.show({ kind: 'info', message: t('files.deleted'), actionLabel: t('common.undo'), onAction: () => void restoreFile(f.id) })
  }

  // The viewer shows the latest version of the row, so an edit is visible straight away.
  const current = viewing ? files.find((f) => f.id === viewing.id) ?? viewing : undefined

  return (
    <>
      <PageHeader
        title={t('nav.files')}
        actions={
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            {t('files.add')}
          </Button>
        }
      />

      <Card className="p-4">
        <div className="grid items-center gap-3 sm:grid-cols-[auto_1fr_1fr]">
          <PillRadioGroup aria-label={t('files.kind')} value={kind} onValueChange={(v) => setKind(v as FileKind)}>
            <PillRadioItem value="photo">
              {t('files.photos')} ({photoCount})
            </PillRadioItem>
            <PillRadioItem value="document">
              {t('files.documents')} ({docCount})
            </PillRadioItem>
          </PillRadioGroup>
          <Dropdown aria-label={t('files.phase')} value={phase} onChange={(e) => setPhase(e.target.value)}>
            <option value="">{t('files.allPhases')}</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {phaseName(p)}
              </option>
            ))}
          </Dropdown>
          {kind === 'document' && (
            <Dropdown aria-label={t('files.docType')} value={docType} onChange={(e) => setDocType(e.target.value as '' | DocType)}>
              <option value="">{t('files.allTypes')}</option>
              {DOC_TYPES.map((d) => (
                <option key={d} value={d}>
                  {t(`ftype.${d}` as Key)}
                </option>
              ))}
            </Dropdown>
          )}
        </div>
      </Card>

      {ofKind.length === 0 ? (
        <Card>
          <EmptyState
            icon={kind === 'photo' ? Images : FolderOpen}
            title={t(kind === 'photo' ? 'files.emptyPhotos' : 'files.emptyDocs')}
            body={t(kind === 'photo' ? 'files.emptyPhotosBody' : 'files.emptyDocsBody')}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title={t('files.noMatch')}
            body={t('files.noMatchBody')}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setPhase('')
                  setDocType('')
                }}
              >
                {t('files.clearFilters')}
              </Button>
            }
          />
        </Card>
      ) : kind === 'photo' ? (
        <div className="grid gap-6">
          {byDay.map(([day, list]) => (
            <section key={day} aria-label={formatDate(day, lang)} className="grid gap-3">
              <h2 className="text-lg font-semibold">{formatDate(day, lang)}</h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {list.map((f) => (
                  <li key={f.id} className="min-w-0">
                    <PhotoTile file={f} onOpen={() => setViewing(f)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {rows.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setViewing(f)}
                  className="flex w-full items-center gap-3 p-4 text-start transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <FileText aria-hidden="true" className="size-6 shrink-0 text-muted-foreground" />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate font-semibold">{f.title}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {[f.phaseId && phaseLabel.get(f.phaseId), formatDate(f.date, lang), fileSize(f.size)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {f.docType && <Badge variant="neutral">{t(`ftype.${f.docType}` as Key)}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <FileViewer
        file={current}
        phaseLabel={current?.phaseId ? phaseLabel.get(current.phaseId) : undefined}
        onClose={() => setViewing(undefined)}
        onEdit={(f) => {
          setViewing(undefined)
          setEditing(f)
        }}
        onDelete={(f) => void remove(f)}
      />
      <FileDialog open={adding} defaultKind={kind} defaultPhaseId={phase || undefined} onClose={() => setAdding(false)} />
      <FileDialog open={!!editing} file={editing} defaultKind={kind} onClose={() => setEditing(undefined)} />
    </>
  )
}
