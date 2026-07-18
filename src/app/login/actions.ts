'use server'

import { headers } from 'next/headers'
import { getCurrentUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_WINDOW_SECONDS = 15 * 60

function clientIp(h: Headers): string | null {
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
}

// Signs in server-side rather than from the browser client, so the session
// cookie comes back on the server's own Set-Cookie response header and can
// be httpOnly (src/lib/supabase/server.ts) — a browser-issued
// signInWithPassword can only ever set the cookie via document.cookie,
// which structurally cannot be httpOnly, leaving the session token readable
// by any future XSS. Also the one place brute-force protection can actually
// live, since it has to hold regardless of which client calls it.
export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const h = await headers()

  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `login:${email.trim().toLowerCase()}`,
    p_max_hits: LOGIN_MAX_ATTEMPTS,
    p_window_seconds: LOGIN_WINDOW_SECONDS,
  })
  if (allowed === false) {
    return { error: 'Too many attempts. Please wait 15 minutes and try again.' }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    return { error: 'Sign in failed. Please check your email / password.' }
  }

  await supabase.from('login_events').insert({ user_id: data.user.id, user_agent: h.get('user-agent'), ip: clientIp(h) })

  return { error: null }
}

// Kept separate from signIn for any sign-in path that doesn't go through it
// (there is none today, but this mirrors the narrow, single-purpose RPC
// pattern used elsewhere rather than folding logging into the auth call
// itself). Best-effort only: a failed insert here should never block sign-in.
export async function logSignIn() {
  const user = await getCurrentUser()
  if (!user) return

  const h = await headers()
  const supabase = await createClient()
  await supabase.from('login_events').insert({ user_id: user.id, user_agent: h.get('user-agent'), ip: clientIp(h) })
}
