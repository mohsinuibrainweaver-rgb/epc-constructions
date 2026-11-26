import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Loader2, Mic, X } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { MediaPreview } from '@/components/FilePreview'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAttachments } from '@/db/hooks'
import type { Payment } from '@/db/types'
import { money } from '@/lib/format'
import { useObjectUrl } from '@/lib/image'
import { attachmentMime, isAudioType, isImageType, isVideoType, mimeForPath } from '@/lib/media'
import { cn } from '@/lib/utils'
import { ensureAttachmentBlob } from '@/sync/engine'

export interface GalleryFile {
  id: string
  name: string
  /** Human-readable context shown in the viewer instead of the stored filename. */
  title?: string
  subtitle?: string
  blob?: Blob
  path?: string
  mime?: string
  loadBlob: () => Promise<Blob | undefined>
}

/** A gallery file from this device, or downloaded the first time it is opened. */
function useGalleryBlob(file?: GalleryFile): Blob | undefined {
  const [fetched, setFetched] = useState<{ id: string; blob?: Blob }>()

  useEffect(() => {
    if (!file || file.blob) return
    let live = true
    void file.loadBlob().then((blob) => {
      if (live) setFetched({ id: file.id, blob })
    })
    return () => {
      live = false
    }
  }, [file?.id, file?.blob, file?.path]) // eslint-disable-line react-hooks/exhaustive-deps

  return file?.blob ?? (fetched?.id === file?.id ? fetched?.blob : undefined)
}

function GalleryMedia({ file, blob }: { file: GalleryFile; blob?: Blob }) {
  const { t } = useApp()
  const url = useObjectUrl(blob)
  const mime = blob?.type || file.mime || mimeForPath(file.name) || ''

  if (!url) {
    return (
      <p role="status" className="flex items-center gap-2 text-white/70">
        <Loader2 aria-hidden="true" className="size-5 animate-spin" />
        {t('files.loading')}
      </p>
    )
  }

  if (isVideoType(mime)) {
    return (
      <div className="absolute inset-2 grid min-h-0 min-w-0 place-items-center overflow-hidden rounded-lg sm:inset-5">
        <video
          key={file.id}
          src={url}
          controls
          playsInline
          preload="metadata"
          aria-label={file.name}
          className="block h-full w-full rounded-lg bg-black shadow-2xl"
          style={{ objectFit: 'contain', objectPosition: 'center' }}
        />
      </div>
    )
  }

  if (isImageType(mime)) {
    return (
      <div className="absolute inset-2 grid min-h-0 min-w-0 place-items-center overflow-hidden rounded-lg sm:inset-5">
        <div
          role="img"
          aria-label={file.name}
          className="absolute inset-0 rounded-lg bg-center bg-no-repeat shadow-2xl"
          style={{ backgroundImage: `url(${url})`, backgroundSize: 'contain' }}
        />
      </div>
    )
  }

  if (isAudioType(mime)) {
    return (
      <div className="grid w-full max-w-xl gap-4 rounded-xl border border-white/15 bg-white/10 p-5 text-white shadow-2xl">
        <div className="flex min-w-0 items-center gap-3">
          <Mic aria-hidden="true" className="size-6 shrink-0" />
          <span className="truncate font-semibold">{file.name}</span>
        </div>
        <audio src={url} controls preload="metadata" aria-label={file.name} className="w-full" />
      </div>
    )
  }

  return (
    <div className="grid max-w-md justify-items-center gap-4 rounded-xl border border-white/15 bg-white/10 p-6 text-center text-white shadow-2xl">
      <FileText aria-hidden="true" className="size-12" />
      <span className="break-all font-semibold">{file.name}</span>
      <Button asChild variant="secondary">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink aria-hidden="true" />
          {t('files.open')}
        </a>
      </Button>
    </div>
  )
}

function GalleryThumb({ file, selected, onClick }: { file: GalleryFile; selected: boolean; onClick: () => void }) {
  const { t } = useApp()
  const blob = useGalleryBlob(file)
  const url = useObjectUrl(blob)
  const mime = blob?.type || file.mime || mimeForPath(file.name) || ''
  const media = isImageType(mime) || isVideoType(mime)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      aria-label={file.name || t('files.receipt')}
      className={cn(
        'relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border bg-white/10 text-white/70 outline-none transition-[border-color,opacity] hover:opacity-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white sm:size-16',
        selected ? 'border-primary ring-2 ring-inset ring-primary opacity-100' : 'border-white/20 opacity-65',
      )}
    >
      {media && url ? (
        <MediaPreview url={url} blob={blob} playSize="sm" />
      ) : !blob ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : isAudioType(mime) ? (
        <Mic aria-hidden="true" className="size-5" />
      ) : (
        <FileText aria-hidden="true" className="size-5" />
      )}
    </button>
  )
}

