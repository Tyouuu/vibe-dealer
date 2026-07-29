'use client'

import { useEffect, useRef, useState } from 'react'

// Wraps a wide table with the two things a horizontally-scrolling table
// legally and practically needs:
//
//  1. Keyboard access. A plain overflow-x:auto div is unreachable by
//     keyboard — WCAG 2.1.1 (Level A) and axe's `scrollable-region-focusable`
//     rule (Serious) both fail on it. Chrome only shipped natively-focusable
//     scroll containers in 132 and WebKit still hasn't, so the explicit
//     tabIndex is required, not belt-and-braces. Pairing it with
//     role="region" + an accessible name is Adrian Roselli's pattern:
//     https://adrianroselli.com/2020/11/under-engineered-responsive-tables.html
//     Both are applied ONLY while the content actually overflows, so a table
//     that fits doesn't leave a dead tab stop behind on a wide screen.
//
//  2. A visible hint that there IS more sideways. Nielsen Norman's testing
//     found people don't expect to scroll sideways and miss it without a
//     cue; the native scrollbar can't be that cue on its own, since the OS
//     may hide it and on a long table it sits below the fold entirely.
//     Atlassian's elevation guidance reserves an overflow shadow for
//     exactly this case — "tables that use borders to separate cells".
export function ScrollFade({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  // Two separate flags on purpose: `scrollable` is "is there anything off to
  // the side at all" (drives the region/tabIndex), `atEnd` is "is there more
  // to the RIGHT right now" (drives the fade, so it disappears once you've
  // scrolled all the way over and stops lying about remaining content).
  const [scrollable, setScrollable] = useState(false)
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function check() {
      if (!el) return
      setScrollable(el.scrollWidth - el.clientWidth > 4)
      setAtEnd(el.scrollWidth - el.scrollLeft - el.clientWidth <= 4)
    }

    check()
    // ResizeObserver rather than a one-time measurement: a table can go from
    // clipped to fitting on a rotation or an ancestor resize, with no scroll
    // event involved.
    const ro = new ResizeObserver(check)
    ro.observe(el)
    el.addEventListener('scroll', check)
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', check)
    }
  }, [])

  return (
    <div className="relative">
      <div
        ref={ref}
        {...(scrollable ? { role: 'region', 'aria-label': label, tabIndex: 0 } : {})}
        className={`overflow-x-auto focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className ?? ''}`}
      >
        {children}
      </div>
      {scrollable && !atEnd && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-ink-900 to-transparent" aria-hidden="true" />
      )}
    </div>
  )
}
