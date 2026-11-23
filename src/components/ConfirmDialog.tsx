import { useLayoutEffect, useRef } from 'react'
import { AlertDialog } from 'radix-ui'
import { useApp } from '@/app/AppContext'
import { Button } from '@/components/ui/button'

/**
 * "Are you sure?" before something that is hard to take back (removing a phase) or that changes how it is counted (marking it complete,
 * reopening it). `destructive` makes the confirming button red. It is an alert dialog, so a screen reader announces it as one and the focus starts on
 * Cancel (the safe choice); Escape or a tap outside cancels.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useApp()
  // Remember what had the focus when the box opened, and give it back when the box closes. If that is gone (the thing was deleted),
  // the focus goes to the page's main area rather than falling to the top of the page.
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  }, [open])
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <AlertDialog.Content
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            const el = opener.current
            ;(el && el.isConnected ? el : document.getElementById('main'))?.focus()
          }}
          className="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none sm:max-w-md">
          <div className="grid gap-2">
            <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
            <AlertDialog.Description className="text-muted-foreground">{description}</AlertDialog.Description>
          </div>
          <div className="flex flex-wrap justify-end gap-2 max-sm:[&>*]:grow max-sm:[&>*]:basis-[calc(50%-0.25rem)]">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
