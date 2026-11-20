import { useEffect, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Field } from '@/components/common'
import { Dropdown } from '@/components/ui/dropdown'
import { Input } from '@/components/ui/input'
import { BANKS } from '@/lib/bank'

const OTHER = '__other'

/**
 * Choosing a bank: the app's scrollable drop-down with the common banks and wallets, and "Other bank..." at the end,
 * which opens a text box for any name. A bank that is already saved but not on the list (typed earlier) shows as "Other"
 * with its name in the box, so nothing is lost.
 */
export function BankSelect({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (name: string) => void }) {
  const { t } = useApp()
  const known = (BANKS as readonly string[]).includes(value)
  const [typing, setTyping] = useState(false)
  // Once the typed name is one of the listed banks, the list shows it and the text box goes away.
  useEffect(() => {
    if (known) setTyping(false)
  }, [known])
  const other = typing || (value.trim() !== '' && !known)

  return (
    <div className="grid content-start gap-4">
      <Field label={label} htmlFor={id}>
        <Dropdown
          value={other ? OTHER : value}
          onChange={(e) => {
            const v = e.target.value
            if (v === OTHER) {
              setTyping(true)
              if (known) onChange('')
            } else {
              setTyping(false)
              onChange(v)
            }
          }}
        >
          <option value="">{t('bank.choose')}</option>
          {BANKS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
          <option value={OTHER}>{t('bank.other')}</option>
        </Dropdown>
      </Field>
      {other && (
        <Field label={t('bank.otherName')} htmlFor={`${id}-other`}>
          <Input value={known ? '' : value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
        </Field>
      )}
    </div>
  )
}
