import { db, remoteTx } from './db'

/**
 * Removes projects this account can no longer access from this device only.
 * The membership has already been removed on the server, so these deletes must
 * never be marked dirty or synced back as project/data deletions.
 */
export async function purgeRevokedProjects(revokedProjectIds: string[], accessibleProjectIds: string[]): Promise<void> {
  const revoked = [...new Set(revokedProjectIds)].filter(Boolean)
  if (!revoked.length) return

  const accessible = new Set(accessibleProjectIds)
  await remoteTx(
    [
      db.projects,
      db.phases,
      db.vendors,
      db.contracts,
      db.plans,
      db.payments,
      db.transfers,
      db.files,
      db.attachments,
      db.materials,
      db.settings,
    ],
    async () => {
      const currentProjectId = (await db.settings.get('currentProjectId'))?.value as string | undefined
      const remaining = (await db.projects.toArray()).filter(
        (project) => !project.deletedAt && !revoked.includes(project.id) && accessible.has(project.id),
      )

      await Promise.all([
        db.phases.where('projectId').anyOf(revoked).delete(),
        db.vendors.where('projectId').anyOf(revoked).delete(),
        db.contracts.where('projectId').anyOf(revoked).delete(),
        db.plans.where('projectId').anyOf(revoked).delete(),
        db.payments.where('projectId').anyOf(revoked).delete(),
        db.transfers.where('projectId').anyOf(revoked).delete(),
        db.files.where('projectId').anyOf(revoked).delete(),
        db.attachments.where('projectId').anyOf(revoked).delete(),
        db.materials.where('projectId').anyOf(revoked).delete(),
      ])
      await db.projects.bulkDelete(revoked)
      await db.settings.bulkDelete(revoked.flatMap((id) => [
        `member.role.${id}`,
        `member.permissions.${id}`,
        `project.members.${id}`,
      ]))

      if (currentProjectId && revoked.includes(currentProjectId)) {
        if (remaining[0]) await db.settings.put({ key: 'currentProjectId', value: remaining[0].id })
        else await db.settings.delete('currentProjectId')
      }
    },
  )
}