/** Any ordered media collection, opened as one keyboard-accessible gallery. */
export function MediaGalleryDialog({
  open,
  files,
  initialFileId,
  description,
  onClose,
}: {
  open: boolean
  files: GalleryFile[]
  initialFileId?: string
  description?: string
  onClose: () => void
}) {
  const { t } = useApp()
  const [index, setIndex] = useState(0)
  const thumbnailStrip = useRef<HTMLDivElement>(null)
  const current = files[index]
  const currentBlob = useGalleryBlob(current)
  const currentUrl = useObjectUrl(currentBlob)

  useEffect(() => {
    if (!open) return
    const requested = initialFileId ? files.findIndex((file) => file.id === initialFileId) : 0
    setIndex(requested >= 0 ? requested : 0)
  }, [open, initialFileId, files.length])
  useEffect(() => {
    if (files.length > 0 && index >= files.length) setIndex(files.length - 1)
  }, [files.length, index])

  useEffect(() => {
    if (!open || files.length < 2) return
    thumbnailStrip.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [open, index, files.length])

  useEffect(() => {
    if (!open || files.length < 2) return
    const navigate = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLVideoElement || event.target instanceof HTMLAudioElement) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setIndex((value) => Math.max(0, value - 1))
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setIndex((value) => Math.min(files.length - 1, value + 1))
      }
    }
    window.addEventListener('keydown', navigate)
    return () => window.removeEventListener('keydown', navigate)
  }, [open, files.length])

  const previous = () => setIndex((value) => Math.max(0, value - 1))
  const next = () => setIndex((value) => Math.min(files.length - 1, value + 1))

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="!inset-0 !top-0 !left-0 !grid !h-dvh !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 !grid-rows-[auto_minmax(0,1fr)_auto] !gap-3 !overflow-hidden !rounded-none !border-0 !bg-black/25 !p-3 text-white shadow-none sm:!p-5 [&>span:first-child]:hidden"
      >
        <header className="mx-auto grid min-h-12 w-full max-w-5xl grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl border border-white/10 bg-black/85 px-3 py-2 shadow-xl backdrop-blur-md sm:gap-3 sm:px-4">
          <div className="grid min-w-0 gap-0.5 text-left leading-tight">
            <DialogTitle className="block min-w-0 truncate text-sm font-bold text-white drop-shadow-sm sm:text-base">
              {current?.title || description || current?.name || t('ledger.attachments')}
            </DialogTitle>
            {current?.subtitle && (
              <p className="truncate text-xs font-semibold tabular-nums text-white/75 sm:text-sm">{current.subtitle}</p>
            )}
          </div>
          <DialogDescription className="sr-only">{description ?? t('ledger.attachments')}</DialogDescription>
          {currentUrl ? (
            <Button asChild variant="secondary" size="sm" className="shrink-0 rounded-full border-0 !bg-white !text-black shadow-lg hover:!bg-white/90 hover:!text-black">
              <a href={currentUrl} download={current?.name}>
                <Download aria-hidden="true" />
                <span className="max-sm:sr-only">{t('files.download')}</span>
              </a>
            </Button>
          ) : (
            <Button disabled variant="secondary" size="sm" className="shrink-0 rounded-full border-0 !bg-white !text-black shadow-lg">
              <Download aria-hidden="true" />
              <span className="max-sm:sr-only">{t('files.download')}</span>
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="shrink-0 rounded-full border-0 !bg-white !text-black shadow-lg hover:!bg-white/90 hover:!text-black focus-visible:ring-0 focus-visible:outline-none"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="relative mx-auto grid min-h-0 min-w-0 w-full max-w-5xl place-items-center overflow-hidden rounded-lg border border-white/10 bg-black/90 shadow-2xl">
          {files.length === 0 ? (
            <p role="status" className="flex items-center gap-2 text-white/70">
              <Loader2 aria-hidden="true" className="size-5 animate-spin" />
              {t('files.loading')}
            </p>
          ) : current ? (
            <GalleryMedia file={current} blob={currentBlob} />
          ) : null}

          {files.length > 1 && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                disabled={index === 0}
                onClick={previous}
                aria-label={t('common.previous')}
                className="absolute inset-s-3 top-1/2 -translate-y-1/2 rounded-full bg-white text-black shadow-lg hover:bg-white/90 disabled:opacity-25 sm:inset-s-7"
              >
                <ChevronLeft aria-hidden="true" className="rtl:rotate-180" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                disabled={index === files.length - 1}
                onClick={next}
                aria-label={t('common.next')}
                className="absolute inset-e-3 top-1/2 -translate-y-1/2 rounded-full bg-white text-black shadow-lg hover:bg-white/90 disabled:opacity-25 sm:inset-e-7"
              >
                <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
              </Button>
            </>
          )}
        </div>

        {files.length > 1 && (
          <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-white/10 bg-black/90 py-3 shadow-2xl">
            <div ref={thumbnailStrip} className="flex w-full gap-2 overflow-x-auto pb-1 [scrollbar-color:rgba(255,255,255,.3)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-[2px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/30 [&::-webkit-scrollbar-track]:bg-transparent">
              <span aria-hidden="true" className="w-1 shrink-0" />
              {files.map((file, fileIndex) => (
                <GalleryThumb key={file.id} file={file} selected={fileIndex === index} onClick={() => setIndex(fileIndex)} />
              ))}
              <span aria-hidden="true" className="w-1 shrink-0" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A payment's attachments, adapted to the shared media gallery. */
export function PaymentAttachmentsDialog({
  payment,
  initialAttachmentId,
  onClose,
}: {
  payment?: Payment
  initialAttachmentId?: string
  onClose: () => void
}) {
  const attachments = useAttachments(payment?.id)
  const last = useRef<Payment | undefined>(undefined)
  if (payment) last.current = payment
  const currentPayment = payment ?? last.current
  const files: GalleryFile[] = attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    title: currentPayment?.purpose,
    subtitle: currentPayment ? money(currentPayment.amount) : undefined,
    blob: attachment.blob,
    path: attachment.path,
    mime: attachmentMime(attachment),
    loadBlob: () => ensureAttachmentBlob(attachment),
  }))

  return (
    <MediaGalleryDialog
      open={Boolean(payment)}
      files={files}
      initialFileId={initialAttachmentId}
      description={currentPayment?.purpose}
      onClose={onClose}
    />
  )
}
