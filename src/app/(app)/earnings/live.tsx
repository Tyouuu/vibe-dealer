'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatMYR } from '@/lib/money'

const REFRESH_DEBOUNCE_MS = 1500
// Only used when the socket is not up. A page that silently stops updating is
// worse than one that updates slowly, and the owner will be looking at this
// on a phone on a moving car's data connection.
const FALLBACK_POLL_MS = 30_000

/**
 * Keeps this page current, and says which way it is doing it.
 *
 * The refresh is a server re-render, not a client read: the socket is only
 * ever used as a "something changed" signal, so every figure on the page
 * still comes back through RLS the same way it did on first load. A client
 * that read `transactions` directly would be a second, weaker copy of the
 * permission rules.
 */
export function LiveBadge() {
  const router = useRouter()
  const [connected, setConnected] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS)
    }

    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    // The token has to reach the socket before the channel is subscribed.
    //
    // Without this the channel reports SUBSCRIBED and then never delivers a
    // single row: `postgres_changes` runs the table's RLS against whatever
    // JWT the socket is holding, and createBrowserClient does not hand the
    // session to the realtime side on its own. Driven and confirmed — the
    // page sat on "Live" through an insert that a node client, given the
    // token explicitly, received in under a second.
    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      await supabase.realtime.setAuth(data.session?.access_token ?? null)
      if (cancelled) return
      channel = supabase
        .channel('earnings')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, scheduleRefresh)
        .subscribe((status) => setConnected(status === 'SUBSCRIBED'))
    })()

    // An access token lives an hour. This page is meant to be left open on a
    // desk all day, and a socket still holding yesterday's token goes quiet
    // in exactly the way that looks like "it just stopped working".
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void supabase.realtime.setAuth(session?.access_token ?? null)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
      if (timer.current) clearTimeout(timer.current)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [router])

  useEffect(() => {
    if (connected) return
    const id = setInterval(() => router.refresh(), FALLBACK_POLL_MS)
    return () => clearInterval(id)
  }, [connected, router])

  return (
    <span className={`live-badge ${connected ? '' : 'opacity-70'}`} title={connected ? 'New sales appear here within a second or two' : 'Not connected — checking every 30 seconds instead'}>
      <span className={connected ? 'live-dot' : 'h-1.5 w-1.5 shrink-0 rounded-full bg-ink-700'} />
      {connected ? 'Live' : 'Checking'}
    </span>
  )
}

/**
 * The headline figure, counted up to rather than swapped.
 *
 * The owner asked for a number that visibly moves when a sale lands. A value
 * that simply replaces itself does move, but it is easy to miss on a phone in
 * a pocket-to-hand glance — the animation is what makes the change legible,
 * not decoration on top of it. First paint does not animate: there is nothing
 * to have changed from, and a page that counts up from zero on every load
 * turns a real signal into a habit the eye stops reading.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [animated, setAnimated] = useState(value)
  const from = useRef(value)
  const raf = useRef<number | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    // Reduced motion takes the value straight from the prop below rather than
    // through state, so there is no setState here at all — an effect that
    // sets state in its own body is a cascading render, and this one would
    // fire on every refresh.
    if (reduced) {
      from.current = value
      return
    }
    if (from.current === value) return
    const start = performance.now()
    const a = from.current
    const b = value
    from.current = value
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 650)
      // easeOutCubic: fast enough to read as a jump, settled enough to land
      const e = 1 - Math.pow(1 - t, 3)
      setAnimated(a + (b - a) * e)
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [value, reduced])

  const shown = reduced ? value : animated

  // formatMYR, not a local toLocaleString. Intl's MYR format puts a
  // non-breaking space after "RM" and this was writing a plain one, so the
  // headline and every figure under it were formatted two different ways on
  // the same card -- invisible on screen, and enough to make a check that
  // compares the two disagree with itself.
  return (
    <span className={className} aria-live="polite">
      {formatMYR(shown)}
    </span>
  )
}

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false
  )
}
