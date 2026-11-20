import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Download } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteProject, exportBackup } from '@/db/actions'
import type { Project } from '@/db/types'
import { download } from '@/lib/format'
import { useSync } from '@/sync/SyncProvider'

/**
 * Deleting a project: says what happens, offers a backup file first, and asks for the project name to be typed.
 * The backup is an offer, not a rule: deleting stays possible without it.
 */
export function DeleteProjectDialog({ open, project, onClose }: { open: boolean; project: Project; onClose: () => void }) {
  const { t } = useApp()
  const toast = useToast()
  const nav = useNavigate()
  const sync = useSync()
  const [name, setName] = useState('')
  const [backedUp, setBackedUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const shared = sync.configured && Boolean(sync.session)

  useEffect(() => {
    if (!open) return
    setName('')
    setBackedUp(false)
    setBusy(false)
  }, [open])

  const backup = async () => {
    setBusy(true)
    try {
      download(`epc-construction-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup(), 'application/json')
      setBackedUp(true)
    } catch {
      toast.show({ kind: 'error', message: t('set.del.backupFailed') })
    }
    setBusy(false)
  }

  const remove = async () => {
    setBusy(true)
    await deleteProject(project.id)
    toast.show({ kind: 'info', message: t('set.projectDeleted') })
    onClose()
    nav('/welcome')
  }

  return (
    <Dialog
      open={open}
      title={t('set.del.title', { name: project.name })}
      description={t(shared ? 'set.del.bodyShared' : 'set.del.body')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" disabled={busy || name !== project.name} onClick={() => void remove()}>
            {t('set.deleteProject')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-2 rounded-lg border bg-muted/40 p-3">
          <p className="text-sm font-semibold">{t('set.del.backupTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('set.del.backupHelp')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" className="w-fit" disabled={busy} onClick={() => void backup()}>
              <Download aria-hidden="true" />
              {t('set.exportJson')}
            </Button>
            {backedUp && (
              <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                <Check aria-hidden="true" className="size-4" />
                {t('set.del.backedUp')}
              </span>
            )}
          </div>
        </div>
        <Field label={`${t('set.deleteConfirm')}: ${project.name}`}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
      </div>
    </Dialog>
  )
}
