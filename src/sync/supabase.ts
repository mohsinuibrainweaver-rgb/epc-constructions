import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || SUPABASE_URL
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || SUPABASE_ANON_KEY

// Capture this before createClient consumes and removes the recovery fragment from the address bar.
// onAuthStateChange also reports PASSWORD_RECOVERY, but this closes the small initialization race.
export const passwordRecoveryInUrl = (() => {
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    return window.location.pathname === '/reset-password' || hash.get('type') === 'recovery' || query.get('type') === 'recovery'
  } catch {
    return false
  }
})()

/** False until config.ts or .env.local holds a real project URL and public (anon) key. The app then runs on this device only. */
/** VITE_DISABLE_SYNC=1 forces local-only mode (handy for design work without signing in). */
export const syncConfigured = Boolean(!import.meta.env.VITE_DISABLE_SYNC && url && key && !url.includes('YOUR-PROJECT') && !key.includes('YOUR-ANON'))

export const supabase: SupabaseClient | null = syncConfigured
  ? createClient(url as string, key as string, {
      // A recovery URL is handled by the isolated client below. Letting this persistent client consume
      // it would save and broadcast the temporary recovery session, logging every open app tab in.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !passwordRecoveryInUrl },
    })
  : null

/** Memory-only auth client used exclusively while choosing a new password. It never signs in other tabs. */
export const recoverySupabase: SupabaseClient | null = syncConfigured && passwordRecoveryInUrl
  ? createClient(url as string, key as string, {
      auth: {
        storageKey: 'epc-password-recovery',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: true,
      },
    })
  : null

export const BUCKET = 'receipts'
