import type { MetadataRoute } from 'next'

// Lets the master/accountant/CS staff add this to their phone's home screen
// and open it like an app, instead of hunting for a browser tab every day.
// start_url is "/" on purpose — the root page already redirects to /login or
// /dashboard depending on session (see page.tsx), so the icon doesn't need
// to guess which one applies.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Vibe456 — Vibe Mobile Dealer System',
    short_name: 'Vibe456',
    description: 'Vibe Mobile master dealer bookkeeping, reports and dashboard',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f8fb',
    theme_color: '#14273d',
    icons: [
      { src: '/pwa-icon-192', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-icon-512', sizes: '512x512', type: 'image/png' },
    ],
  }
}
