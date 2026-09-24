'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DuplicateHit, ExtractedSlip, ReadResponse } from '@/lib/slip-extract'

// Reading a payment slip from inside a form: hand it a file, get back what the slip says and whether
// it has been recorded before. Shared by New Transaction and Log Purchase so the two cannot behave
// differently about the same piece of paper.
//
// The reader only reports. It never touches the form: the caller decides which of its own EMPTY
// fields to fill, and says so on screen. A reading that overwrote what a person had typed would be a
// model quietly winning an argument with the one who was in the room.

export type SlipState =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'done'; slip: ExtractedSlip; duplicate: DuplicateHit | null }
  | { status: 'failed'; message: string }

export function useSlipReader(target: 'entry' | 'purchase') {
  const [state, setState] = useState<SlipState>({ status: 'idle' })
  // Attaching a second slip while the first is still being read must not let the first one's answer
  // land on top of the second's.
  const latest = useRef(0)

  const read = useCallback(
    async (file: File): Promise<ReadResponse | null> => {
      const mine = ++latest.current
      setState({ status: 'reading' })
      try {
        const body = new FormData()
        body.set('file', file)
        body.set('target', target)
        const res = await fetch('/api/receipts/read', { method: 'POST', body })
        // A signed-out session redirects to the login page, which is HTML, not JSON.
        const json = res.headers.get('content-type')?.includes('json')
          ? ((await res.json()) as Partial<ReadResponse> & { error?: string })
          : { error: 'You have been signed out — sign in again.' }
        if (mine !== latest.current) return null
        if (!res.ok || !json.slip) {
          setState({ status: 'failed', message: json.error ?? 'That did not work — type the figures in.' })
          return null
        }
        const result = { slip: json.slip, duplicate: json.duplicate ?? null }
        setState({ status: 'done', ...result })
        return result
      } catch {
        if (mine === latest.current) setState({ status: 'failed', message: 'That did not work — check your connection, or type the figures in.' })
        return null
      }
    },
    [target],
  )

  const reset = useCallback(() => {
    latest.current++
    setState({ status: 'idle' })
  }, [])

  return { state, read, reset }
}

/**
 * Pasting an image anywhere on the page attaches it. A payment slip usually arrives as a WhatsApp
 * screenshot on the same computer: copy it, Ctrl+V, and the form fills itself — no saving a file to
 * the desktop to find it again in a picker.
 */
export function usePasteImage(onImage: (file: File) => void) {
  const handler = useRef(onImage)
  useEffect(() => {
    handler.current = onImage
  })

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (file) handler.current(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])
}
