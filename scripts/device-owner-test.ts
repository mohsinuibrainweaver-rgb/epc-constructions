// Checks whose data is on a phone, and clearing it when another account takes the phone over.
// Run: npx vite-node scripts/device-owner-test.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { deviceVerdict } from '../src/lib/device-owner'
import { db } from '../src/db/db'
import { createProject } from '../src/db/actions'
import { takeOverDevice, readDeviceOwner } from '../src/sync/device'

// --- the verdict
assert.equal(deviceVerdict({ marker: 'A', uid: 'A', syncedProjectIds: ['p1'] }), 'mine')
assert.equal(deviceVerdict({ marker: 'A', uid: 'B', syncedProjectIds: [] }), 'foreign', 'a recorded owner decides, even with nothing synced')
assert.equal(deviceVerdict({ uid: 'A', syncedProjectIds: [] }), 'adopt', 'local-only data goes to the first account that signs in')
assert.equal(deviceVerdict({ uid: 'A', syncedProjectIds: ['p1', 'p2'], visibleIds: ['p2', 'p1'] }), 'adopt', 'the server shows all of them to this account')
assert.equal(deviceVerdict({ uid: 'B', syncedProjectIds: ['p1', 'p2'], visibleIds: [] }), 'foreign', 'the new account cannot see them: they are another account\'s')
assert.equal(deviceVerdict({ uid: 'B', syncedProjectIds: ['p1', 'p2'], visibleIds: ['p1'] }), 'foreign', 'one of them is not visible')
assert.equal(deviceVerdict({ uid: 'A', syncedProjectIds: ['p1'] }), 'unknown', 'server could not be asked')

// --- taking the phone over clears the old account's data but keeps what is about the phone itself
await createProject({ name: 'Old account project', location: '' }, 'standard')
await db.settings.bulkPut([
  { key: 'language', value: 'ur' },
  { key: 'region', value: { currency: 'PKR' } },
  { key: 'userName', value: 'Old Name' },
  { key: 'role', value: 'builder' },
  { key: 'sync.cursor.projects', value: '2026-01-01T00:00:00+00:00' },
])
assert.equal((await db.projects.count()) > 0 && (await db.phases.count()) > 0, true)
await takeOverDevice('B')
for (const t of db.tables) if (t.name !== 'settings') assert.equal(await t.count(), 0, `${t.name} is empty`)
assert.equal(await readDeviceOwner(), 'B')
assert.equal((await db.settings.get('language'))?.value, 'ur', 'language stays')
assert.ok(await db.settings.get('region'), 'region stays')
for (const k of ['userName', 'role', 'currentProjectId', 'sync.cursor.projects']) assert.equal(await db.settings.get(k), undefined, `${k} is cleared`)

console.log('device owner: all checks passed')
