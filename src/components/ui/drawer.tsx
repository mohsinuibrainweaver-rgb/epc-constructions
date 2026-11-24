"use client"

import * as React from 'react'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

const Drawer = DialogPrimitive.Root
const DrawerTitle = DialogPrimitive.Title
const DrawerDescription = DialogPrimitive.Description

function DrawerContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 end-0 z-50 flex h-dvh w-full flex-col border-s bg-background shadow-2xl outline-none duration-300 ease-out data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right sm:max-w-xl',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DrawerHeader({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex min-h-16 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-5', className)} {...props}>
      <div className="grid min-w-0 gap-1">{children}</div>
      <DialogPrimitive.Close className="grid size-10 shrink-0 place-items-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Close">
        <X className="size-5" aria-hidden="true" />
      </DialogPrimitive.Close>
    </div>
  )
}

function DrawerBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]', className)} {...props} />
}

export { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle }
