import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getStatus, startSync, stopSync, subscribe, syncNow, type SyncStatus } from './engine'
import { checkDevice, clearDeviceData, takeOverDevice, type DeviceCheck } from './device'
import { db } from '../db/db'
import { setSetting } from '../db/actions'
import type { Role } from '../db/types'
import { profileToApply, readProfile } from '../lib/profile'
import { disablePush } from '../push/push'
import { passwordRecoveryInUrl, supabase, syncConfigured } from './supabase'

interface SyncCtx {
  configured: boolean
  /** True while the first session check is running. */
  loading: boolean
  session: Session | null
  /** A recovery link made a temporary session; project UI must remain blocked until a new password is chosen. */
  passwordRecovery: boolean
  /** True until the signed-in account's first server pull has finished (successfully or otherwise). */
  projectsLoading: boolean
  status: SyncStatus
  /** Whether the data on this phone is this account's (checked after sign-in, before anything syncs). */
  device: DeviceCheck
  /** Clears the other account's data from this phone and gives the phone to the signed-in account. */
  takeOverDevice: () => Promise<void>
  syncNow: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<SyncCtx | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [passwordRecovery, setPasswordRecovery] = useState(passwordRecoveryInUrl)
  const [loading, setLoading] = useState(syncConfigured)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const signedInUser = useRef<string | undefined>(undefined)
  const status = useSyncExternalStore(subscribe, getStatus)
  const [device, setDevice] = useState<DeviceCheck>({ state: 'checking' })

  useEffect(() => {
    if (!supabase) return
    let alive = true
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      if (!data.session) await clearDeviceData()
      if (!alive) return
      signedInUser.current = data.session?.user.id
      setSession(data.session)
      setProjectsLoading(Boolean(data.session))
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (!s) {
        signedInUser.current = undefined
        setPasswordRecovery(false)
        setLoading(true)
        setSession(null)
        setProjectsLoading(false)
        void clearDeviceData().finally(() => alive && setLoading(false))
        return
      }
      if (signedInUser.current !== s.user.id) setProjectsLoading(true)
      signedInUser.current = s.user.id
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
    setDevice({ state: 'checking' })
    if (!userId || passwordRecovery) return
    let alive = true
    void checkDevice(userId)
      .catch((): DeviceCheck => ({ state: 'ok' }))
      .then((d) => alive && setDevice(d))
    return () => {
      alive = false
    }
  }, [userId, passwordRecovery])

  const deviceOk = device.state === 'ok'
  useEffect(() => {
    if (!supabase) return
    let alive = true
    if (userId && deviceOk && !passwordRecovery) {
      void startSync(userId).finally(() => {
        if (alive) setProjectsLoading(false)
      })
    } else {
      stopSync()
    }
    return () => {
      alive = false
      stopSync()
    }
  }, [userId, deviceOk, passwordRecovery])

  // The name and role belong to the account (its metadata), not to the phone: when the phone is this account's it takes them from the
  // account, so values left on the phone by another account never show up. Changes made in Settings are saved to the account too.
  const meta = session?.user.user_metadata
  useEffect(() => {
    if (!userId || !deviceOk || passwordRecovery) return
    void (async () => {
      await db.settings.put({ key: 'account.userId', value: userId })
      const change = profileToApply(readProfile(meta), {
        userName: (await db.settings.get('userName'))?.value as string | undefined,
        role: (await db.settings.get('role'))?.value as Role | undefined,
      })
      if (change.userName !== undefined) await setSetting('userName', change.userName)
      if (change.role !== undefined) await setSetting('role', change.role)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, deviceOk, passwordRecovery])

  const value = useMemo<SyncCtx>(
    () => ({
      configured: syncConfigured,
      loading,
      session,
      passwordRecovery,
      projectsLoading,
      status,
      device,
      takeOverDevice: async () => {
        if (!userId) return
        await takeOverDevice(userId)
        setDevice({ state: 'ok' })
      },
      syncNow,
      signOut: async () => {
        // This device stops showing reminders for the account it is leaving (needs the session, so it comes first).
        await disablePush().catch(() => undefined)
        // 'local' = this device only. The library's default is 'global', which would also sign out the other phone.
        const { error } = await supabase?.auth.signOut({ scope: 'local' }) ?? { error: undefined }
        if (!error) await clearDeviceData()
      },
    }),
    [loading, session, passwordRecovery, projectsLoading, status, device, userId],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSync(): SyncCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('SyncProvider missing')
  return c
}
