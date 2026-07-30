import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // /monitoring is excluded for the same reason as _next/*: it isn't an app
  // route. It's the Sentry tunnel (next.config.ts tunnelRoute), which browser
  // error reports POST to. Left in the matcher it gets treated as a protected
  // page and 307s to /login, which would silently drop every client-side
  // error report from a signed-out page — the login screen itself being the
  // one most worth hearing about.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
