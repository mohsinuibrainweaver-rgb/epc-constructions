import assert from 'node:assert/strict'
import { inviteJoinLink, inviteLink } from '../src/lib/invite'

const link = new URL(inviteLink('https://epc-construction.vercel.app', 'abcd-efgh-ijkl'))
assert.equal(link.origin, 'https://epc-construction.vercel.app')
assert.equal(link.pathname, '/api/invite')
assert.equal(link.searchParams.get('invite'), 'ABCDEFGHIJKL')
assert.equal(link.searchParams.has('code'), false, 'Supabase Auth keeps its own code query parameter')

const join = new URL(inviteJoinLink('https://epc-construction.vercel.app', 'abcd-efgh-ijkl'))
assert.equal(join.origin, 'https://epc-construction.vercel.app')
assert.equal(join.pathname, '/join')
assert.equal(join.searchParams.get('type'), 'create')
assert.equal(join.searchParams.get('invite'), 'ABCDEFGHIJKL')

const local = new URL(inviteLink('http://localhost:5173', 'abcd-efgh-ijkl'))
assert.equal(local.origin, 'http://localhost:5173')
assert.equal(local.pathname, '/join')

console.log('invite link: all checks passed')
