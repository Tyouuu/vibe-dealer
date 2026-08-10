import 'server-only'
import { headers } from 'next/headers'

// Where this deployment is being served from, for building a link that will
// be pasted into WhatsApp and clicked days later.
//
// Read from the request rather than an environment variable so it is correct
// on cwc456.com, on the demo, and on localhost with nothing to configure —
// and so a missing or stale env var can never hand someone a link pointing at
// the wrong deployment. There is no NEXT_PUBLIC_SITE_URL in this project, and
// adding one would be a third place for the same fact to be wrong.
export async function siteOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  // Vercel and most proxies set this; local dev does not, and there http is
  // the only thing that works.
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
