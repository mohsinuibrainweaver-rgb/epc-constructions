import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || SUPABASE_URL
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || SUPABASE_ANON_KEY

/** False until config.ts or .env.local holds a real project URL and public (anon) key. The app then runs on this device only. */
/** VITE_DISABLE_SYNC=1 forces local-only mode (handy for design work without signing in). */
export const syncConfigured = Boolean(!import.meta.env.VITE_DISABLE_SYNC && url && key && !url.includes('YOUR-PROJECT') && !key.includes('YOUR-ANON'))

export const supabase: SupabaseClient | null = syncConfigured
  ? createClient(url as string, key as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export const BUCKET = 'receipts'
