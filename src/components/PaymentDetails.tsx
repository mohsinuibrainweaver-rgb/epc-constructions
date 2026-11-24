import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ExternalLink, FileText, Video } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { ApprovalNotice } from '@/components/ApprovalActions'
import { StatusPill } from '@/components/common'
import { AudioNote } from '@/components/FilePreview'
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useAttachments, useContracts, usePhases, useVendors } from '@/db/hooks'
import type { Attachment, Payment } from '@/db/types'
import type { Key } from '@/i18n/en'
import { fileSize, formatDate, money, moneyRate } from '@/lib/format'
import { useObjectUrl } from '@/lib/image'
import { hasQuantity, num, rateOf } from '@/lib/materials'
import { attachmentMime, isAudio, isPictureOrVideo } from '@/lib/media'
import { ensureAttachmentBlob } from '@/sync/engine'
import { payerLabel } from '@/lib/members'

/** One line of the details: what it is, and its value at the end. Left out by the caller when there is no value. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed py-2.5 last:border-0">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end font-medium [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

/** A receipt: a photo shows as itself, a video as a plain tile. Shown only when this device has the file. */
function Proof({ file }: { file: Attachment }) {
  const url = useObjectUrl(file.blob)
  if (!file.blob) return null
  return file.blob.type.startsWith('image/') && url ? (
    <img src={url} alt="" className="size-20 rounded-lg border object-cover" />
  ) : (
    <span aria-hidden="true" className="grid size-20 place-items-center rounded-lg border bg-muted text-muted-foreground">
      <Video className="size-6" />
    </span>
  )
}

/** A voice note attached to the payment, with its player. One another phone uploaded is downloaded the first time. */
function VoiceLine({ file }: { file: Attachment }) {
  const [fetched, setFetched] = useState<Blob>()
  useEffect(() => {
    if (!file.blob) void ensureAttachmentBlob(file).then(setFetched)
  }, [file])
  return <AudioNote blob={file.blob ?? fetched} name={file.name} />
}

/** A document (PDF, Word, Excel ...) attached to the payment: its name and size, and it opens (a PDF in a new tab) or saves. One another phone uploaded is downloaded the first time. */
function DocumentLine({ file }: { file: Attachment }) {
  const { t } = useApp()
  const [fetched, setFetched] = useState<Blob>()
  useEffect(() => {
    if (!file.blob) void ensureAttachmentBlob(file).then(setFetched)
  }, [file])
  const blob = file.blob ?? fetched
  const url = useObjectUrl(blob)
  const mime = attachmentMime(file)
  // A PDF or a plain text file is read in the browser; Word, Excel and the rest are saved, which is what a phone then opens them with.
  const inTab = mime === 'application/pdf' || mime === 'text/plain'
  return (
    <li>
      {url ? (
        <a
          href={url}
          {...(inTab ? { target: '_blank', rel: 'noopener noreferrer' } : { download: file.name })}
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm transition-colors hover:bg-accent"
        >
          <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate font-semibold">{file.name}</span>
          {blob && <span className="tabular shrink-0 text-muted-foreground">{fileSize(blob.size)}</span>}
          <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </a>
      ) : (
        <span className="flex min-h-11 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground">
          <FileText aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="sr-only">{t('files.loading')}</span>
        </span>
      )}
    </li>
  )
}

/**
 * Read-only payment details. Selecting a payment opens this side drawer while editing remains a separate,
 * permission-gated action in the payment list.
 */
