// Receives the phone alerts (see src/lib/push.ts). This file does nothing else: no
// caching, no offline mode, no fetch handler — a service worker that intercepts
// requests is a second place a stale page can hide, and this app has no need for one.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Vibe456'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/pwa-icon-192',
      badge: '/pwa-icon-192',
      // The same tag replaces rather than stacks, so a repeated alert for one parcel is one line.
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Only ever a page on this site: whatever the payload says, a notification
  // cannot send someone to another origin.
  let target = new URL('/', self.location.origin)
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)
    if (u.origin === self.location.origin) target = u
  } catch {
    /* keep the home page */
  }
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of open) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(target.href)
            } catch {
              /* focus was enough */
            }
          }
          return
        }
      }
      await self.clients.openWindow(target.href)
    })(),
  )
})
