'use client'

import { useEffect, useRef } from 'react'
import { KEEPALIVE_INTERVAL_MS } from '@/lib/idle'

// Tell the server someone is still at the keyboard — but only when they are.
//
// This deliberately has no interval of its own. A timer that pings on its own
// schedule would keep an abandoned machine signed in forever, which is exactly
// what the idle limit exists to prevent. Every ping here is caused by a real
// person doing something; throttling to one a minute keeps that from turning
// into a request per keystroke.
export function Keepalive() {
  const last = useRef(0)

  useEffect(() => {
    function touched() {
      const now = Date.now()
      if (now - last.current < KEEPALIVE_INTERVAL_MS) return
      last.current = now
      // keepalive so a ping fired as the tab closes is not cancelled, and
      // ignore failures: if this cannot reach the server the idle clock is
      // the correct outcome anyway.
      void fetch('/api/keepalive', { method: 'POST', keepalive: true }).catch(() => {})
    }

    // pointerdown rather than click: it fires on the way down, so a long press
    // on a phone counts before the tap completes. scroll is passive because
    // reading a long report is being present too.
    const events = ['pointerdown', 'keydown', 'scroll'] as const
    for (const e of events) window.addEventListener(e, touched, { passive: true })
    return () => { for (const e of events) window.removeEventListener(e, touched) }
  }, [])

  return null
}
