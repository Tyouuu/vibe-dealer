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
  //
  // manifest.webmanifest / apple-icon / pwa-icon-* are the same shape of
  // problem, discovered the same way: a browser (or iOS itself, adding this
  // to a home screen) fetches these without ever having a session cookie to
  // send, so left unexcluded they 307 to /login and the OS silently gives up
  // on the icon/manifest instead of showing it — no error, just a home-screen
  // shortcut with a generic grey square. Confirmed live: before this line,
  // `curl /manifest.webmanifest` returned a 307, not the manifest.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|monitoring|manifest\\.webmanifest|apple-icon|pwa-icon-\\d+|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
