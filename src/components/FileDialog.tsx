import { useEffect, useState } from 'react'
import { Camera, FileUp } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field, GroupField } from '@/components/common'
import { FileDropzone } from '@/components/FileDropzone'
import { PickedFiles } from '@/components/FilePreview'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { Textarea } from '@/components/ui/textarea'
import { addFiles, updateFile } from '@/db/actions'
import { usePhases } from '@/db/hooks'
import { DOC_TYPES, MAX_FILE_BYTES, type DocType, type FileKind, type ProjectFile } from '@/db/types'
import type { Key } from '@/i18n/en'
import { todayISO } from '@/lib/format'
import { compressImage } from '@/lib/image'

const DOC_ACCEPT = 'application/pdf,image/*,.doc,.docx,.xls,.xlsx'

/** Adds photos or documents (several at once), or edits the details of one that is already stored. */
export function FileDialog({
  open,
  file,
  defaultKind,
  defaultPhaseId,
  onClose,
}: {
  open: boolean
  file?: ProjectFile
  defaultKind: FileKind
  defaultPhaseId?: string
  onClose: () => void
}) {
  const { t, project, phaseName } = useApp()
  const toast = useToast()
  const phases = usePhases(project?.id)
  const [kind, setKind] = useState<FileKind>(defaultKind)
  const [picked, setPicked] = useState<File[]>([])
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState<DocType>('other')
  const [phaseId, setPhaseId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setKind(file?.kind ?? defaultKind)
    setPicked([])
    setTitle(file?.title ?? '')
    setDocType(file?.docType ?? 'other')
    setPhaseId(file?.phaseId ?? defaultPhaseId ?? '')
    setDate(file?.date ?? todayISO())
    setNote(file?.note ?? '')
    setError('')
    setBusy(false)
  }, [open, file, defaultKind, defaultPhaseId])

  const submit = async () => {
    if (!project || busy) return
    if (file) {
      if (!title.trim()) {
        setError(t('files.errTitle'))
        return
      }
      await updateFile(file.id, { title, docType: file.kind === 'document' ? docType : undefined, phaseId, date: date || todayISO(), note })
      toast.show({ kind: 'success', message: t('files.saved') })
      onClose()
      return
    }
    const usable = picked.filter((f) => {
      if (f.size > MAX_FILE_BYTES) {
        toast.show({ kind: 'warning', message: t('files.tooBig', { name: f.name }) })
        return false
      }
      return true
    })
    if (usable.length === 0) {
      setError(t('files.errNone'))
      return
    }
    setBusy(true)
    try {
      const items = await Promise.all(
        usable.map(async (f) => ({
          name: f.name,
          // Photos are shrunk on the phone; documents are kept exactly as they are.
          blob: kind === 'photo' ? await compressImage(f) : f,
        })),
      )
      await addFiles(project.id, kind, items, { title, docType, phaseId, date: date || todayISO(), note })
      toast.show({ kind: 'success', message: t('files.saved') })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const activeKind = file?.kind ?? kind
  const Icon = activeKind === 'photo' ? Camera : FileUp

  return (
    <Dialog
      open={open}
      title={file ? t('files.edit') : t('files.add')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {!file && (
          <>
            <GroupField label={t('files.kind')}>
              {(labelId) => (
                <PillRadioGroup
                  aria-labelledby={labelId}
                  value={kind}
                  onValueChange={(v) => {
                    setKind(v as FileKind)
                    setPicked([])
                  }}
                >
                  <PillRadioItem value="photo">{t('files.photos')}</PillRadioItem>
                  <PillRadioItem value="document">{t('files.documents')}</PillRadioItem>
                </PillRadioGroup>
              )}
            </GroupField>
            <FileDropzone
              key={kind}
              accept={kind === 'photo' ? 'image/*' : DOC_ACCEPT}
              multiple
              maxBytes={MAX_FILE_BYTES}
              icon={Icon}
              browseLabel={kind === 'photo' ? t('files.pickPhoto') : t('files.pick')}
              onFiles={(files) => {
                setPicked((xs) => [...xs, ...files])
                setError('')
              }}
            >
              <PickedFiles files={picked} onRemove={(i) => setPicked((xs) => xs.filter((_, at) => at !== i))} />
              {error && (
                <div role="alert" className="text-sm font-semibold text-danger">
                  {error}
                </div>
              )}
            </FileDropzone>
          </>
        )}

        <Field label={t('files.titleField')} hint={file ? undefined : t('files.titleHint')} error={file ? error : undefined}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
        </Field>

        {activeKind === 'document' && (
          <Field label={t('files.docType')}>
            <Dropdown value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
              {DOC_TYPES.map((d) => (
                <option key={d} value={d}>
                  {t(`ftype.${d}` as Key)}
                </option>
              ))}
            </Dropdown>
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('files.phase')}>
            <Dropdown value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
              <option value="">{t('files.noPhase')}</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {phaseName(p)}
                </option>
              ))}
            </Dropdown>
          </Field>
          <Field label={t('files.date')}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t('files.note')}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}
