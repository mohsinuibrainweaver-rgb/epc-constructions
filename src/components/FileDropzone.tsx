import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { CircleCheck, CloudUpload, Loader2, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Button } from '@/components/ui/button'
import { filesFromTransfer, isTextField, nameClipboardFile, sortFiles, type Rejected } from '@/lib/files'
import { cn } from '@/lib/utils'

/**
 * The one way to add files in this app. Three ways in, all going through the same checks:
 * browse (the button), drag and drop (onto the box) and paste (Ctrl+V or ⌘V anywhere on the page).
 *
 * The caller decides what happens to the files (`onFiles`) and shows what was added (`children`), so each place keeps its own rules.
 * `variant="button"` is the same thing with no box, for a place that only needs a button (such as restoring a backup).
 */

/** Zones that listen for paste, oldest first. Only the newest answers, so a dialog opened over a page gets the paste, not the page. */
const pasteOrder: symbol[] = []

export function FileDropzone({
  accept,
  onFiles,
  browseLabel,
  multiple = false,
  maxBytes,
  variant = 'zone',
  paste,
  disabled,
  icon,
  title,
  instruction,
  hint,
  lead,
  onReject,
  children,
  className,
}: {
  /** Same format as the HTML attribute: "image/*", "application/json,.json". Dropped and pasted files are held to it too. */
  accept: string
  /** Called with the files that passed the checks. While it runs the zone shows that it is working. */
  onFiles: (files: File[]) => void | Promise<void>
  /** The button's words, so each place keeps its own ("Take or choose photos", "Add receipt photo"). */
  browseLabel: string
  multiple?: boolean
  maxBytes?: number
  variant?: 'zone' | 'button'
  /** Listen for Ctrl+V / ⌘V on the page. On by default for the box, off for the plain button. */
  paste?: boolean
  disabled?: boolean
  icon?: LucideIcon
  title?: string
  /** Replaces the usual line "Drag & drop, paste an image, or browse files." */
  instruction?: string
  hint?: string
  /** Shown in place of the icon, on the left (a picture of what is there now). Lays the box out as a row. */
  lead?: ReactNode
  /** Told about files that were turned away. The box already says so itself. */
  onReject?: (rejected: Rejected[]) => void
  /** What was added: the previews. Shown under the box. */
  children?: ReactNode
  className?: string
}) {
  const { t } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const descId = useId()
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const isZone = variant === 'zone'
  const Icon = icon ?? CloudUpload
  const listenForPaste = (paste ?? isZone) && !disabled
  const imagesOnly = accept.split(',').every((a) => a.trim().startsWith('image/'))
  const compact = Boolean(lead)

  /** Everything that arrives, by any route, goes through here. */
  const take = useCallback(
    async (list: File[]) => {
      const { ok, rejected } = sortFiles(list, { accept, maxBytes, multiple })
      if (rejected.length > 0) {
        onReject?.(rejected)
        if (isZone) {
          setNote({
            kind: 'error',
            text: rejected.map((r) => (r.reason === 'size' ? t('files.tooBig', { name: r.file.name }) : t('drop.badType', { name: r.file.name }))).join(' '),
          })
        }
      } else setNote(null)
      if (ok.length === 0) return
      setLoading(true)
      try {
        await onFiles(ok)
        if (isZone && rejected.length === 0) setNote({ kind: 'ok', text: t('drop.added', { count: ok.length }) })
      } catch {
        setNote({ kind: 'error', text: t('drop.failed') })
      } finally {
        setLoading(false)
      }
    },
    [accept, maxBytes, multiple, onFiles, onReject, isZone, t],
  )
  const takeRef = useRef(take)
  takeRef.current = take

  // The "added" message fades after a moment; an error stays until the next try.
  useEffect(() => {
    if (note?.kind !== 'ok') return
    const id = setTimeout(() => setNote(null), 3500)
    return () => clearTimeout(id)
  }, [note])

  // Paste. Left alone when the page has a modal open that this zone is not part of, and when the paste is text going into a field.
  useEffect(() => {
    if (!listenForPaste) return
    const me = Symbol('dropzone')
    pasteOrder.push(me)
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || pasteOrder[pasteOrder.length - 1] !== me) return
      const modal = document.querySelector('[role="dialog"]')
      if (modal && rootRef.current && !modal.contains(rootRef.current)) return
      const files = filesFromTransfer(e.clipboardData)
      if (files.length === 0) return
      if (isTextField(e.target) && (e.target as HTMLElement).isContentEditable) return
      if (isTextField(e.target) && e.clipboardData?.getData('text/plain')) return
      e.preventDefault()
      void takeRef.current(files.map((f, i) => nameClipboardFile(f, i)))
    }
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('paste', onPaste)
      const at = pasteOrder.indexOf(me)
      if (at >= 0) pasteOrder.splice(at, 1)
    }
  }, [listenForPaste])

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
  const drag = {
    onDragEnter: (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return
      e.preventDefault()
      depth.current++
      setOver(true)
    },
    onDragOver: (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setOver(false)
    },
    onDrop: (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setOver(false)
      void take(filesFromTransfer(e.dataTransfer))
    },
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      tabIndex={-1}
      aria-hidden="true"
      className="sr-only"
      onChange={(e) => {
        const picked = Array.from(e.target.files ?? [])
        e.target.value = ''
        void take(picked)
      }}
    />
  )
  const browse = (
    <Button
      type="button"
      variant="outline"
      size={compact ? 'sm' : 'default'}
      disabled={disabled || loading}
      aria-describedby={isZone ? descId : undefined}
      onClick={() => inputRef.current?.click()}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : (isZone || icon) && <Icon aria-hidden="true" />}
      {browseLabel}
    </Button>
  )

  if (!isZone) {
    return (
      <span ref={rootRef} className={cn('inline-flex', className)}>
        {browse}
        {input}
      </span>
    )
  }

  const line = over ? t('drop.release') : loading ? t('drop.adding') : (instruction ?? (imagesOnly ? t('drop.images') : t('drop.files')))
  return (
    <div ref={rootRef} className={cn('grid gap-2', className)}>
      <div
        {...drag}
        aria-busy={loading}
        className={cn(
          'rounded-xl border-2 border-dashed px-4 py-5 transition-colors',
          compact ? 'flex items-center gap-4 text-start' : 'grid justify-items-center gap-3 text-center',
          over ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5',
          disabled && 'opacity-50',
        )}
      >
        {lead ?? (
          <span aria-hidden="true" className={cn('grid size-11 place-items-center rounded-full bg-secondary text-primary transition-transform', over && 'scale-110')}>
            {loading ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
          </span>
        )}
        <div className={cn('grid min-w-0 gap-2', compact ? 'justify-items-start' : 'justify-items-center')}>
          {title && <span className="text-sm font-semibold">{title}</span>}
          {/* Dragging and pasting mean nothing on a phone, so the line is kept for a mouse and keyboard. */}
          <p id={descId} className={cn('text-sm text-muted-foreground', !over && !loading && 'pointer-coarse:hidden', over && 'font-semibold text-primary')}>
            {line}
          </p>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          {browse}
        </div>
        {input}
      </div>
      {children}
      <div role="status" aria-live="polite" className="min-h-0 text-sm empty:hidden">
        {note && (
          <span className={cn('flex items-start gap-1.5 font-semibold', note.kind === 'error' ? 'text-danger' : 'text-success')}>
            {note.kind === 'error' ? (
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            )}
            {note.text}
          </span>
        )}
      </div>
    </div>
  )
}
