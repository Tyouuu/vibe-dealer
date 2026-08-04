import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// /reset-password is public because the recovery session it needs is only
// established client-side, after the initial (necessarily anonymous) server
// render — the reset link's tokens arrive either in a ?code= query param or
// a #access_token= URL fragment the server can never see. The page itself
// gates on that session client-side (see reset-password-form.tsx).
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, { ...options, secure: process.env.NODE_ENV === 'production' })
          )
        },
      },
    }
  )

  // touch the session so expired tokens get refreshed before Server Components read them
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)
  // Cron jobs call this with no browser session; it authenticates itself via CRON_SECRET.
  const isCronRoute = pathname.startsWith('/api/cron/')

  // There was a third exemption here letting anything under /auth/ through
  // unauthenticated, justified by a comment citing src/app/auth/confirm/
  // route.ts. That file has never existed — the recovery link is handled
  // entirely client-side by reset-password-form.tsx, which is why
  // /reset-password is in PUBLIC_ROUTES above. An open prefix defended by a
  // file that isn't there is worth removing before it becomes true.

  // Signed in with Supabase, but not a user of this app — either no profiles
  // row (created in the dashboard and never provisioned) or one switched off
  // because the person has left (0036).
  //
  // This has to be resolved here, holding a response that can write cookies,
  // because otherwise it is an infinite redirect. getCurrentUser returns null,
  // the page redirects to /login, and the rule below sees a valid session on a
  // public route and sends it straight back — round and round, ERR_TOO_MANY_
  // REDIRECTS, no login screen ever reached. The session is the thing keeping
  // the loop alive, so end it: sign out, then send them to /login with a line
  // explaining why they are there. Reproduced by switching a live account off
  // while it still held a session.
  if (user && !isCronRoute) {
    const { data: profile } = await supabase.from('profiles').select('active').eq('id', user.id).maybeSingle()
    if (!profile || profile.active === false) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.search = '?ended=1'
      const redirectResponse = NextResponse.redirect(url)
      // signOut's cookie clearing landed on supabaseResponse via setAll above;
      // carry it onto the response actually being returned, or the browser
      // keeps the session and walks straight back into the loop.
      supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
      return redirectResponse
    }
  }

  if (!user && !isPublicRoute && !isCronRoute && pathname !== '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
