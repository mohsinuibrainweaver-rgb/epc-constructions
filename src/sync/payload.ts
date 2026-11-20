type Row = Record<string, unknown>

/**
 * Rows sent in one request are written as a batch, and PostgREST treats a column that one row leaves out as NULL as soon as another
 * row in the same batch has it. A column that was never set is left out on purpose (so an older server keeps syncing), but a
 * column that cannot be NULL on the server then fails the whole batch. For those columns, a row that left the column out gets the
 * column's default when another row in the batch has it. Columns without a default are left alone: NULL is right for them.
 */
export function fillDefaults(rows: Row[], defaults: Row | undefined): Row[] {
  if (!defaults || rows.length < 2) return rows
  const present = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r)) present.add(k)
  const needed = Object.keys(defaults).filter((k) => present.has(k))
  if (needed.length === 0) return rows
  return rows.map((r) => {
    const missing = needed.filter((k) => !(k in r))
    return missing.length === 0 ? r : { ...r, ...Object.fromEntries(missing.map((k) => [k, defaults[k]])) }
  })
}
