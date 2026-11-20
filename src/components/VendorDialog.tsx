import { useEffect, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Dialog, Field } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { Textarea } from '@/components/ui/textarea'
import { saveVendor } from '@/db/actions'
import { VENDOR_ROLES, type Vendor, type VendorRole } from '@/db/types'
import type { Key } from '@/i18n/en'

export function VendorDialog({
  open,
  vendor,
  onClose,
  onSaved,
}: {
  open: boolean
  vendor?: Vendor
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { t, project } = useApp()
  const toast = useToast()
  const [name, setName] = useState('')
  const [role, setRole] = useState<VendorRole>('other')
  const [phone, setPhone] = useState('')
  const [bank, setBank] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(vendor?.name ?? '')
    setRole(vendor?.role ?? 'other')
    setPhone(vendor?.phone ?? '')
    setBank(vendor?.bankAccount ?? '')
    setNotes(vendor?.notes ?? '')
    setError('')
  }, [open, vendor])

  const submit = async () => {
    if (!name.trim()) {
      setError(t('vendors.nameRequired'))
      return
    }
    if (!project) return
    const id = await saveVendor({
      id: vendor?.id,
      projectId: vendor?.projectId ?? project.id,
      name: name.trim(),
      role,
      phone: phone.trim() || undefined,
      bankAccount: bank.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    toast.show({ kind: 'success', message: t('vendors.saved') })
    onSaved?.(id)
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={vendor ? t('vendors.edit') : t('vendors.new')}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()}>
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
        <Field label={t('vendors.name')} error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field label={t('vendors.role')}>
          <Dropdown value={role} onChange={(e) => setRole(e.target.value as VendorRole)}>
            {VENDOR_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}` as Key)}
              </option>
            ))}
          </Dropdown>
        </Field>
        <Field label={t('vendors.phone')}>
          <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t('vendors.account')}>
          <Input value={bank} onChange={(e) => setBank(e.target.value)} />
        </Field>
        <Field label={t('vendors.notes')}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}
