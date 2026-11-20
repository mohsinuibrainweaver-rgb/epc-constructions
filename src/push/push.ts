import { VAPID_PUBLIC_KEY } from '@/sync/config'
import { supabase } from '@/sync/supabase'
import type { Lang } from '@/db/types'
import { hourFrom, prefsFrom, type PushPrefs } from './prefs'

export type PushResult = 'ok' | 'denied' | 'unsupported' | 'signedOut' | 'error'

/**
 * Development only: with localStorage 'epc.fakePush' = '1' the dev server pretends this browser has a reminder
 * subscription, so the Notifications screen can be tried against scripts/fake-supabase.mjs. Removed from the build.
 */
const fakeDevice = (): boolean => {
  if (!import.meta.env.DEV) return false
  try {
    return localStorage.getItem('epc.fakePush') === '1'
  } catch {
    return false
  }
}

/** Push needs the installed service worker, so it exists only in the built app (not the dev server). */
export const pushSupported = (): boolean =>
  fakeDevice() || (import.meta.env.PROD && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)

/** The browser's notification permission ('unsupported' when it has none). */
export const notifPermission = (): NotificationPermission | 'unsupported' =>
  fakeDevice() ? 'granted' : typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

const toKey = (b64: string): Uint8Array<ArrayBuffer> => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (import.meta.env.DEV && fakeDevice()) return { endpoint: 'https://push.fake/device', unsubscribe: async () => true } as unknown as PushSubscription
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/** Asks permission, subscribes this device, and saves the subscription so the server can reach it. */
export async function enablePush(lang: Lang): Promise<PushResult> {
  if (!pushSupported()) return 'unsupported'
  if (!supabase) return 'signedOut'
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return 'signedOut'
  try {
    if ((await Notification.requestPermission()) !== 'granted') return 'denied'
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) }))
    const json = sub.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return 'error'
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({ user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, lang }, { onConflict: 'endpoint' })
    if (error) {
      await sub.unsubscribe().catch(() => undefined)
      return 'error'
    }
    return 'ok'
  } catch {
    return 'error'
  }
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => undefined)
  await supabase?.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

/** Keeps the saved language of this device in step with the app language, so messages arrive in it. */
export async function syncPushLanguage(lang: Lang): Promise<void> {
  const sub = await currentSubscription().catch(() => null)
  if (!sub || !supabase) return
  await supabase.from('push_subscriptions').update({ lang }).eq('endpoint', sub.endpoint)
}

export type DevicePrefs =
  | { state: 'ok'; prefs: PushPrefs; hour: number }
  /** The database has no preferences columns yet (schema.sql not run again): everything is sent at 9:00. */
  | { state: 'oldSchema' }
  | { state: 'error' }

const missingColumn = (e: { code?: string; message?: string }): boolean =>
  e.code === '42703' || e.code === 'PGRST204' || /prefs|reminder_hour/.test(e.message ?? '')

/** What this device is set to receive, and at what hour. */
export async function loadDevicePrefs(): Promise<DevicePrefs> {
  const sub = await currentSubscription().catch(() => null)
  if (!sub || !supabase) return { state: 'error' }
  const { data, error } = await supabase.from('push_subscriptions').select('prefs,reminder_hour').eq('endpoint', sub.endpoint).maybeSingle()
  if (error) return missingColumn(error) ? { state: 'oldSchema' } : { state: 'error' }
  // No row yet is not a problem: the defaults apply until the first choice is saved.
  return { state: 'ok', prefs: prefsFrom(data?.prefs), hour: hourFrom(data?.reminder_hour) }
}

/** Saves a choice for this device. False when it could not be saved (offline, or this device is not registered). */
export async function saveDevicePrefs(change: { prefs?: PushPrefs; hour?: number }): Promise<boolean> {
  const sub = await currentSubscription().catch(() => null)
  if (!sub || !supabase) return false
  const patch: Record<string, unknown> = {}
  if (change.prefs) patch.prefs = change.prefs
  if (change.hour !== undefined) patch.reminder_hour = change.hour
  const { data, error } = await supabase.from('push_subscriptions').update(patch).eq('endpoint', sub.endpoint).select('endpoint')
  return !error && (data?.length ?? 0) > 0
}

/** Asks the server to send a test notification to the signed-in person's devices. */
export async function sendTestPush(): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.functions.invoke('send-reminders', { body: { action: 'test' } })
  return !error && Boolean((data as { sent?: number } | null)?.sent)
}
