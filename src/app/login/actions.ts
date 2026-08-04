'use server'

import { cookies, headers } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getCurrentUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

// Two axes, because they stop different attacks. The email key stops someone
// grinding one known staff account; the IP key stops credential stuffing —
// five guesses each against two hundred addresses from one machine, which the
// email key alone never sees. OWASP pairs them for exactly this reason.
//
// The IP ceiling is deliberately much higher: a whole office behind one NAT
// shares it, and locking that out over one person's typo would be worse than
// the attack. It only has to be low enough to make a spray uneconomic.
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_MAX_ATTEMPTS_PER_IP = 30
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

  const ip = clientIp(h)
  const emailKey = `login:${email.trim().toLowerCase()}`

  const [{ data: emailAllowed }, { data: ipAllowed }] = await Promise.all([
    supabase.rpc('check_rate_limit', {
      p_key: emailKey,
      p_max_hits: LOGIN_MAX_ATTEMPTS,
      p_window_seconds: LOGIN_WINDOW_SECONDS,
    }),
    // No IP header (local dev, an odd proxy) means no second axis rather than
    // one shared bucket every request on the box would pile into.
    ip
      ? supabase.rpc('check_rate_limit', {
          p_key: `login-ip:${ip}`,
          p_max_hits: LOGIN_MAX_ATTEMPTS_PER_IP,
          p_window_seconds: LOGIN_WINDOW_SECONDS,
        })
      : Promise.resolve({ data: true }),
  ])

  if (emailAllowed === false || ipAllowed === false) {
    return { error: 'Too many attempts. Please wait 15 minutes and try again.' }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    // Not every failure here is a wrong password, and saying it is sends
    // someone off to retype a password that was right all along — then to
    // retry, which is the one thing that keeps a rate limit closed and the
    // one thing that cannot fix an outage.
    //
    // Supabase Auth applies its own per-IP ceiling on the token endpoint on
    // top of the app-layer counter above; that arrives as 429. A 5xx or a
    // thrown fetch (no status at all) means Auth could not be reached — the
    // project is paused, or the network is down.
    //
    // Deliberately narrow: every other 4xx still gets the credential message,
    // because those genuinely are the request being refused on its merits and
    // guessing at them would just trade one wrong sentence for another.
    if (error?.status === 429) {
      return { error: 'Too many sign-in attempts from this network. Please wait a few minutes and try again.' }
    }
    if (error && (error.status == null || error.status >= 500)) {
      return { error: 'Could not reach the sign-in service. Please try again in a moment.' }
    }
    return { error: 'Sign in failed. Please check your email / password.' }
  }

  // Signing in correctly must not spend one of your tries. Without this the
  // counter is "attempts per window" rather than "failed attempts per window",
  // and six ordinary sign-ins in a quarter of an hour — a demo, or switching
  // between roles — lock the account out of itself. Only the email key is
  // cleared: the IP key is shared with everyone else behind that address, so
  // one person's success is not evidence about the others.
  //
  // Best-effort. A failed cleanup must never turn a successful sign-in into a
  // failed one; the worst case is the pre-existing behaviour.
  await supabase.rpc('clear_rate_limit', { p_key: emailKey })

  await supabase.from('login_events').insert({ user_id: data.user.id, user_agent: h.get('user-agent'), ip })

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
