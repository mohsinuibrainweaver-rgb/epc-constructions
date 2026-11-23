import { useEffect, useMemo, useState } from 'react'
import { FileText, FolderOpen, Images, Loader2, Mic, Plus, ReceiptText, SearchX } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { EmptyState, PageHeader } from '@/components/common'
import { FileDialog } from '@/components/FileDialog'
import { FileViewer, useFileBlob } from '@/components/FileViewer'
import { useToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dropdown } from '@/components/ui/dropdown'
import { ViewTabs } from '@/components/ui/tabs'
import { deleteFile, restoreFile } from '@/db/actions'
import { useFiles, usePayments, usePhases, useProjectAttachments } from '@/db/hooks'
import { DOC_TYPES, type Attachment, type DocType, type FileKind, type Payment, type ProjectFile } from '@/db/types'
import type { Key } from '@/i18n/en'
import { fileSize, formatDate, money } from '@/lib/format'
import { useObjectUrl } from '@/lib/image'
import { isAudio } from '@/lib/media'
import { documentItems, documentPhaseId, itemPhaseId, photoItems, receiptAsFile } from '@/lib/receipts'
import { MediaPreview } from '@/components/FilePreview'
import { ensureAttachmentBlob } from '@/sync/engine'

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
          <MediaPreview url={url} blob={blob} className="transition-transform group-hover:scale-105" />
        ) : (
          <Loader2 aria-hidden="true" className="absolute inset-0 m-auto size-5 animate-spin text-muted-foreground" />
        )}
      </span>
      <span className="truncate text-sm font-semibold">{file.title}</span>
    </button>
  )
}

/** A receipt photo attached to a payment: the picture, a "Receipt" tag, and what it was for. */
function ReceiptTile({ attachment, payment, onOpen }: { attachment: Attachment; payment: Payment; onOpen: () => void }) {
  const { t } = useApp()
  // A receipt another phone uploaded is downloaded the first time it is shown.
  const [fetched, setFetched] = useState<Blob>()
  useEffect(() => {
    if (!attachment.blob) void ensureAttachmentBlob(attachment).then(setFetched)
  }, [attachment])
  const blob = attachment.blob ?? fetched
  const url = useObjectUrl(blob)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid min-w-0 gap-1.5 rounded-xl text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="relative block aspect-square overflow-hidden rounded-xl border bg-muted">
        {url ? (
          <MediaPreview url={url} blob={blob} className="transition-transform group-hover:scale-105" />
        ) : (
          <Loader2 aria-hidden="true" className="absolute inset-0 m-auto size-5 animate-spin text-muted-foreground" />
        )}
        <Badge variant="neutral" className="absolute start-1.5 top-1.5 bg-background/90 shadow-sm">
          <ReceiptText aria-hidden="true" />
          {t('files.receipt')}
        </Badge>
      </span>
      <span className="grid min-w-0">
        <span className="truncate text-sm font-semibold">{payment.purpose}</span>
        <span className="tabular truncate text-xs text-muted-foreground">{money(payment.amount)}</span>
      </span>
    </button>
  )
}

