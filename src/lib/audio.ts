// Voice notes: whether this device can play one, and turning one into an MP3 (which every phone plays).
// WhatsApp saves voice notes as Opus in an .ogg (or .opus) file. Chrome, Edge, Firefox and Android play that; some phones (older iPhones)
// do not. An MP3 plays everywhere, so a voice note can be converted here, before it is saved.

import { extOfName, normalizeMime } from './media'

/** True when this device can play the type (an empty answer from the browser means no). Always false outside a browser. */
export function canPlayAudio(mime: string | undefined | null): boolean {
  if (typeof document === 'undefined') return false
  const probe = document.createElement('audio')
  const m = normalizeMime(mime)
  // Ogg files carry Opus (WhatsApp) or Vorbis; ask about the codec WhatsApp uses.
  const full = m === 'audio/ogg' || m === 'audio/opus' ? 'audio/ogg; codecs=opus' : m
  return probe.canPlayType(full) !== '' || probe.canPlayType(m) !== ''
}

/** The name with its extension replaced by .mp3 ("PTT-0001.opus" becomes "PTT-0001.mp3"). */
export function mp3Name(name: string): string {
  const ext = extOfName(name)
  const base = ext ? name.slice(0, -(ext.length + 1)) : name
  return `${base || 'voice-note'}.mp3`
}

/** A voice note that is already an MP3 needs no conversion. */
export const isMp3 = (name: string | undefined | null, mime?: string | null): boolean => extOfName(name) === 'mp3' || normalizeMime(mime) === 'audio/mpeg'

const FRAME = 1152 // samples an MP3 frame holds

/** Mono mix of the channels, as the 16-bit numbers the encoder takes. */
function toInt16Mono(channels: Float32Array[]): Int16Array {
  const length = channels[0]?.length ?? 0
  const out = new Int16Array(length)
  for (let i = 0; i < length; i++) {
    let sum = 0
    for (const c of channels) sum += c[i]
    const v = Math.max(-1, Math.min(1, sum / channels.length))
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff
  }
  return out
}

/**
 * Encodes raw sound (one array per channel, values from -1 to 1) as a mono MP3. A voice note is speech, so mono at 64 kbps sounds clear and
 * is about 0.5 MB a minute. The encoder is loaded only now, so it costs nothing until a voice note is converted.
 * `sampleRate` must be one an MP3 allows (8000 to 48000); a browser decodes to 44100 or 48000, which are.
 */
export async function encodeMp3(channels: Float32Array[], sampleRate: number, kbps = 64): Promise<Uint8Array> {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const samples = toInt16Mono(channels)
  const encoder = new Mp3Encoder(1, sampleRate, kbps)
  const parts: Uint8Array[] = []
  for (let i = 0, n = 0; i < samples.length; i += FRAME, n++) {
    const chunk = encoder.encodeBuffer(samples.subarray(i, i + FRAME))
    if (chunk.length) parts.push(chunk.slice())
    // A long note takes a moment: let the screen breathe now and then.
    if (n % 400 === 399) await new Promise((r) => setTimeout(r, 0))
  }
  const last = encoder.flush()
  if (last.length) parts.push(last.slice())
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/**
 * Turns a voice note (ogg, opus, m4a, wav ...) into an MP3 file. The browser decodes it, so this works wherever the note can be played;
 * on a device that cannot play it, it fails (and the caller keeps the original).
 */
export async function convertToMp3(file: Blob & { name?: string }, name = file.name ?? 'voice-note'): Promise<File> {
  const Ctx = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  if (!Ctx) throw new Error('no audio support')
  const ctx = new Ctx()
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer())
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i))
    const bytes = await encodeMp3(channels, decoded.sampleRate)
    return new File([bytes.buffer as ArrayBuffer], mp3Name(name), { type: 'audio/mpeg' })
  } finally {
    void ctx.close()
  }
}
