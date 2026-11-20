// Checks the password change and "sign out everywhere" logic against a stand-in for the sign-in service.
// Run: npx vite-node scripts/account-test.ts
import assert from 'node:assert/strict'
import { changePassword, signOutEverywhere, type AuthClient } from '../src/auth/account'

type Err = { code?: string; message: string } | null
function stub(opts: { signIn?: Err; update?: Err; signOut?: Err; deleteThrows?: boolean } = {}) {
  const calls: string[] = []
  const client = {
    auth: {
      signInWithPassword: async (c: { email: string; password: string }) => {
        calls.push(`signIn:${c.email}:${c.password}`)
        return { error: opts.signIn ?? null }
      },
      updateUser: async (a: { password: string }) => {
        calls.push(`update:${a.password}`)
        return { error: opts.update ?? null }
      },
      signOut: async (o?: { scope?: string }) => {
        calls.push(`signOut:${o?.scope ?? 'local'}`)
        return { error: opts.signOut ?? null }
      },
    },
    from: (table: string) => ({
      delete: () => ({
        eq: async (col: string, val: string) => {
          calls.push(`delete:${table}:${col}=${val}`)
          if (opts.deleteThrows) throw new Error('network')
          return { error: null }
        },
      }),
    }),
  } as unknown as AuthClient
  return { client, calls }
}

// Refused before anything is sent.
let s = stub()
assert.equal(await changePassword(s.client, 'a@x.com', 'oldpass1', 'short', 'short'), 'tooShort')
assert.equal(await changePassword(s.client, 'a@x.com', 'oldpass1', 'newpass123', 'newpass124'), 'mismatch')
assert.equal(await changePassword(s.client, 'a@x.com', 'samepass1', 'samepass1', 'samepass1'), 'same')
assert.deepEqual(s.calls, [], 'bad input never reaches the server')
assert.equal(await changePassword(s.client, 'a@x.com', 'o', '1234567', '1234567'), 'tooShort', '7 characters is too short')

// The current password is proven first; a wrong one stops everything.
s = stub({ signIn: { code: 'invalid_credentials', message: 'Invalid login credentials' } })
assert.equal(await changePassword(s.client, 'a@x.com', 'wrongold', 'newpass123', 'newpass123'), 'wrongCurrent')
assert.deepEqual(s.calls, ['signIn:a@x.com:wrongold'], 'the password is not changed when the current one is wrong')

// A network problem is not reported as a wrong password.
s = stub({ signIn: { message: 'fetch failed' } })
assert.equal(await changePassword(s.client, 'a@x.com', 'oldpass1', 'newpass123', 'newpass123'), 'failed')

// Success: prove, then change, in that order.
s = stub()
assert.equal(await changePassword(s.client, 'a@x.com', 'oldpass1', 'newpass123', 'newpass123'), 'ok')
assert.deepEqual(s.calls, ['signIn:a@x.com:oldpass1', 'update:newpass123'])

// The service can still refuse a weak or repeated password.
assert.equal(await changePassword(stub({ update: { code: 'weak_password', message: 'weak' } }).client, 'a@x.com', 'oldpass1', 'password1', 'password1'), 'weak')
assert.equal(await changePassword(stub({ update: { code: 'same_password', message: 'same' } }).client, 'a@x.com', 'oldpass1', 'newpass123', 'newpass123'), 'same')
assert.equal(await changePassword(stub({ update: { message: 'boom' } }).client, 'a@x.com', 'oldpass1', 'newpass123', 'newpass123'), 'failed')

// Sign out everywhere: reminders off first, then the global sign-out.
let here = 0
s = stub()
assert.equal(await signOutEverywhere(s.client, 'u1', async () => void here++), true)
assert.deepEqual(s.calls, ['delete:push_subscriptions:user_id=u1', 'signOut:global'])
assert.equal(here, 1, 'this device stops its own reminders too')

// A failure to switch reminders off must not stop the sign-out.
s = stub({ deleteThrows: true })
assert.equal(await signOutEverywhere(s.client, 'u1', async () => { throw new Error('no service worker') }), true)
assert.ok(s.calls.includes('signOut:global'))
assert.equal(await signOutEverywhere(stub({ signOut: { message: 'x' } }).client, 'u1', async () => undefined), false, 'a failed sign-out is reported')

console.log('account: all checks passed')
