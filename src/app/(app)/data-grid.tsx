'use client'

import { useEffect, useRef, useState } from 'react'
import type { TableId } from '@/lib/table-columns'

// A grid, not a page-length table.
//
// This replaces ScrollFade on the two big tables, and it exists because of the
// trade-off written up at length in that file: `overflow-x: auto` computes
// overflow-y to `auto` as well, which turns the wrapper into a scroll
// container on both axes and breaks `position: sticky` on the header — so
// ScrollFade only turned overflow on when the table was too wide, and accepted
// losing the sticky header when it did.
//
// Giving the box a height resolves that instead of trading it away. Once the
// wrapper is the vertical scroll container, the header sticks to *it* and
// stays put, and the horizontal scrollbar belongs to it too — which is the
// fix for the complaint that started this: the bar used to sit at the bottom
// of a 4,000px-tall table, so reaching it meant scrolling past every row, and
// having reached it you could no longer see the rows you were scrolling.
//
// It is the same shape Excel, Google Sheets, Airtable and AG Grid all use: a
// window onto the data, with the data moving behind it.
//
// Only from `md` up. On a phone a scroll container nested inside the page
// scroller fights the reader's thumb for every gesture, and there is no
// scrollbar to reach anyway — you swipe the table itself. Below `md` this
// stays what it always was: a full-height table that scrolls sideways.
export function DataGrid({
  id,
  label,
  children,
}: {
  id: TableId
  label: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Three separate facts, because they drive three different things: whether
  // this is a focusable region at all, and which of the two frozen edges is
  // currently covering something.
  const [scrollable, setScrollable] = useState(false)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  // The height comes from where this box actually starts, not from a guess at
  // how much page sits above it.
  //
  // It was `calc(100vh - 290px)`, and 290 was wrong: /records carries a
  // header, a KPI card, a two-row toolbar, a filter bar and a totals strip
  // above the grid, which pushed the bottom edge — and with it the horizontal
  // scrollbar — back below the fold. That is the exact complaint this whole
  // change exists to fix, so the number cannot be a guess, and it cannot be
  // one number for two pages that carry different chrome.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Below md the grid is a plain full-height table again — see the comment
    // at the top — so it must not be given a height at all.
    const wide = window.matchMedia('(min-width: 768px)')

    function fit() {
      if (!el) return
      if (!wide.matches) {
        el.style.maxHeight = ''
        return
      }
      // 72px leaves the pager underneath. Measured from the box's own
      // position, so scrolling the page does not change the answer.
      //
      // The floor can lose to the ceiling, and that is deliberate: on a short
      // window with a full-width alert band also on the page there is simply
      // not room for both, and 300px of grid one short scroll down beats four
      // rows in a letterbox. Even then the bar is ~80px below the fold rather
      // than at the bottom of a 4,000px table, which was the whole complaint.
      const top = el.getBoundingClientRect().top + window.scrollY
      const avail = window.innerHeight - (top - window.scrollY) - 72
      // The floor is eight rows, and it is allowed to beat the available
      // space. A window that only fits four rows of a fifty-row ledger is a
      // letterbox — "有一点偏离主题", as the owner put it, the page stops being
      // about transactions. Below the floor the page simply scrolls, which
      // still leaves the horizontal bar a short scroll away rather than at the
      // bottom of a 4,000px table.
      el.style.maxHeight = `${Math.max(520, Math.min(760, avail))}px`
    }

    fit()
    window.addEventListener('resize', fit)
    wide.addEventListener('change', fit)
    // Anything above the grid changing height moves the grid — a filter chip
    // wrapping to a second line, an alert banner appearing.
    const ro = new ResizeObserver(fit)
    if (document.body) ro.observe(document.body)
    return () => {
      window.removeEventListener('resize', fit)
      wide.removeEventListener('change', fit)
      ro.disconnect()
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function sync() {
      if (!el) return
      const overflows = el.scrollWidth - el.clientWidth > 2
      setScrollable(overflows)
      setAtStart(el.scrollLeft <= 2)
      setAtEnd(!overflows || el.scrollWidth - el.scrollLeft - el.clientWidth <= 2)
    }

    sync()
    // ResizeObserver as well as the scroll listener: hiding a column through
    // the Columns menu changes the overflow without any scrolling happening,
    // and a frozen edge still casting a shadow over nothing is a lie about
    // there being more to the right.
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    const table = el.firstElementChild
    if (table) ro.observe(table)
    el.addEventListener('scroll', sync, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', sync)
    }
  }, [])

  return (
    <div
      id={`grid-${id}`}
      ref={ref}
      {...(scrollable ? { role: 'region', 'aria-label': label, tabIndex: 0 } : {})}
      className={`grid-viewport ${atStart ? '' : 'is-scrolled'} ${atEnd ? '' : 'has-more-right'} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
    >
      {children}
    </div>
  )
}
