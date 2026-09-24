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

export function testPush(): PushPayload {
  return {
    title: 'Test notification',
    body: 'This is how a new SIM order will reach this phone.',
    url: '/account',
    tag: 'test',
  }
}
