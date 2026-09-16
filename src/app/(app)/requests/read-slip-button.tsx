'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconPaperclip } from '../icons'

// One button beside the payment slip link.
//
// Not a form action: the read writes to the row through an RPC and the page
// is a server component, so the honest job here is "call, then refresh" —
// router.refresh() re-runs the server render and the comparison appears in
// the row itself rather than in this component's own state. That matters
// because a second reviewer opening the page later must see the same reading,
// and state in a button is nobody's record.
export function ReadSlipButton({ requestId, alreadyRead }: { requestId: string; alreadyRead: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/requests/read-slip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'That did not work.')
      }
    } catch {
      setError('That did not work — check your connection.')
    } finally {
      setBusy(false)
      start(() => router.refresh())
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={busy || pending}
        className={`inline-flex items-center gap-1.5 text-[12px] font-semibold hover:underline disabled:opacity-60 ${
          // Unread carries the same colour "no rate on file" and "looks like a
          // repeat" already use on this page — a slip nobody has checked yet
          // is a fact worth the same weight, not a lower-priority version of
          // "Read it again" in the page's ordinary link colour.
          alreadyRead || busy || pending ? 'text-primary' : 'text-brass-bright'
        }`}
      >
        <IconPaperclip className="h-3.5 w-3.5" />
        {busy || pending ? 'Reading the slip…' : alreadyRead ? 'Read it again' : 'Read the slip — not checked yet'}
      </button>
      {error && <span className="text-[12px] text-clay-bright">{error}</span>}
    </>
  )
}
