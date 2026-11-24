const SUPABASE_PREVIEW_URL = 'https://nrsepzanbgxczxuvizkp.supabase.co/functions/v1/invite-preview'

const cleanInviteCode = (raw) => String(raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)

/**
 * Vercel serves this response as real HTML. The Supabase function does the privileged lookup and creates the
 * short-lived signed thumbnail URL, while this small proxy gives WhatsApp and other crawlers a previewable MIME type.
 */
export default async function handler(request, response) {
  const code = cleanInviteCode(request.query?.invite)
  const upstream = new URL(SUPABASE_PREVIEW_URL)
  upstream.searchParams.set('invite', code)

  try {
    const preview = await fetch(upstream, { headers: { Accept: 'text/html' } })
    const body = await preview.text()
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store, max-age=0')
    response.setHeader('X-Robots-Tag', 'noindex, nofollow')
    return response.status(preview.ok ? 200 : 502).send(body)
  } catch {
    const join = new URL('/join', 'https://epc-construction.vercel.app')
    join.searchParams.set('type', 'create')
    join.searchParams.set('invite', code)
    response.setHeader('Location', join.toString())
    return response.status(302).end()
  }
}
