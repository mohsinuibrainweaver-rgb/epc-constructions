// Public invite landing page for link previews. Deploy with JWT verification OFF.
// It exposes only the project name and a short-lived signed thumbnail URL for a currently valid invite,
// then immediately redirects a real browser to the existing account-creation/join flow.

interface InviteRow {
  expires_at: string | null
  accepted_at: string | null
  project: {
    name: string
    location: string
    owner_id: string
    thumbnail_path: string | null
    members: Array<{ user_id: string; display_name: string | null }>
  } | null
}

const env = (key: string): string => Deno.env.get(key) ?? ''

const firstKey = (json: string): string => {
  try {
    return String(Object.values(JSON.parse(json) as Record<string, string>)[0] ?? '')
  } catch {
    return ''
  }
}

const serverKey = (): string => firstKey(env('SUPABASE_SECRET_KEYS')) || env('SUPABASE_SERVICE_ROLE_KEY')
const cleanCode = (raw: string): string => raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character] ?? character)
const encodeStoragePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/')

async function validInvite(code: string): Promise<InviteRow | null> {
  if (code.length !== 12) return null
  const key = serverKey()
  const params = new URLSearchParams({
    select: 'expires_at,accepted_at,project:projects(name,location,owner_id,thumbnail_path,members:project_members(user_id,display_name))',
    code: `eq.${code}`,
    limit: '1',
  })
  const response = await fetch(`${env('SUPABASE_URL')}/rest/v1/project_invites?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!response.ok) throw new Error(`invite lookup failed: ${response.status}`)
  const row = ((await response.json()) as InviteRow[])[0]
  if (!row || (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())) return null
  return row
}

async function signedThumbnail(path: string | null | undefined): Promise<string> {
  if (!path) return ''
  const key = serverKey()
  const response = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/sign/receipts/${encodeStoragePath(path)}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 3600 }),
  })
  if (!response.ok) return ''
  const body = (await response.json()) as { signedURL?: string; signedUrl?: string }
  const signed = body.signedURL ?? body.signedUrl ?? ''
  if (!signed) return ''
  return signed.startsWith('http') ? signed : `${env('SUPABASE_URL')}/storage/v1${signed}`
}

function html(joinUrl: string, title: string, description: string, image: string): string {
  const safeJoin = escapeHtml(joinUrl)
  const safeTitle = escapeHtml(title)
  const safeDescription = escapeHtml(description)
  const safeImage = escapeHtml(image)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="EndPoint Construction">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${safeJoin}">
  ${safeImage ? `<meta property="og:image" content="${safeImage}">
  <meta property="og:image:secure_url" content="${safeImage}">
  <meta property="og:image:alt" content="${safeTitle}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  ${safeImage ? `<meta name="twitter:image" content="${safeImage}">` : ''}
  <meta http-equiv="refresh" content="0;url=${safeJoin}">
</head>
<body>
  <p>Opening your EndPoint Construction invitation…</p>
  <script>location.replace(${JSON.stringify(joinUrl).replace(/</g, '\\u003c')})</script>
  <p><a href="${safeJoin}">Continue</a></p>
</body>
</html>`
}

Deno.serve(async (request) => {
  const requestUrl = new URL(request.url)
  const code = cleanCode(requestUrl.searchParams.get('invite') ?? '')
  const siteUrl = (env('SITE_URL') || 'https://epc-construction.vercel.app').replace(/\/$/, '')
  const joinUrl = new URL('/join', siteUrl)
  joinUrl.searchParams.set('type', 'create')
  joinUrl.searchParams.set('invite', code)

  let invite: InviteRow | null = null
  let image = ''
  try {
    invite = await validInvite(code)
    image = await signedThumbnail(invite?.project?.thumbnail_path)
  } catch (error) {
    console.error(error)
  }

  const projectName = invite?.project?.name ?? ''
  const valid = Boolean(projectName)
  const ownerName = (invite?.project?.members ?? []).find((member) => member.user_id === invite?.project?.owner_id)?.display_name ?? ''
  if (requestUrl.searchParams.get('format') === 'json' || request.headers.get('accept')?.includes('application/json')) {
    return Response.json({
      valid,
      project: valid ? {
        name: projectName,
        location: invite?.project?.location ?? '',
        ownerName,
        image,
      } : null,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Access-Control-Allow-Origin': '*',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  }
  const title = valid ? `${projectName} · Project invitation` : 'Project invitation · EndPoint Construction'
  const description = valid
    ? `You have been invited to join ${projectName} on EndPoint Construction.`
    : 'Open this invitation to join a construction project.'
  const response = html(joinUrl.toString(), title, description, image)
  return new Response(response, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
})
