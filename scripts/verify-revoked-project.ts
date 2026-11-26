import 'fake-indexeddb/auto'

const { db } = await import('../src/db/db')
const { purgeRevokedProjects } = await import('../src/db/access')

await db.delete()
await db.open()

const stamp = Date.now()
const revokedId = '00000000-0000-4000-8000-000000000001'
const keptId = '00000000-0000-4000-8000-000000000002'
await db.projects.bulkAdd([
  { id: revokedId, name: 'Revoked', location: '', currency: 'PKR', type: 'house', createdAt: stamp, updatedAt: stamp },
  { id: keptId, name: 'Kept', location: '', currency: 'PKR', type: 'house', createdAt: stamp, updatedAt: stamp },
])
await db.phases.add({ id: crypto.randomUUID(), projectId: revokedId, name: 'Old phase', order: 0, createdAt: stamp, updatedAt: stamp })
await db.payments.add({
  id: crypto.randomUUID(),
  projectId: revokedId,
  purpose: 'Old payment',
  amount: 100,
  date: '2026-11-26',
  category: 'misc',
  status: 'paid',
  mode: 'cash',
  createdAt: stamp,
  updatedAt: stamp,
})
await db.settings.bulkPut([
  { key: 'currentProjectId', value: revokedId },
  { key: `member.role.${revokedId}`, value: 'builder' },
  { key: `member.permissions.${revokedId}`, value: { viewLedger: true } },
  { key: `project.members.${revokedId}`, value: [] },
  { key: `member.role.${keptId}`, value: 'builder' },
])

await purgeRevokedProjects([revokedId], [keptId])

if (await db.projects.get(revokedId)) throw new Error('revoked project remained on this device')
if (!(await db.projects.get(keptId))) throw new Error('accessible project was removed')
if (await db.phases.where('projectId').equals(revokedId).count()) throw new Error('revoked phases remained')
if (await db.payments.where('projectId').equals(revokedId).count()) throw new Error('revoked payments remained')
if ((await db.settings.get('currentProjectId'))?.value !== keptId) throw new Error('current project did not switch')
if (await db.settings.get(`member.permissions.${revokedId}`)) throw new Error('revoked permission cache remained')

await purgeRevokedProjects([keptId], [])
if (await db.settings.get('currentProjectId')) throw new Error('current project remained when access to every project was revoked')

await db.delete()
console.log('Revoked-project cleanup verified.')
