import * as Sentry from '@sentry/nextjs'

// Browser-side counterpart to instrumentation.ts. Catches the errors the
// server never sees: a component crashing mid-render, a fetch failing in a
// client action, the blank-page class of bug that currently only gets
// reported when a staff member happens to mention it.
//
// Uses NEXT_PUBLIC_SENTRY_DSN (the client bundle can't read a server-only
// var) and stays a no-op when it isn't set.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    // Session Replay is off deliberately: it records the screen, and these
    // screens show dealer names, phone numbers and balances. Not something to
    // send to a third party for an internal tool with 3 users.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  })
}

// Lets Sentry tie errors to the route the user was on when navigating
// client-side.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
