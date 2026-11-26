const SUPABASE_PREVIEW_URL = 'https://nrsepzanbgxczxuvizkp.supabase.co/functions/v1/invite-preview'

const cleanInviteCode = (raw) => String(raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)

const decodeHtml = (value) => String(value ?? '')
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')

const metaContent = (html, property) => {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'))
  return decodeHtml(match?.[1] ?? '')
}

const previewFromHtml = (html) => {
  const title = metaContent(html, 'og:title')
  const suffix = ' · Project invitation'
  return {
    valid: Boolean(title && !title.startsWith('Project invitation')),
    project: {
      name: title.endsWith(suffix) ? title.slice(0, -suffix.length) : title,
      location: '',
      ownerName: '',
      image: metaContent(html, 'og:image'),
    },
  }
}

/**
 * Vercel serves this response as real HTML. The Supabase function does the privileged lookup and creates the
 * short-lived signed thumbnail URL, while this small proxy gives WhatsApp and other crawlers a previewable MIME type.
 */
export default async function handler(request, response) {
  const code = cleanInviteCode(request.query?.invite)
  const upstream = new URL(SUPABASE_PREVIEW_URL)
  upstream.searchParams.set('invite', code)
  const wantsJson = request.query?.format === 'json'
  if (wantsJson) upstream.searchParams.set('format', 'json')

  try {
    const preview = await fetch(upstream, { headers: { Accept: wantsJson ? 'application/json' : 'text/html' } })
    const upstreamType = preview.headers.get('content-type') ?? ''
    const upstreamBody = await preview.text()
    if (wantsJson) {
      let payload
      try {
        payload = upstreamType.includes('application/json') ? JSON.parse(upstreamBody) : previewFromHtml(upstreamBody)
      } catch {
        payload = { valid: false, project: null }
      }
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store, max-age=0')
      response.setHeader('X-Robots-Tag', 'noindex, nofollow')
      return response.status(preview.ok ? 200 : 502).json(payload)
    }
    // Older deployed preview functions used to force every recipient onto account creation. Strip that hint here so
    // this Vercel endpoint remains correct even before the Edge Function deployment catches up.
    const body = upstreamBody
      .replaceAll('type=create&amp;', '')
      .replaceAll('type=create&', '')
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store, max-age=0')
    response.setHeader('X-Robots-Tag', 'noindex, nofollow')
    return response.status(preview.ok ? 200 : 502).send(body)
  } catch {
    if (wantsJson) {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store, max-age=0')
      return response.status(502).json({ valid: false, project: null })
    }
    const join = new URL('/join', 'https://epc-construction.vercel.app')
    join.searchParams.set('invite', code)
    response.setHeader('Location', join.toString())
    return response.status(302).end()
  }
}