export function PaymentDetails({ payment, onClose }: { payment?: Payment; onClose: () => void }) {
  const { t, lang, project, phaseName, can, membersOf } = useApp()
  const members = membersOf(project?.id)
  const vendors = useVendors(project?.id)
  const phases = usePhases(project?.id)
  const contracts = useContracts(project?.id)
  const files = useAttachments(payment?.id)
  // The last payment is kept while the sheet slides away, so it does not empty first.
  const last = useRef<Payment | undefined>(undefined)
  if (payment) last.current = payment
  const p = payment ?? last.current

  const vendor = p?.vendorId ? vendors.find((v) => v.id === p.vendorId)?.name : undefined
  const who = vendor || p?.payeeName || ''
  const phase = p?.phaseId ? phases.find((x) => x.id === p.phaseId) : undefined
  const contract = p?.contractId ? contracts.find((c) => c.id === p.contractId)?.title : undefined
  const proofs = files.filter((f) => f.blob && isPictureOrVideo(f))
  const voices = files.filter((f) => isAudio(f))
  const documents = files.filter((f) => !isPictureOrVideo(f) && !isAudio(f))

  return (
    <Drawer open={Boolean(payment)} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-lg font-semibold">{t('pay.details')}</DrawerTitle>
          <DrawerDescription className="sr-only">{p?.purpose ?? t('pay.details')}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="grid content-start gap-4 p-4 sm:p-5">
          {p && (
            <>
          <div className="flex items-start justify-between gap-3">
            <div className="grid min-w-0 gap-1">
              <p className="text-lg leading-snug font-semibold [overflow-wrap:anywhere]">{p.purpose}</p>
              <StatusPill payment={p} />
            </div>
            <p className="tabular shrink-0 text-xl font-bold whitespace-nowrap">{money(p.amount)}</p>
          </div>

          <ApprovalNotice payment={p} actions={false} />

          <dl>
            <Row label={t('pay.date')}>
              <span className="tabular">{formatDate(p.date, lang)}</span>
            </Row>
            {phase && <Row label={t('pay.phase')}>{phaseName(phase)}</Row>}
            {who && <Row label={t('ledger.vendor')}>{who}</Row>}
            <Row label={t('pay.category')}>{[t(`cat.${p.category}` as Key), p.category === 'misc' && p.miscType ? t(`misc.${p.miscType}` as Key) : ''].filter(Boolean).join(' · ')}</Row>
            {hasQuantity(p) && <Row label={t('mat.quantity')}>{t('mat.at', { qty: num(p.quantity), unit: t(`unit.${p.unit}` as Key), rate: moneyRate(rateOf(p)) })}</Row>}
            <Row label={t('ledger.mode')}>{t(p.mode === 'cash' ? 'mode.cash' : 'mode.bank')}</Row>
            {p.mode === 'bank' && p.bankName && <Row label={t('pay.bankName')}>{p.bankName}</Row>}
            {p.mode === 'bank' && p.bankAccount && (
              <Row label={t('pay.bankAccount')}>
                <span dir="ltr" className="tabular">
                  {can('viewBankDetails') ? p.bankAccount : '••••••••'}
                </span>
              </Row>
            )}
            {p.mode === 'bank' && p.bankRef && (
              <Row label={t('pay.bankRef')}>
                <span dir="ltr" className="tabular">
                  {can('viewBankDetails') ? p.bankRef : '••••••••'}
                </span>
              </Row>
            )}
            <Row label={t('pay.paidBy')}>{payerLabel(p.paidBy, members, t)}</Row>
            {p.projectCashAmount !== undefined && p.projectCashAmount !== null && (
              <Row label={t('cash.source')}>
                {p.projectCashAmount <= 0
                  ? t('cash.own')
                  : p.projectCashAmount >= p.amount
                    ? t('cash.project')
                    : t('cash.splitDetail', { project: money(p.projectCashAmount), own: money(p.amount - p.projectCashAmount) })}
              </Row>
            )}
            {p.addedBy && <Row label={t('pay.addedBy')}>{p.addedBy}</Row>}
            {contract && <Row label={t('pay.contract')}>{contract}</Row>}
            {p.note && <Row label={t('pay.note')}>{p.note}</Row>}
          </dl>

          {(proofs.length > 0 || documents.length > 0 || voices.length > 0) && (
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold">{t('pay.receipts')}</h3>
              {proofs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {proofs.map((f) => (
                    <Proof key={f.id} file={f} />
                  ))}
                </div>
              )}
              {voices.length > 0 && (
                <ul className="grid gap-1.5">
                  {voices.map((f) => (
                    <VoiceLine key={f.id} file={f} />
                  ))}
                </ul>
              )}
              {documents.length > 0 && (
                <ul className="grid gap-1.5">
                  {documents.map((f) => (
                    <DocumentLine key={f.id} file={f} />
                  ))}
                </ul>
              )}
            </div>
          )}
            </>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
