import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

// public/sw.js is the one piece of the phone alerts that runs on the phone, so it is
// run here against a stand-in for the service-worker global: what it shows for a
// push, and where a tap on it is allowed to go.
const code = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8')

type Listener = (e: unknown) => void
function boot(openWindows: { url: string; focused: boolean; navigatedTo: string | null }[] = []) {
  const listeners: Record<string, Listener> = {}
  const shown: { title: string; opts: Record<string, unknown> }[] = []
  const opened: string[] = []
  const self = {
    location: { origin: 'https://cwc456.com' },
    skipWaiting: () => {},
    clients: {
      claim: async () => {},
      matchAll: async () =>
        openWindows.map((w) => ({
          focus: async () => void (w.focused = true),
          navigate: async (u: string) => void (w.navigatedTo = u),
        })),
      openWindow: async (u: string) => void opened.push(u),
    },
    registration: { showNotification: async (title: string, opts: Record<string, unknown>) => void shown.push({ title, opts }) },
    addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
  }
  vm.runInNewContext(code, { self, URL })

  const fire = async (type: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve()
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => void (pending = p) })
    await pending
  }
  return { shown, opened, fire }
}

describe('sw.js push', () => {
  it('shows the title and body it was sent, opens the link it carries, and reuses the tag', async () => {
    const sw = boot()
    await sw.fire('push', {
      data: { json: () => ({ title: 'New SIM order to ship', body: 'Ipoh Reload — 12 SIM cards', url: '/delivery', tag: 'delivery-1' }), text: () => '' },
    })
    expect(sw.shown).toHaveLength(1)
    expect(sw.shown[0].title).toBe('New SIM order to ship')
    expect(sw.shown[0].opts).toMatchObject({ body: 'Ipoh Reload — 12 SIM cards', tag: 'delivery-1', data: { url: '/delivery' }, icon: '/pwa-icon-192' })
  })

  it('still shows something when the payload is not JSON, and when there is none', async () => {
    const plain = boot()
    await plain.fire('push', { data: { json: () => { throw new Error('not json') }, text: () => 'hello' } })
    expect(plain.shown[0].title).toBe('Vibe456')
    expect(plain.shown[0].opts.body).toBe('hello')

    const empty = boot()
    await empty.fire('push', {})
    expect(empty.shown[0].title).toBe('Vibe456')
    expect(empty.shown[0].opts.body).toBe('')
  })
})

describe('sw.js notification click', () => {
  const click = (url: string | undefined) => ({ notification: { close: () => {}, data: url === undefined ? undefined : { url } } })

  it('opens the page in a new window when the app is not open', async () => {
    const sw = boot()
    await sw.fire('notificationclick', click('/delivery'))
    expect(sw.opened).toEqual(['https://cwc456.com/delivery'])
  })

  it('focuses and navigates the window that is already open instead of opening another', async () => {
    const win = { url: 'https://cwc456.com/dashboard', focused: false, navigatedTo: null as string | null }
    const sw = boot([win])
    await sw.fire('notificationclick', click('/delivery'))
    expect(win.focused).toBe(true)
    expect(win.navigatedTo).toBe('https://cwc456.com/delivery')
    expect(sw.opened).toEqual([])
  })

  it('never follows a link to another site, whatever the payload says', async () => {
    for (const url of ['https://evil.example/phish', '//evil.example/x', 'javascript:alert(1)']) {
      const sw = boot()
      await sw.fire('notificationclick', click(url))
      expect(sw.opened, url).toEqual(['https://cwc456.com/'])
    }
  })

  it('goes home when the notification carried no link', async () => {
    const sw = boot()
    await sw.fire('notificationclick', click(undefined))
    expect(sw.opened).toEqual(['https://cwc456.com/'])
  })
})
