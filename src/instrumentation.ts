import * as Sentry from '@sentry/nextjs'

// Server-side error monitoring. This app had none: a failing Server Action —
// a transaction that silently stops saving, a reconciliation that errors —
// showed the operator a generic message and told nobody. In a money ledger
// that's the expensive kind of silence, because missing entries only surface
// weeks later when a month won't reconcile.
//
// Everything here is a no-op unless SENTRY_DSN is set, so local dev and any
// deployment without the env var behave exactly as before.
export async function register() {
  if (!process.env.SENTRY_DSN) return

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      // Errors are the whole point here; traces are volume this app doesn't
      // need and would burn the free tier's quota for no benefit at 3 users.
      tracesSampleRate: 0,
      // Staff-only internal tool, but it still handles dealers' personal data
      // under the PDPA — don't ship request bodies, headers or cookies to a
      // third party by default.
      sendDefaultPii: false,
    })
  }
}

// Next's hook for server-side errors (App Router, Server Actions, route
// handlers). Without this, only unhandled exceptions Sentry patches directly
// are captured — this is what catches the rest.
export const onRequestError = Sentry.captureRequestError
