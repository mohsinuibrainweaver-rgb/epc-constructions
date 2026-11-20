// A stand-in for Supabase's sign-in and database calls, for trying the Account screen in a browser without a real
// account. NOT used by the app: it is started by the "epc-dev-fakesync" launch configuration.
//   password sign-in: "oldpass12" works, anything else is refused (invalid_credentials)
//   change password:  "password1" is refused as weak, the current password is refused as the same
//   GET  /__log       shows what the app asked for (sign-ins, password change, logout scope, deleted reminder rows, saved
//                     reminder choices)
//   GET  /__mode?m=ok|oldschema|down   how the reminder-choices table behaves: normal, no prefs columns yet, or failing
//   GET  /__sub       the one pretend device (endpoint https://push.fake/device) with its saved choices
import http from 'node:http'

const state = { password: 'oldpass12', log: [], n: 0, mode: 'ok', sub: { endpoint: 'https://push.fake/device', prefs: {}, reminder_hour: 9 } }
const user = { id: '11111111-1111-1111-1111-111111111111', email: 'tester@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' }
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const session = () => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  return { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp })}.sig`, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `r-${++state.n}`, user }
}
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' }

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const send = (code, json) => {
        res.writeHead(code, { ...CORS, 'content-type': 'application/json' })
        res.end(json === undefined ? '' : JSON.stringify(json))
      }
      const data = body ? JSON.parse(body) : {}
      if (req.method === 'OPTIONS') return send(204)
      if (url.pathname === '/__log') return send(200, state.log)
      if (url.pathname === '/__sub') return send(200, state.sub)
      if (url.pathname === '/__mode') {
        state.mode = url.searchParams.get('m') ?? 'ok'
        return send(200, { mode: state.mode })
      }
      if (url.pathname === '/auth/v1/token') {
        if (url.searchParams.get('grant_type') === 'refresh_token') return send(200, session())
        state.log.push(`signIn:${data.password === state.password ? 'ok' : 'refused'}`)
        return data.password === state.password ? send(200, session()) : send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      }
      if (url.pathname === '/auth/v1/user') {
        if (req.method === 'GET') return send(200, user)
        if (data.password === 'password1') return send(422, { code: 422, error_code: 'weak_password', msg: 'Password is known to be weak', weak_password: { reasons: ['pwned'] } })
        if (data.password === state.password) return send(422, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' })
        state.password = data.password
        state.log.push(`passwordChanged:${data.password.length} characters`)
        return send(200, user)
      }
      if (url.pathname === '/auth/v1/logout') {
        state.log.push(`logout:scope=${url.searchParams.get('scope') ?? 'global'}`)
        return send(204)
      }
      if (url.pathname.startsWith('/rest/v1/rpc/')) return send(200, 0)
      if (url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.replace('/rest/v1/', '')
        if (table === 'push_subscriptions') {
          if (state.mode === 'down') return send(500, { message: 'down' })
          const wanted = /prefs|reminder_hour/.test(url.searchParams.get('select') ?? '') || req.method === 'PATCH'
          if (state.mode === 'oldschema' && wanted) return send(400, { code: '42703', message: 'column push_subscriptions.prefs does not exist' })
          if (req.method === 'GET') return (req.headers.accept ?? '').includes('object+json') ? send(200, state.sub) : send(200, [state.sub])
          if (req.method === 'PATCH') {
            Object.assign(state.sub, data)
            state.log.push(`patch:push_subscriptions:${JSON.stringify(data)}`)
            return send(200, [{ endpoint: state.sub.endpoint }])
          }
        }
        if (req.method === 'DELETE') state.log.push(`delete:${table}?${url.searchParams.toString()}`)
        return send(req.method === 'GET' ? 200 : req.method === 'POST' ? 201 : 204, req.method === 'GET' ? [] : undefined)
      }
      send(200, {})
    })
  })
  .listen(54397, () => console.log('fake supabase on 54397'))
