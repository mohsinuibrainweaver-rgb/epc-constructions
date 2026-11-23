// What a payment's attachments may be: photos (shrunk on the phone), short videos, voice notes and documents such as PDF, Word and Excel (all but photos are kept as they are).
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
  // documents
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/rtf': 'rtf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  // voice notes (WhatsApp saves them as .ogg or .opus)
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/webm': 'weba',
  'audio/amr': 'amr',
}

/** Other names systems give the same type; they are read as the one in the table above. */
const MIME_ALIAS: Record<string, string> = {
  'audio/mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-opus+ogg': 'audio/ogg',
  'application/ogg': 'audio/ogg',
  'audio/x-ogg': 'audio/ogg',
}

/** A content type in lower case, without its parameters ("; codecs=opus"), and with the alias replaced. */
export const normalizeMime = (mime: string | undefined | null): string => {
  const m = (mime ?? '').toLowerCase().split(';')[0].trim()
  return MIME_ALIAS[m] ?? m
}

// The type for an extension: the reverse of the table above, plus the spellings that share a type.
const MIME_BY_EXT: Record<string, string> = {
  ...Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m])),
  jpeg: 'image/jpeg',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
  oga: 'audio/ogg',
  mpga: 'audio/mpeg',
  wave: 'audio/wav',
}

/** The documents a payment may carry, by extension. Anything that could run (an app, a script, a web page) is left out on purpose. */
export const DOCUMENT_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'rtf', 'txt', 'csv', 'zip'] as const

/** Voice notes, by extension: WhatsApp (ogg, opus), phone recorders (m4a, aac, amr, wav, webm audio) and MP3. */
export const AUDIO_EXTS = ['ogg', 'oga', 'opus', 'mp3', 'm4a', 'aac', 'wav', 'weba', 'amr'] as const

/** For the file picker and for drag and drop and paste (the same string works for all three): photos, videos, voice notes and the documents above. */
export const PAYMENT_ACCEPT = ['image/*', 'video/*', 'audio/*', ...DOCUMENT_EXTS.flatMap((e) => [MIME_BY_EXT[e], `.${e}`]), ...AUDIO_EXTS.map((e) => `.${e}`)].join(',')

export const isVideoType = (mime: string | undefined | null): boolean => !!mime && mime.toLowerCase().startsWith('video/')

/** The file extension for a type, with "jpg" for anything not known (the receipt photos that existed before videos were all JPEG). */
export const extForMime = (mime: string | undefined | null): string => EXT_BY_MIME[normalizeMime(mime)] ?? 'jpg'

/** The type a stored file name or storage path implies, for a download that arrives with no type. Undefined when the extension is not one we know. */
export function mimeForPath(path: string | undefined | null): string | undefined {
  const ext = (path ?? '').split('?')[0].split('.').pop()?.toLowerCase()
  return ext ? MIME_BY_EXT[ext] : undefined
}

export const isImageType = (mime: string | undefined | null): boolean => !!mime && mime.toLowerCase().startsWith('image/')

/** A voice note or other sound, by its content type. */
export const isAudioType = (mime: string | undefined | null): boolean => normalizeMime(mime).startsWith('audio/')

/** The extension at the end of a file name, in lower case ("" when there is none). */
export const extOfName = (name: string | undefined | null): string => /\.([A-Za-z0-9]{1,8})$/.exec(name ?? '')?.[1]?.toLowerCase() ?? ''

/** A document type by its content type (what the system says a file is, when its name does not end in the extension). */
export const isDocumentType = (mime: string | undefined | null): boolean => !!mime && DOCUMENT_EXTS.some((e) => MIME_BY_EXT[e] === normalizeMime(mime))

/** A document (PDF, Word, Excel ...) as opposed to a photo or a video, judged by its name. */
export const isDocumentName = (name: string | undefined | null): boolean => (DOCUMENT_EXTS as readonly string[]).includes(extOfName(name))

/** A voice note (ogg, opus, mp3, m4a ...) as opposed to a photo, a video or a document, judged by its name. */
export const isAudioName = (name: string | undefined | null): boolean => (AUDIO_EXTS as readonly string[]).includes(extOfName(name))

/** What an attachment is: from the file itself, else from its name or storage path. A photo from before documents existed has neither a name with a known type nor a type, and is a JPEG. */
export function attachmentMime(a: { name?: string | null; path?: string | null; blob?: Blob | null }): string {
  return a.blob?.type || mimeForPath(a.name) || mimeForPath(a.path) || 'image/jpeg'
}

/** True for a photo or a video (they show as a picture); false for a document. */
export function isPictureOrVideo(a: { name?: string | null; path?: string | null; blob?: Blob | null }): boolean {
  const m = attachmentMime(a)
  return isImageType(m) || isVideoType(m)
}

/** The extension to store a file under: its own when it is a type we know, else the one its type implies. */
export function storageExt(a: { name?: string | null; blob?: Blob | null }): string {
  const own = extOfName(a.name)
  return own in MIME_BY_EXT ? own : extForMime(a.blob?.type)
}

/** A name that is safe to keep and to save as: no folder marks or characters a system refuses, and not too long (the end, with its extension, stays). */
export function cleanFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 120) return cleaned
  const ext = extOfName(cleaned)
  return ext ? `${cleaned.slice(0, 119 - ext.length)}.${ext}` : cleaned.slice(0, 120)
}

/** True for a voice note. */
export function isAudio(a: { name?: string | null; path?: string | null; blob?: Blob | null }): boolean {
  return isAudioType(attachmentMime(a))
}
