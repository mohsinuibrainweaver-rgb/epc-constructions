// Simple setup: paste your Supabase values here instead of using .env.local.
// Both are safe to keep in the app (the anon key is public; your data is protected by the row level
// security in supabase/schema.sql). Never paste the "service_role" / secret key. Never put passwords here.
// If .env.local also defines them, those win.
export const SUPABASE_URL = 'https://nrsepzanbgxczxuvizkp.supabase.co' // e.g. 'https://abcdxyz.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_utWgDzpKMUYq0rU3pHZSuA_FfS6KTq0' // the "anon" / "publishable" key

// Public key for push notifications (safe to keep in the app). The matching private key lives only in Supabase,
// as the VAPID_PRIVATE_KEY secret of the send-reminders function. See docs/PUSH_SETUP.md.
export const VAPID_PUBLIC_KEY = 'BNTvwdltF9N2JnInozb-rwv8PFrAEz2Ur9r4oiCLRnCr-hscTs3TDAwvo2e8TiTMcTt4E838d36l-RM6aDW-N-w'
