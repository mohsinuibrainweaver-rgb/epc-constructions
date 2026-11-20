import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileText, Loader2, Pencil, Trash2 } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Dialog } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import type { ProjectFile } from '@/db/types'
import type { Key } from '@/i18n/en'
import { fileSize, formatDate } from '@/lib/format'
import { useObjectUrl } from '@/lib/image'
import { ensureFileBlob } from '@/sync/engine'

/** The file's blob: from this device, or downloaded the first time another person's upload is shown. */
export function useFileBlob(file: ProjectFile | undefined): { blob?: Blob; failed: boolean } {
  const [fetched, setFetched] = useState<{ id: string; blob?: Blob }>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
    if (!file || file.blob) return
    let live = true
    void ensureFileBlob(file).then((b) => {
      if (!live) return
      if (b) setFetched({ id: file.id, blob: b })
      else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [file?.id, file?.blob, file?.path]) // eslint-disable-line react-hooks/exhaustive-deps
  return { blob: file?.blob ?? (fetched?.id === file?.id ? fetched?.blob : undefined), failed }
}

/** Opens one photo or document with its details, and lets you save, edit or delete it. */
export function FileViewer({
  file,
  phaseLabel,
  onClose,
  onEdit,
  onDelete,
}: {
  file?: ProjectFile
  phaseLabel?: string
  onClose: () => void
  onEdit: (f: ProjectFile) => void
  onDelete: (f: ProjectFile) => void
}) {
  const { t, lang } = useApp()
  const toast = useToast()
  const { blob, failed } = useFileBlob(file)
  const url = useObjectUrl(blob)
  const isImage = !!file && (file.kind === 'photo' || file.mime.startsWith('image/'))

  useEffect(() => {
    if (failed) toast.show({ kind: 'error', message: t('files.fetchFail') })
  }, [failed]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!file) return null

  const details = [
    file.docType && t(`ftype.${file.docType}` as Key),
    phaseLabel,
    formatDate(file.date, lang),
    fileSize(file.size),
  ].filter(Boolean)

  return (
    <Dialog
      open
      title={file.title}
      description={details.join(' · ')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={() => onEdit(file)}>
            <Pencil aria-hidden="true" />
            {t('common.edit')}
          </Button>
          <Button variant="outline" onClick={() => onDelete(file)}>
            <Trash2 aria-hidden="true" />
            {t('common.delete')}
          </Button>
          {url && (
            <Button asChild>
              <a href={url} download={file.name}>
                <Download aria-hidden="true" />
                {t('files.download')}
              </a>
            </Button>
          )}
        </>
      }
    >
      {isImage ? (
        url ? (
          <img src={url} alt={file.title} className="max-h-[55dvh] w-full rounded-lg bg-muted object-contain" />
        ) : (
          <Loading label={t('files.loading')} />
        )
      ) : url ? (
        <div className="grid justify-items-start gap-3">
          <div className="flex items-center gap-3 text-muted-foreground">
            <FileText aria-hidden="true" className="size-8" />
            <span className="break-all">{file.name}</span>
          </div>
          <Button asChild variant="outline">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" />
              {t('files.open')}
            </a>
          </Button>
        </div>
      ) : (
        <Loading label={t('files.loading')} />
      )}
      {file.note && <p className="whitespace-pre-wrap">{file.note}</p>}
    </Dialog>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-muted-foreground">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      {label}
    </p>
  )
}
