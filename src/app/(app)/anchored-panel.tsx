'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// A panel that opens next to something without being trapped by it.
//
// `.dropdown-panel` is `absolute … z-50`, which works everywhere it was used
// until the trigger ends up inside two things at once:
//
//   1. a `position: sticky` cell, which creates its own stacking context — so
//      z-50 only ranks the panel *within that cell*, and the next row's cell,
//      later in the DOM at the same z-index, paints straight over it;
//   2. a `overflow: auto` scroller, which clips anything leaving its box.
//
// The frozen Action column on /records is both. The Flag panel opened cut in
// half and underneath the buttons of the rows below it.
//
// Fixed position in a portal on <body> escapes both: no ancestor's stacking
// context and no ancestor's overflow. The cost is that the panel no longer
// moves with its trigger, so it is repositioned on every scroll and resize —
// cheap, and only while open.
export function AnchoredPanel({
  anchor,
  open,
  onClose,
  width = 288,
  label,
  children,
}: {
  anchor: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  width?: number
  /** Names the panel for assistive technology, since it is no longer beside its trigger in the DOM. */
  label: string
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Layout effect, not effect: measuring after paint would show the panel at
  // 0,0 for a frame first.
  useLayoutEffect(() => {
    // No state reset on close: the component renders nothing while closed, and
    // place() runs before the next paint when it reopens, so a stale position
    // is never shown. Clearing it here would be a setState inside an effect
    // for no visible benefit.
    if (!open) return

    function place() {
      const el = anchor.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const gap = 6
      const margin = 8
      const height = panelRef.current?.offsetHeight ?? 0

      // Right-aligned to the trigger, because these open from a control at the
      // right edge of a row. Clamped so a panel near either edge stays whole.
      let left = r.right - width
      left = Math.min(Math.max(margin, left), window.innerWidth - width - margin)

      // Below unless below would not fit, then above. Never off the top.
      let top = r.bottom + gap
      if (height && top + height > window.innerHeight - margin) {
        top = Math.max(margin, r.top - gap - height)
      }
      setPos({ top, left })
    }

    place()
    // Capture phase: the scroller that matters here is the grid, not the
    // window, and a scroll inside it does not bubble.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, anchor, width])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchor])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      // Hidden until placed, rather than rendered at the origin and moved.
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
      className="z-[60] rounded-xl border border-ink-800 bg-ink-900 p-3 shadow-2xl"
    >
      {children}
    </div>,
    document.body
  )
}
