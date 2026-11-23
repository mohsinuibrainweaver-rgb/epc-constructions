import assert from 'node:assert/strict'
import { inviteLink } from '../src/lib/invite'

const link = new URL(inviteLink('https://epc-construction.vercel.app', 'abcd-efgh-ijkl'))
assert.equal(link.origin, 'https://epc-construction.vercel.app')
assert.equal(link.pathname, '/join')
assert.equal(link.searchParams.get('type'), 'create')
assert.equal(link.searchParams.get('invite'), 'ABCDEFGHIJKL')
assert.equal(link.searchParams.has('code'), false, 'Supabase Auth keeps its own code query parameter')

console.log('invite link: all checks passed')
