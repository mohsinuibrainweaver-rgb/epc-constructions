import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const KEY = 'epc.theme'
const listeners = new Set<() => void>()

/** What the person chose. It is kept on this device (a phone and a laptop may differ) and applied before the page paints. */
export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

const systemDark = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

export function resolveTheme(pref: ThemePref = getThemePref()): ResolvedTheme {
  return pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref
}

/** Puts the theme on the page: the `dark` class, the browser's own controls, and the colour of the browser bar. */
export function applyTheme(): void {
  const dark = resolveTheme() === 'dark'
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0a0a' : '#f5f5f5')
  listeners.forEach((l) => l())
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    /* private mode: the choice lasts until the page closes */
  }
  applyTheme()
}

// "System" follows the phone or computer, including when it switches at sunset.
if (typeof matchMedia === 'function') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme()
  })
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useTheme(): { pref: ThemePref; resolved: ResolvedTheme } {
  const pref = useSyncExternalStore(subscribe, getThemePref, () => 'system' as ThemePref)
  const resolved = useSyncExternalStore(subscribe, () => resolveTheme(), () => 'light' as ResolvedTheme)
  return { pref, resolved }
}
