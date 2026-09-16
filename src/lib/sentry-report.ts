import * as Sentry from '@sentry/nextjs'

// A serverless function (a route handler, a cron job, a Server Action) can
// terminate the instant it returns — Sentry.flush is what makes sure the
// event actually left before that happens, not just that .captureException
// was called. Previously duplicated verbatim in both cron routes; pulled out
// once a third and fourth call site needed the exact same shape.
export async function reportToSentry(capture: () => void) {
  try {
    capture()
    await Sentry.flush(2000)
  } catch {
    // Monitoring must never be the reason the caller itself fails.
  }
}
