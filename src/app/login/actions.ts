'use server'

import { cookies, headers } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
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
//
// A one-off client instead of the shared createClient() helper: it's the
// only call site that needs to touch the cookie's own maxAge (for
// rememberMe), which the shared helper doesn't expose.
export async function signIn(email: string, password: string, rememberMe: boolean): Promise<{ error: string | null }> {
  const cookieStore = await cookies()
  const h = await headers()

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // Unchecked "remember me" = a session cookie that disappears when
          // the browser fully closes, instead of Supabase's own long-lived
          // default — the only axis this toggle actually controls.
          const finalOptions = rememberMe ? options : { ...options, maxAge: undefined, expires: undefined }
          cookieStore.set(name, value, { ...finalOptions, secure: process.env.NODE_ENV === 'production' })
        })
      },
    },
  })

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
