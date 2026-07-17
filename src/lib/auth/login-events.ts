import 'server-only'

// Lightweight, good-enough device label for a sign-in history list — not a
// full UA-parsing library, just enough to show "Chrome on Windows" instead
// of a raw user-agent string. Order matters: check more specific tokens
// (Edg, OPR) before the engines they're built on (Chrome/Safari share tokens).
export function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device'

  let browser = 'Unknown browser'
  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Safari/')) browser = 'Safari'

  let os = 'Unknown OS'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS X')) os = 'macOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Linux')) os = 'Linux'

  return `${browser} on ${os}`
}
