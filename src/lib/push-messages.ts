import { createHash } from 'node:crypto'

// What lands on the lock screen. Words only: no ringgit, no points — cs has no
// financial visibility anywhere else in the app and a notification is the one
// place a figure would follow them out of it onto a phone anyone can glance at.
export type PushPayload = { title: string; body: string; url: string; tag: string }

function shortName(name: string): string {
  return name.length > 60 ? `${name.slice(0, 59)}…` : name
}

export function simOrderPush(input: { refId: string; dealer: string; quantity: number; simType: string }): PushPayload {
  const kind = input.simType === 'physical_no_number' ? 'no-number SIM card' : 'SIM card'
  return {
    title: 'New SIM order to ship',
    body: `${shortName(input.dealer)} — ${input.quantity.toLocaleString('en-MY')} ${kind}${input.quantity === 1 ? '' : 's'}`,
    url: '/delivery',
    tag: `delivery-${input.refId}`,
  }
}

export function packagePush(input: { refId: string; dealer: string; pkg: string; quantity: number }): PushPayload {
  return {
    title: 'New package to ship',
    body: `${shortName(input.dealer)} — Package ${input.pkg}${input.quantity > 1 ? ` × ${input.quantity}` : ''} (physical SIM)`,
    url: '/delivery',
    tag: `delivery-${input.refId}`,
  }
}

/**
 * The morning check failed, or could not run. Says how many rules are broken and nothing else: no dealer,
 * no amount, no points — the same rule every other lock-screen message here keeps. The names and figures
 * are one tap away, behind the sign-in.
 */
export function systemCheckPush(input: { day: string; headline: string }): PushPayload {
  return {
    title: 'System Check',
    body: input.headline,
    url: '/system-check',
    tag: `system-check-${input.day}`,
  }
}

/**
 * The id a day's system-check alert is claimed under in push_events (whose key is a uuid). Derived from the
 * date, so the same day maps to the same id and a second run that morning finds it taken and stays quiet.
 */
export function systemCheckRefId(day: string): string {
  const hex = createHash('md5').update(`system-check:${day}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function testPush(): PushPayload {
  return {
    title: 'Test notification',
    body: 'This is how alerts will reach this phone.',
    url: '/account',
    tag: 'test',
  }
}
