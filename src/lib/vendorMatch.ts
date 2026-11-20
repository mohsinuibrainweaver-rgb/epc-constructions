/**
 * Finds a vendor whose name is written inside a piece of text ("Ihtisham wood work", "plumber payment (Ehsan)").
 * Used on Add payment: people often type the vendor's name into the purpose instead of choosing the vendor, and then
 * the vendor's total and statement miss that payment.
 *
 * Only a whole name counts, as whole words, so "Ali" is not found inside "Malik" or "Salim", and a name shorter than
 * three letters is never matched. When several vendors match, the one with the longest name wins.
 */
const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

const contains = (text: string[], name: string[]): boolean => {
  if (name.length === 0 || name.length > text.length) return false
  for (let i = 0; i + name.length <= text.length; i++) if (name.every((w, j) => text[i + j] === w)) return true
  return false
}

export function matchVendor<T extends { id: string; name: string }>(text: string, vendors: readonly T[]): T | undefined {
  const t = words(text)
  if (t.length === 0) return undefined
  let best: { vendor: T; len: number } | undefined
  for (const v of vendors) {
    const n = words(v.name)
    const len = n.join('').length
    if (len < 3 || !contains(t, n)) continue
    if (!best || len > best.len) best = { vendor: v, len }
  }
  return best?.vendor
}
