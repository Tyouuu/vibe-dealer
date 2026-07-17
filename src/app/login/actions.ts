'use server'

import { headers } from 'next/headers'
import { getCurrentUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

// Called right after a successful client-side signInWithPassword — the
// @supabase/ssr browser client already synced the session cookie by then, so
// this sees the newly-authenticated user. Best-effort only: a failed insert
// here should never block sign-in, so errors are swallowed.
export async function logSignIn() {
  const user = await getCurrentUser()
  if (!user) return

  const h = await headers()
  const userAgent = h.get('user-agent')
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null

  const supabase = await createClient()
  await supabase.from('login_events').insert({ user_id: user.id, user_agent: userAgent, ip })
}
