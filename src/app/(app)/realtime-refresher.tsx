'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const REFRESH_DEBOUNCE_MS = 2000

export function RealtimeRefresher() {
  const router = useRouter()
  const [connected, setConnected] = useState(false)
  const refreshTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimeout.current) clearTimeout(refreshTimeout.current)
      refreshTimeout.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS)
    }

    const supabase = createClient()
    const channel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dealers' }, scheduleRefresh)
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    return () => {
      if (refreshTimeout.current) clearTimeout(refreshTimeout.current)
      supabase.removeChannel(channel)
    }
  }, [router])

  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
        connected ? 'border-jade/40 bg-jade/10 text-jade-bright' : 'border-ink-700 bg-ink-900 text-paper-dim'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'animate-pulse bg-jade-bright' : 'bg-ink-700'}`} />
      Real-time
    </span>
  )
}
