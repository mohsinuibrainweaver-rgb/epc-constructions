import { useEffect, useRef, useState } from 'react'

/** The width of an element, kept up to date, for charts drawn at the size of their box. */
export function useElementWidth<T extends HTMLElement>(initial = 320, min = 240): { ref: React.RefObject<T | null>; width: number } {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setWidth(Math.max(min, Math.round(el.clientWidth)))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [min])
  return { ref, width }
}
