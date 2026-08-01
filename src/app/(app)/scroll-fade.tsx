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
//
// The overflow class is applied CONDITIONALLY, and that detail is load-
// bearing rather than an optimisation. CSS will not let a box scroll on one
// axis and stay visible on the other: setting overflow-x:auto computes
// overflow-y from `visible` to `auto`, which turns this div into a scroll
// container on both axes. That silently breaks `position: sticky` on the
// table header inside it — the header sticks to THIS box (which never scrolls
// vertically, being height-auto) instead of to the page, so it just scrolls
// away. Measured before and after: a sticky .th went from top 343px to
// top −257px on a 600px scroll. Leaving overflow at its default while the
// table fits — the normal case on a desktop — lets the header stick to the
// real scroll container. When the table genuinely is too wide, horizontal
// scrolling wins and the header gives up stickiness; that's the correct
// trade, since not being able to read a column at all is worse.
export function ScrollFade({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  // Two separate flags on purpose: `scrollable` is "is there anything off to
  // the side at all" (drives the region/tabIndex), `atEnd` is "is there more
  // to the RIGHT right now" (drives the fade, so it disappears once you've
  // scrolled all the way over and stops lying about remaining content).
  const [scrollable, setScrollable] = useState(false)
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    function check() {
      if (!outer || !inner) return
      // Measured off the INNER wrapper, not the outer box. While overflow is
      // visible the outer box's own scrollWidth already includes the overhang,
      // so comparing it against its own clientWidth would report "fits" and
      // the two states would flip-flop against each other.
      const overflows = inner.scrollWidth - outer.clientWidth > 4
      setScrollable(overflows)
      setAtEnd(overflows ? outer.scrollWidth - outer.scrollLeft - outer.clientWidth <= 4 : true)
    }

    check()
    // ResizeObserver rather than a one-time measurement: a table can go from
    // clipped to fitting on a rotation or an ancestor resize, with no scroll
    // event involved. Both boxes are observed because either can change.
    const ro = new ResizeObserver(check)
    ro.observe(outer)
    ro.observe(inner)
    outer.addEventListener('scroll', check)
    return () => {
      ro.disconnect()
      outer.removeEventListener('scroll', check)
    }
  }, [])

  return (
    <div className="relative">
      <div
        ref={outerRef}
        {...(scrollable ? { role: 'region', 'aria-label': label, tabIndex: 0 } : {})}
        className={`${scrollable ? 'overflow-x-auto' : ''} focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className ?? ''}`}
      >
        <div ref={innerRef}>
          {children}
        </div>
      </div>
      {scrollable && !atEnd && (
        // The fade has to end in whatever surface the table is actually on.
        // It was hardcoded to the card white, which was right while every
        // table lived in a card; index pages put theirs on the canvas, so
        // the colour comes from --fade-from and .index-surface overrides it.
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-8"
          style={{ background: 'linear-gradient(to left, var(--fade-from, var(--color-ink-900)), transparent)' }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
