import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'

type Kind = 'success' | 'info' | 'warning' | 'error'

export interface ToastOptions {
  kind: Kind
  message: string
  actionLabel?: string
  onAction?: () => void
  /** milliseconds; 0 keeps it until dismissed. Defaults: success 4s, info 5s, warning and error stay. */
  duration?: number
}

const DEFAULT_MS: Record<Kind, number> = { success: 4000, info: 5000, warning: 0, error: 0 }

const Ctx = createContext<{ show: (o: ToastOptions) => string | number; dismiss: (id: string | number) => void } | null>(null)

function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 599px)').matches)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 599px)')
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}

/** Messages follow the plan: above the tab bar on phones, top corner on laptops, screen readers announce them. */
export function ToastProvider({ children, dismissLabel, rtl }: { children: ReactNode; dismissLabel: string; rtl: boolean }) {
  const phone = useIsPhone()
  const value = useMemo(
    () => ({
      show: (o: ToastOptions) => {
        const ms = o.duration ?? DEFAULT_MS[o.kind]
        const fn = o.kind === 'success' ? toast.success : o.kind === 'info' ? toast.info : o.kind === 'warning' ? toast.warning : toast.error
        return fn(o.message, {
          duration: ms === 0 ? Infinity : ms,
          closeButton: ms === 0,
          action: o.actionLabel ? { label: o.actionLabel, onClick: () => o.onAction?.() } : undefined,
        })
      },
      dismiss: (id: string | number) => {
        toast.dismiss(id)
      },
    }),
    [],
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      <Toaster
        position={phone ? 'bottom-center' : 'top-right'}
        mobileOffset={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
        visibleToasts={3}
        dir={rtl ? 'rtl' : 'ltr'}
        containerAriaLabel={dismissLabel}
        toastOptions={{ classNames: { actionButton: '!bg-primary !text-primary-foreground !font-semibold' } }}
      />
    </Ctx.Provider>
  )
}

export function useToast() {
  const c = useContext(Ctx)
  if (!c) throw new Error('ToastProvider missing')
  return c
}
