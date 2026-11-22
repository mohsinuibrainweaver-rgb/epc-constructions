// Sorting a table by a column on the page. Kept free of React so it can be checked on its own (scripts/sort-test.ts).

export type SortDir = 'asc' | 'desc'
export type SortState<K extends string> = { key: K; dir: SortDir } | null

/** What a click on a column heading does: first click sorts up, second sorts down, third goes back to the order the page came in. */
export function nextSort<K extends string>(cur: SortState<K>, key: K): SortState<K> {
  if (!cur || cur.key !== key) return { key, dir: 'asc' }
  return cur.dir === 'asc' ? { key, dir: 'desc' } : null
}

type Value = string | number | null | undefined
const missing = (v: Value): boolean => v === null || v === undefined || v === ''

/**
 * A new array in the chosen order (the one given is left alone). Numbers sort as numbers and text by the reader's language, with digits read as numbers
 * ("Plot 2" before "Plot 10"). A row with no value in that column always comes last, whichever way the column is sorted. Rows that tie keep their order.
 */
export function sortRows<T, K extends string>(rows: T[], sort: SortState<K>, value: (row: T, key: K) => Value, locale = 'en'): T[] {
  if (!sort) return rows
  const sign = sort.dir === 'asc' ? 1 : -1
  return rows
    .map((row, i) => ({ row, i, v: value(row, sort.key) }))
    .sort((a, b) => {
      const am = missing(a.v)
      const bm = missing(b.v)
      if (am || bm) return am && bm ? a.i - b.i : am ? 1 : -1
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), locale, { numeric: true, sensitivity: 'base' })
      return c !== 0 ? c * sign : a.i - b.i
    })
    .map((x) => x.row)
}

/** The value for the `aria-sort` attribute of a column heading. */
export const ariaSort = <K extends string>(sort: SortState<K>, key: K): 'ascending' | 'descending' | 'none' =>
  sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
