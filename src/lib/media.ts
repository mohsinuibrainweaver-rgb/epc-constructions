// What a payment's attachments may be: photos (shrunk on the phone) and short videos (kept as they are).
// Free of React so it can be checked on its own (scripts/media-test.ts).

/** The largest single file taken for a payment. A phone video of about a minute at normal quality fits. It is below the 50 MB upload limit of a free Supabase project. */
export const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
  'video/x-m4v': 'm4v',
}

const MIME_BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]))

export const isVideoType = (mime: string | undefined | null): boolean => !!mime && mime.toLowerCase().startsWith('video/')

/** The file extension for a type, with "jpg" for anything not known (the receipt photos that existed before videos were all JPEG). */
export const extForMime = (mime: string | undefined | null): string => EXT_BY_MIME[(mime ?? '').toLowerCase().split(';')[0].trim()] ?? 'jpg'

/** The type a stored file name or storage path implies, for a download that arrives with no type. Undefined when the extension is not one we know. */
export function mimeForPath(path: string | undefined | null): string | undefined {
  const ext = (path ?? '').split('?')[0].split('.').pop()?.toLowerCase()
  return ext ? MIME_BY_EXT[ext] : undefined
}
