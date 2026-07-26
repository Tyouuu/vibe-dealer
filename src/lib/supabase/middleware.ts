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
  // The password-reset email link lands here with no session yet — this route
  // exchanges the recovery code for one (see src/app/auth/confirm/route.ts).
  const isAuthRoute = pathname.startsWith('/auth/')

  if (!user && !isPublicRoute && !isCronRoute && !isAuthRoute && pathname !== '/') {
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
