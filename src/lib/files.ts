// Rules shared by every place a file can be added: what is accepted, the size limit, and how files arrive
// (browse, drag and drop, paste). Kept free of React so it can be checked on its own (scripts/files-test.ts).

/** Some systems hand over a file with no type; fall back to the extension for the kinds the app accepts. */
const EXT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  json: 'application/json',
}

const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '')

/** True when the file matches an `accept` string such as "image/*", "application/pdf,.doc" (the same format as the HTML attribute). */
export function acceptsFile(file: { name: string; type: string }, accept?: string): boolean {
  const tokens = (accept ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (tokens.length === 0) return true
  const ext = extOf(file.name)
  const type = (file.type || EXT_TYPE[ext] || '').toLowerCase()
  return tokens.some((tok) => (tok.startsWith('.') ? tok === `.${ext}` : tok.endsWith('/*') ? type.startsWith(tok.slice(0, -1)) : tok === type))
}

export type Rejected = { file: File; reason: 'type' | 'size' }

/** Splits what was added into what is kept and what is turned away (and why). A single-file place keeps only the first good file. */
export function sortFiles(
  files: File[],
  opts: { accept?: string; maxBytes?: number; multiple?: boolean },
): { ok: File[]; rejected: Rejected[] } {
  const ok: File[] = []
  const rejected: Rejected[] = []
  for (const file of files) {
    if (!acceptsFile(file, opts.accept)) rejected.push({ file, reason: 'type' })
    else if (opts.maxBytes && file.size > opts.maxBytes) rejected.push({ file, reason: 'size' })
    else ok.push(file)
  }
  return { ok: opts.multiple ? ok : ok.slice(0, 1), rejected }
}

/** The files carried by a drop or a paste. */
export function filesFromTransfer(data: DataTransfer | null | undefined): File[] {
  if (!data) return []
  const direct = Array.from(data.files ?? [])
  if (direct.length > 0) return direct
  const out: File[] = []
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue
    const f = item.getAsFile()
    if (f) out.push(f)
  }
  return out
}

/** A screenshot or a picture copied from a chat arrives as "image.png"; give it a name that says what it is. */
export function nameClipboardFile(file: File, index: number, now = new Date()): File {
  if (file.name && !/^image\.\w+$/i.test(file.name)) return file
  const ext = extOf(file.name) || (file.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg')
  const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  return new File([file], `pasted-${stamp}${index > 0 ? `-${index + 1}` : ''}.${ext}`, { type: file.type, lastModified: file.lastModified })
}

/** A place where typing happens. A paste there is the field's own, unless the clipboard holds a file and no text. */
export function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true
  if (el.tagName !== 'INPUT') return false
  const type = (el as HTMLInputElement).type
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image'].includes(type)
}
