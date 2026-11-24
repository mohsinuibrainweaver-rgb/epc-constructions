import type { ProjectMemberIdentity } from '@/db/types'
import type { Key } from '@/i18n/en'

export const memberLabel = (member: ProjectMemberIdentity): string => member.name || member.email || member.userId.slice(0, 8)

/** New payments store a member id. Unattributable legacy role values stay readable without guessing a person. */
export function payerLabel(value: string, members: ProjectMemberIdentity[], t: (key: Key) => string): string {
  const member = members.find((item) => item.userId === value)
  if (member) return memberLabel(member)
  if (value === 'investor' || value === 'builder') return t(`paidBy.${value}`)
  return value || '—'
}
