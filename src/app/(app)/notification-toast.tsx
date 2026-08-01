'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export type ToastNotification = { id: string; title: string; subtitle: string; variant: 'brass' | 'clay' | 'info' | 'slate' }

const SEEN_KEY = 'dealerhub_seen_notification_ids'
const AUTO_DISMISS_MS = 6000

const VARIANT_BAR: Record<ToastNotification['variant'], string> = {
  brass: 'before:bg-brass-bright',
  clay: 'before:bg-clay-bright',
  info: 'before:bg-info',
  slate: 'before:bg-slate-bright',
}

// Notifications here are recomputed fresh on every page load (there's no
// event stream to push from), so "new" means "an id that wasn't in the set
// we saw last time this ran" — checked once per navigation, not the instant
// the underlying condition changes server-side. First-ever run just seeds
// the seen-set silently so nobody gets a toast storm for every pre-existing
// notification the moment this feature ships.
export function NotificationToast({ notifications }: { notifications: ToastNotification[] }) {
  const router = useRouter()
  const [queue, setQueue] = useState<ToastNotification[]>([])

  useEffect(() => {
    const currentIds = notifications.map((n) => n.id)
    let seenRaw: string | null = null
    try {
      seenRaw = localStorage.getItem(SEEN_KEY)
    } catch {
      return
    }

    if (seenRaw === null) {
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(currentIds))
      } catch {
        // ignore — storage may be unavailable (private browsing, quota)
      }
      return
    }

    const seen = new Set<string>(JSON.parse(seenRaw))
    const fresh = notifications.filter((n) => !seen.has(n.id))
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(currentIds))
    } catch {
      // ignore
    }
    if (fresh.length > 0) {
      // Genuinely syncing external state (localStorage) into local UI state
      // on prop change, not a derivable-from-render value — the pattern the
      // set-state-in-effect rule normally warns against doesn't apply here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQueue((prev) => [...prev, ...fresh].slice(-3))
    }
    // Only re-check when the set of notification ids actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications.map((n) => n.id).join(',')])

  function dismiss(id: string) {
    setQueue((prev) => prev.filter((n) => n.id !== id))
  }

  function handleClick(id: string) {
    dismiss(id)
    router.push('/notifications')
  }

  if (queue.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex w-[min(340px,calc(100vw-2rem))] flex-col-reverse gap-2.5">
      {queue.map((n) => (
        <Toast key={n.id} notification={n} onDismiss={() => dismiss(n.id)} onClick={() => handleClick(n.id)} />
      ))}
    </div>
  )
}

function Toast({ notification, onDismiss, onClick }: { notification: ToastNotification; onDismiss: () => void; onClick: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`app-card pointer-events-auto relative flex items-start gap-3 overflow-hidden py-3 pl-4 pr-3 shadow-2xl before:absolute before:inset-y-0 before:left-0 before:w-[3.5px] ${VARIANT_BAR[notification.variant]}`}
    >
      <button onClick={onClick} className="flex-1 text-left">
        <div className="text-[13px] font-semibold text-paper">{notification.title}</div>
        <div className="mt-0.5 text-[12px] text-paper-dim">{notification.subtitle}</div>
        <div className="mt-1.5 text-[12px] font-semibold text-primary-deep">View in Notifications →</div>
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 text-paper-dim/70 transition-colors hover:text-paper"
      >
        ×
      </button>
    </div>
  )
}