export function Files() {
  const { t, lang, project, phaseName, can } = useApp()
  const toast = useToast()
  const files = useFiles(project?.id)
  const payments = usePayments(project?.id)
  const receipts = useProjectAttachments(project?.id)
  const phases = usePhases(project?.id)
  const [kind, setKind] = useState<FileKind>('photo')
  const [phase, setPhase] = useState('')
  // Photos are what was uploaded here plus the receipt photos attached to payments; this narrows to one of the two.
  const [source, setSource] = useState<'' | 'progress' | 'receipt'>('')
  const [docType, setDocType] = useState<'' | DocType>('')
  const [viewing, setViewing] = useState<ProjectFile | undefined>()
  const [viewingReceipt, setViewingReceipt] = useState<{ attachment: Attachment; payment: Payment } | undefined>()
  const [editing, setEditing] = useState<ProjectFile | undefined>()
  const [adding, setAdding] = useState(false)

  const phaseLabel = useMemo(() => new Map(phases.map((p) => [p.id, phaseName(p)])), [phases, phaseName])
  const items = useMemo(() => photoItems(files, receipts, payments), [files, receipts, payments])
  // Documents are what was uploaded here plus the documents (PDF, Word, Excel ...) attached to payments.
  const docs = useMemo(() => documentItems(files, receipts, payments), [files, receipts, payments])
  const photoRows = items.filter((i) => (!source || (source === 'progress') === (i.kind === 'progress')) && (!phase || itemPhaseId(i) === phase))
  const docRows = docs.filter((d) => (!phase || documentPhaseId(d) === phase) && (!docType || (d.kind === 'upload' && d.file.docType === docType)))
  const total = kind === 'photo' ? items.length : docs.length
  const shownCount = kind === 'photo' ? photoRows.length : docRows.length
  const photoCount = items.length
  const docCount = docs.length
  const hasBoth = items.some((i) => i.kind === 'receipt') && items.some((i) => i.kind === 'progress')
  /** The second dropdown (photos from the site or receipts, or the kind of document) only exists sometimes. */
  const hasSecondFilter = (kind === 'photo' && hasBoth) || kind === 'document'

  /** Pictures grouped by the day they were taken (a receipt: the day of its payment), newest day first. */
  const byDay = useMemo(() => {
    const m = new Map<string, typeof photoRows>()
    for (const i of photoRows) m.set(i.date, [...(m.get(i.date) ?? []), i])
    return [...m.entries()]
  }, [photoRows])

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
          can('manageFiles') ? <Button variant="secondary" onClick={() => setAdding(true)}><Plus aria-hidden="true" />{t('files.add')}</Button> : undefined
        }
      />

      <div>
        <div className="grid min-w-0 grid-cols-2 items-center gap-3 max-sm:gap-2.5 sm:grid-cols-[auto_1fr_1fr]">
          <ViewTabs
            size="default"
            className="max-sm:col-span-2"
            label={t('files.kind')}
            value={kind}
            onValueChange={(v) => setKind(v as FileKind)}
            tabs={[
              { value: 'photo', label: `${t('files.photos')} (${photoCount})` },
              { value: 'document', label: `${t('files.documents')} (${docCount})` },
            ]}
          />
          <Dropdown className={hasSecondFilter ? undefined : 'max-sm:col-span-2'} aria-label={t('files.phase')} value={phase} onChange={(e) => setPhase(e.target.value)}>
            <option value="">{t('files.allPhases')}</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {phaseName(p)}
              </option>
            ))}
          </Dropdown>
          {kind === 'photo' && hasBoth && (
            <Dropdown aria-label={t('files.source')} value={source} onChange={(e) => setSource(e.target.value as '' | 'progress' | 'receipt')}>
              <option value="">{t('files.srcAll')}</option>
              <option value="progress">{t('files.srcProgress')}</option>
              <option value="receipt">{t('files.srcReceipts')}</option>
            </Dropdown>
          )}
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
      </div>

      {total === 0 ? (
        <Card>
          <EmptyState
            icon={kind === 'photo' ? Images : FolderOpen}
            title={t(kind === 'photo' ? 'files.emptyPhotos' : 'files.emptyDocs')}
            body={t(kind === 'photo' ? 'files.emptyPhotosBody' : 'files.emptyDocsBody')}
          />
        </Card>
      ) : shownCount === 0 ? (
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
                  setSource('')
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
                {list.map((i) => (
                  <li key={i.id} className="min-w-0">
                    {i.kind === 'progress' ? (
                      <PhotoTile file={i.file} onOpen={() => setViewing(i.file)} />
                    ) : (
                      <ReceiptTile attachment={i.attachment} payment={i.payment} onOpen={() => setViewingReceipt({ attachment: i.attachment, payment: i.payment })} />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {docRows.map((d) => {
              const phaseId = documentPhaseId(d)
              // A document attached to a payment is named after its payment and says which file it is; it opens with a link back to the payment.
              const title = d.kind === 'upload' ? d.file.title : d.payment.purpose
              const size = d.kind === 'upload' ? d.file.size : d.attachment.blob?.size
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => (d.kind === 'upload' ? setViewing(d.file) : setViewingReceipt({ attachment: d.attachment, payment: d.payment }))}
                    className="flex w-full items-center gap-3 p-4 text-start transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    {d.kind === 'payment' && isAudio(d.attachment) ? (
                      <Mic aria-hidden="true" className="size-6 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileText aria-hidden="true" className="size-6 shrink-0 text-muted-foreground" />
                    )}
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate font-semibold">{title}</span>
                      <span className="truncate text-sm text-muted-foreground">
                        {[d.kind === 'payment' && d.attachment.name, phaseId && phaseLabel.get(phaseId), formatDate(d.date, lang), size ? fileSize(size) : ''].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {d.kind === 'upload' && d.file.docType && <Badge variant="neutral">{t(`ftype.${d.file.docType}` as Key)}</Badge>}
                    {d.kind === 'payment' && (
                      <Badge variant="neutral">
                        <ReceiptText aria-hidden="true" />
                        {t('files.fromPayment')}
                      </Badge>
                    )}
                  </button>
                </li>
              )
            })}
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
      {viewingReceipt && (
        <FileViewer
          file={receiptAsFile(viewingReceipt.attachment, viewingReceipt.payment)}
          phaseLabel={viewingReceipt.payment.phaseId ? phaseLabel.get(viewingReceipt.payment.phaseId) : undefined}
          fetchBlob={() => ensureAttachmentBlob(viewingReceipt.attachment)}
          openPayment={{ id: viewingReceipt.payment.id, amount: money(viewingReceipt.payment.amount) }}
          onClose={() => setViewingReceipt(undefined)}
          onEdit={() => undefined}
          onDelete={() => undefined}
        />
      )}
      {can('manageFiles') && <FileDialog open={adding} defaultKind={kind} defaultPhaseId={phase || undefined} onClose={() => setAdding(false)} />}
      {can('manageFiles') && <FileDialog open={!!editing} file={editing} defaultKind={kind} onClose={() => setEditing(undefined)} />}
    </>
  )
}
