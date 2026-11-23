import { FileText, Loader2, Mic, Play, Repeat, X } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Button } from '@/components/ui/button'
import { canPlayAudio, isMp3 } from '@/lib/audio'
import { fileSize } from '@/lib/format'
import { useObjectUrl } from '@/lib/image'
import { isVideoType, mimeForPath } from '@/lib/media'
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
export function FileChip({ name, size, removeLabel, onRemove }: { name: string; size?: number; removeLabel: string; onRemove: () => void }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 py-1.5 ps-3 pe-1.5 text-sm">
      <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
      {size ? <span className="tabular shrink-0 text-muted-foreground">{fileSize(size)}</span> : null}
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

/** Stops the other voice notes when one starts, so two never talk over each other. */
const pauseOthers = (e: React.SyntheticEvent<HTMLAudioElement>) => {
  document.querySelectorAll('audio').forEach((a) => {
    if (a !== e.currentTarget) a.pause()
  })
}

/**
 * A voice note: its name and size, a player to listen to it (before it is saved too), and, when it is not an MP3, a button that turns it into one
 * (an MP3 plays on every phone; WhatsApp's .ogg does not on some). `onRemove` and `onConvert` are left out where the note can only be listened to.
 */
export function AudioNote({
  blob,
  name,
  removeLabel,
  onRemove,
  onConvert,
}: {
  blob?: Blob
  name: string
  removeLabel?: string
  onRemove?: () => void
  /** Converts the note to MP3 and replaces it. May throw; the caller says what went wrong. */
  onConvert?: () => Promise<void>
}) {
  const { t } = useApp()
  const url = useObjectUrl(blob)
  const [converting, setConverting] = useState(false)
  const mime = blob?.type || mimeForPath(name) || ''
  const playable = canPlayAudio(mime)
  return (
    <li className="grid min-w-0 gap-2 rounded-lg border bg-muted/40 p-2 ps-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Mic aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
        {blob ? <span className="tabular shrink-0 text-muted-foreground">{fileSize(blob.size)}</span> : null}
        {onRemove && (
          <button
            type="button"
            aria-label={removeLabel}
            onClick={onRemove}
            className="grid size-7 shrink-0 place-items-center rounded-control text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {!url ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          {t('files.loading')}
        </p>
      ) : playable ? (
        <audio controls preload="metadata" src={url} aria-label={name} onPlay={pauseOthers} className="h-10 w-full" />
      ) : (
        <p className="text-muted-foreground">{t('audio.cantPlay')}</p>
      )}
      {onConvert && blob && !isMp3(name, blob.type) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={converting}
            onClick={async () => {
              setConverting(true)
              try {
                await onConvert()
              } finally {
                setConverting(false)
              }
            }}
          >
            {converting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Repeat aria-hidden="true" />}
            {converting ? t('audio.converting') : t('audio.convert')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('audio.convertHint')}</span>
        </div>
      )}
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
