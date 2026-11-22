import { FileText, Loader2, Play, X } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { fileSize } from '@/lib/format'
import { useObjectUrl } from '@/lib/image'
import { isVideoType } from '@/lib/media'
import { cn } from '@/lib/utils'

/**
 * What fills a tile: the picture for a photo, or the first frame of a video with a play badge on it. Decoration only: the name and the
 * button around it say what it is. `url` is an object URL of `blob`.
 */
export function MediaPreview({ url, blob, className, playSize = 'md' }: { url: string; blob?: Blob; className?: string; playSize?: 'sm' | 'md' }) {
  if (!isVideoType(blob?.type)) return <img src={url} alt="" loading="lazy" className={cn('size-full object-cover', className)} />
  return (
    <>
      {/* #t=0.1 asks for a frame just after the start, so the tile is not black while the video loads */}
      <video src={`${url}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} className={cn('size-full object-cover', className)} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
        <span className={cn('grid place-items-center rounded-full bg-black/65 text-white shadow-sm', playSize === 'sm' ? 'size-8' : 'size-10')}>
          <Play className="size-4 translate-x-px fill-current" />
        </span>
      </span>
    </>
  )
}

/** A small picture (or video frame) of a file that was just added or is already stored, with a button to take it away. */
export function FileThumb({
  blob,
  name,
  loading,
  removeLabel,
  onRemove,
}: {
  blob?: Blob
  /** Shown as a tooltip. The picture itself is decorative. */
  name?: string
  /** True while the picture is still being fetched. */
  loading?: boolean
  removeLabel: string
  onRemove: () => void
}) {
  const url = useObjectUrl(blob)
  return (
    <div title={name} className="relative size-20 overflow-hidden rounded-lg border bg-muted">
      {url ? (
        <MediaPreview url={url} blob={blob} playSize="sm" />
      ) : (
        loading !== false && <Loader2 aria-hidden="true" className="absolute inset-0 m-auto size-5 animate-spin text-muted-foreground" />
      )}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="absolute inset-e-1 top-1 grid size-6 place-items-center rounded-control bg-black/70 text-white transition-colors outline-none hover:bg-black focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

/** A line for a file that is not a picture: its name and size, with a button to take it away. */
export function FileChip({ name, size, removeLabel, onRemove }: { name: string; size: number; removeLabel: string; onRemove: () => void }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 py-1.5 ps-3 pe-1.5 text-sm">
      <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
      <span className="tabular shrink-0 text-muted-foreground">{fileSize(size)}</span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="grid size-7 shrink-0 place-items-center rounded-control text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  )
}

/** The files chosen so far: pictures as thumbnails, everything else as a line each. */
export function PickedFiles({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  const { t } = useApp()
  if (files.length === 0) return null
  const pictures = files.map((f, i) => ({ f, i })).filter(({ f }) => f.type.startsWith('image/'))
  const others = files.map((f, i) => ({ f, i })).filter(({ f }) => !f.type.startsWith('image/'))
  return (
    <div className="grid gap-2">
      {pictures.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pictures.map(({ f, i }) => (
            <FileThumb key={`${f.name}-${f.size}-${i}`} blob={f} name={f.name} removeLabel={t('drop.remove', { name: f.name })} onRemove={() => onRemove(i)} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <ul className="grid gap-1.5">
          {others.map(({ f, i }) => (
            <FileChip key={`${f.name}-${f.size}-${i}`} name={f.name} size={f.size} removeLabel={t('drop.remove', { name: f.name })} onRemove={() => onRemove(i)} />
          ))}
        </ul>
      )}
    </div>
  )
}
