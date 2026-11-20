/**
 * Where "Add payment" leads from the page you are on: on a vendor's, a phase's or a contract's page it opens the form with that
 * vendor, phase or contract already chosen (the same as the button on the page itself); anywhere else it is the empty form.
 */
export function addPaymentPath(pathname: string): string {
  const m = /^\/(vendors|phases|contracts)\/([^/]+)\/?$/.exec(pathname)
  if (!m) return '/add'
  const key = m[1] === 'vendors' ? 'vendor' : m[1] === 'phases' ? 'phase' : 'contract'
  return `/add?${key}=${encodeURIComponent(m[2])}`
}
