import { Bell, Database, FolderKanban, Info, SlidersHorizontal, UserRound } from 'lucide-react'
import type { Key } from '@/i18n/en'

export type SectionId = 'account' | 'preferences' | 'notifications' | 'project' | 'data' | 'about'

/** The six settings sections, in menu order. */
export const SECTIONS: { id: SectionId; icon: typeof Bell; title: Key }[] = [
  { id: 'account', icon: UserRound, title: 'set.sec.account' },
  { id: 'preferences', icon: SlidersHorizontal, title: 'set.sec.preferences' },
  { id: 'notifications', icon: Bell, title: 'set.sec.notifications' },
  { id: 'project', icon: FolderKanban, title: 'set.sec.project' },
  { id: 'data', icon: Database, title: 'set.sec.data' },
  { id: 'about', icon: Info, title: 'set.sec.about' },
]
