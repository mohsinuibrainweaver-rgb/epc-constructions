import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getStatus, startSync, stopSync, subscribe, syncNow, type SyncStatus } from './engine'
import { db } from '../db/db'
import { setSetting } from '../db/actions'
import { disablePush } from '../push/push'
import { supabase, syncConfigured } from './supabase'

interface SyncCtx {
  configured: boolean
  /** True while the first session check is running. */
  loading: boolean
  session: Session | null
  status: SyncStatus
  syncNow: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<SyncCtx | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(syncConfigured)
  const status = useSyncExternalStore(subscribe, getStatus)

  useEffect(() => {
    if (!supabase) return
    let alive = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setLoading(false)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!supabase) return
    if (userId) startSync(userId)
    else stopSync()
    return () => stopSync()
  }, [userId])

  // The name and role given when the account was created: a second phone that has none of its own takes them from the account.
  const meta = session?.user.user_metadata as { name?: unknown; role?: unknown } | undefined
  useEffect(() => {
    if (!userId) return
    void (async () => {
      if (typeof meta?.name === 'string' && meta.name.trim() && !(await db.settings.get('userName'))?.value) await setSetting('userName', meta.name.trim())
      if ((meta?.role === 'investor' || meta?.role === 'builder') && !(await db.settings.get('role'))) await setSetting('role', meta.role)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const value = useMemo<SyncCtx>(
    () => ({
      configured: syncConfigured,
      loading,
      session,
      status,
      syncNow,
      signOut: async () => {
        // This device stops showing reminders for the account it is leaving (needs the session, so it comes first).
        await disablePush().catch(() => undefined)
        // 'local' = this device only. The library's default is 'global', which would also sign out the other phone.
        await supabase?.auth.signOut({ scope: 'local' })
      },
    }),
    [loading, session, status],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSync(): SyncCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('SyncProvider missing')
  return c
}
