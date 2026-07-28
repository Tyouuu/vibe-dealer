'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

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
  // Every row-based caller (AdjustButton, VerifyButton, ConfirmSubmitButton
  // in a table) renders this inline inside that row's own DOM position —
  // and rows needing their Action column to escape the stretched-row-link
  // (see records/page.tsx) gave that column `relative z-10`. Since every
  // row shares that same z-10, ties resolve by DOM order, so a LATER row's
  // z-10 stacking context paints *above* an EARLIER row's — including
  // whatever's nested inside that earlier row, like this modal's own
  // backdrop. That let a second row's button be clicked right through a
  // first row's still-open modal, opening a second modal on top of the
  // first and stacking their bg-black/50 scrims into something darker each
  // time. Portaling to document.body — a single shared ancestor outside
  // every row's stacking context — is what actually fixes it; z-index
  // tuning alone can't, since the problem is which stacking context the
  // modal belongs to, not what number it carries within it.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Every caller starts `open` as local useState(false) and only flips it
  // true from a client-side event handler, well after mount — so `open`
  // is never true during the server render pass, and document.body below
  // is never reached before it exists.
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm rounded-2xl border border-ink-800 bg-ink-900 p-5 shadow-2xl ${className ?? ''}`}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
