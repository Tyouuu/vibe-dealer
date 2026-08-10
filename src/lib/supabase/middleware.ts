import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { IDLE_LIMIT_MS, LAST_SEEN_COOKIE, REMEMBER_COOKIE } from '@/lib/idle'

// /reset-password is public because the recovery session it needs is only
// established client-side, after the initial (necessarily anonymous) server
// render — the reset link's tokens arrive either in a ?code= query param or
// a #access_token= URL fragment the server can never see. The page itself
// gates on that session client-side (see reset-password-form.tsx).
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password']

// /r/<token> is public in a different sense from the routes above, and the
// difference matters. Those three are *pre-sign-in* pages: a signed-in user
// landing on one is lost, so they get sent to the app. The dealer link is not
// a stage of signing in — it is a page belonging to someone outside the
// company, and staff must be able to open it to see exactly what a dealer
// sees. Putting it in PUBLIC_ROUTES would have bounced every signed-in person
// who tried, which is the one group who needs to check it.
function isDealerLink(pathname: string): boolean {
  return pathname === '/r' || pathname.startsWith('/r/')
}

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

  // Idle sign-out. Enforced here rather than in the browser because a timer in
  // a tab is a courtesy, not a control: close devtools' eyes for a second and
  // it is gone. The server decides, on every request, whether this session has
  // been left alone too long.
  //
  // Same shape as the switched-off branch above, and for the same reason: the
  // sign-out has to happen while holding a response that can write cookies, or
  // the browser keeps a session the server has already given up on.
  if (user && !isCronRoute) {
    const seen = Number(request.cookies.get(LAST_SEEN_COOKIE)?.value)
    const now = Date.now()
    // Ticking "Remember me on this device" turns the idle clock off. See
    // REMEMBER_COOKIE for why the checkbox gets to make that call and the
    // fifteen minutes cannot.
    const remembered = request.cookies.get(REMEMBER_COOKIE)?.value === '1'

    if (!remembered && seen && now - seen > IDLE_LIMIT_MS) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.search = '?idle=1'
      const redirectResponse = NextResponse.redirect(url)
      supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
      redirectResponse.cookies.delete(LAST_SEEN_COOKIE)
      return redirectResponse
    }

    // No maxAge on purpose. This cookie must not outlive the browser session
    // when "remember me" was left unchecked — giving it a lifetime of its own
    // would leave a stale timestamp behind for the next person to sign in.
    supabaseResponse.cookies.set(LAST_SEEN_COOKIE, String(now), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    })
  }

  if (!user && !isPublicRoute && !isCronRoute && !isDealerLink(pathname) && pathname !== '/') {
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
