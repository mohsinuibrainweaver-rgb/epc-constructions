import { useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Mic } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Dialog } from '@/components/common'
import { FileViewer } from '@/components/FileViewer'
import { MediaPreview } from '@/components/FilePreview'
import { useAttachments } from '@/db/hooks'
import type { Attachment, Payment } from '@/db/types'
import { fileSize, money } from '@/lib/format'
import { useObjectUrl } from '@/lib/image'
import { isAudio, isPictureOrVideo } from '@/lib/media'
import { receiptAsFile } from '@/lib/receipts'
import { ensureAttachmentBlob } from '@/sync/engine'

function AttachmentTile({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const { t } = useApp()
  const [fetched, setFetched] = useState<Blob>()
  const blob = attachment.blob ?? fetched
  const url = useObjectUrl(blob)
  const media = isPictureOrVideo(attachment)
  const audio = isAudio(attachment)

  useEffect(() => {
    let live = true
    if (!attachment.blob) void ensureAttachmentBlob(attachment).then((value) => live && setFetched(value))
    return () => { live = false }
  }, [attachment])

  return (
    <button type="button" onClick={onOpen} className="group grid min-w-0 gap-2 rounded-xl border bg-card p-2 text-start transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <span className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {media && url ? (
          <MediaPreview url={url} blob={blob} className="transition-transform group-hover:scale-105" />
        ) : !blob ? (
          <Loader2 aria-hidden="true" className="size-5 animate-spin" />
        ) : audio ? (
          <Mic aria-hidden="true" className="size-7 text-primary" />
        ) : (
          <FileText aria-hidden="true" className="size-7 text-primary" />
        )}
      </span>
      <span className="grid min-w-0 px-1 pb-1">
        <span className="truncate text-sm font-semibold">{attachment.name || t('files.receipt')}</span>
        {blob && <span className="tabular text-xs text-muted-foreground">{fileSize(blob.size)}</span>}
      </span>
    </button>
  )
}

/** A payment's receipts and files, opened directly from its Ledger row without leaving the page. */
export function PaymentAttachmentsDialog({ payment, onClose }: { payment?: Payment; onClose: () => void }) {
  const { t } = useApp()
  const files = useAttachments(payment?.id)
  const [viewing, setViewing] = useState<Attachment>()
  const last = useRef<Payment | undefined>(undefined)
  if (payment) last.current = payment
  const current = payment ?? last.current

  useEffect(() => setViewing(undefined), [payment?.id])

  return (
    <>
      <Dialog
        open={Boolean(payment && !viewing)}
        title={t('ledger.attachments')}
        description={current ? `${current.purpose} · ${money(current.amount)}` : undefined}
        onClose={onClose}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((file) => <AttachmentTile key={file.id} attachment={file} onOpen={() => setViewing(file)} />)}
        </div>
      </Dialog>
      {viewing && current && (
        <FileViewer
          file={receiptAsFile(viewing, current)}
          fetchBlob={() => ensureAttachmentBlob(viewing)}
          openPayment={{ id: current.id, amount: money(current.amount) }}
          onClose={() => setViewing(undefined)}
          onEdit={() => undefined}
          onDelete={() => undefined}
        />
      )}
    </>
  )
}
