'use client'

import { useEffect } from 'react'

// The scrim is deliberately plain black, not one of the app's own --color-ink-*
// tokens — those are all light (this is a white/purple theme; "ink" is a
// leftover name from an earlier dark palette), so dimming the background
// behind a modal needs a real dark overlay regardless of the app's own theme.
export function Modal({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm rounded-2xl border border-ink-800 bg-ink-900 p-5 shadow-2xl ${className ?? ''}`}
      >
        {children}
      </div>
    </div>
  )
}
