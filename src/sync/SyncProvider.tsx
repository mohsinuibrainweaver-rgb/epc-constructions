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
const AUTH_TAB_EVENT_KEY = 'epc.auth-tab-event'
const AUTH_TAB_CHANNEL = 'epc-auth-tabs'

interface AuthTabEvent {
  type: 'signed-out'
  id: string
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [passwordRecovery, setPasswordRecovery] = useState(passwordRecoveryInUrl)
  const [loading, setLoading] = useState(syncConfigured)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const signedInUser = useRef<string | undefined>(undefined)
  const authTabChannel = useRef<BroadcastChannel | null>(null)
  const handledAuthTabEvent = useRef<string | undefined>(undefined)
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

  // Supabase already synchronizes auth through its own BroadcastChannel. This small, token-free
  // application event is a defensive fallback for browsers/PWA contexts where that delivery is
  // delayed: it immediately removes account data and signed-in UI from every open tab.
  useEffect(() => {
    if (!supabase) return

    const handleSignedOut = (event: AuthTabEvent | undefined) => {
      if (!event || event.type !== 'signed-out' || handledAuthTabEvent.current === event.id) return
      handledAuthTabEvent.current = event.id
      signedInUser.current = undefined
      setPasswordRecovery(false)
      setSession(null)
      setProjectsLoading(false)
      setLoading(true)
      stopSync()
      void clearDeviceData().finally(() => setLoading(false))
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_TAB_EVENT_KEY || !event.newValue) return
      try {
        handleSignedOut(JSON.parse(event.newValue) as AuthTabEvent)
      } catch {
        // Ignore malformed/non-app storage values.
      }
    }

    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(AUTH_TAB_CHANNEL)
      authTabChannel.current = channel
      channel.onmessage = (message: MessageEvent<AuthTabEvent>) => handleSignedOut(message.data)
    }
    window.addEventListener('storage', onStorage)

    return () => {
      window.removeEventListener('storage', onStorage)
      authTabChannel.current?.close()
      authTabChannel.current = null
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
        try {
          await supabase?.auth.signOut({ scope: 'local' })
        } finally {
          // A local-scope sign-out clears the browser session before Supabase attempts server-side
          // revocation, so every tab must leave the account even when that network request fails.
          const event: AuthTabEvent = { type: 'signed-out', id: crypto.randomUUID() }
          handledAuthTabEvent.current = event.id
          authTabChannel.current?.postMessage(event)
          // The storage event covers older browsers and WebViews without BroadcastChannel. It is
          // intentionally non-sensitive and fires only in the other tabs on this origin.
          try {
            localStorage.setItem(AUTH_TAB_EVENT_KEY, JSON.stringify(event))
          } catch {
            // Restricted storage does not prevent BroadcastChannel or this tab's own cleanup.
          }
          await clearDeviceData()
        }
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
