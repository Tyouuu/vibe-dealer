import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service-role client for contexts with no logged-in user session (cron jobs,
// scheduled reports). Bypasses RLS — only use for trusted server-side jobs,
// never expose this key to the browser.
export function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
