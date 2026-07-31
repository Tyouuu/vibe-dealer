'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// Restores the scroll position when you come back to a page.
//
// The browser already does this — but only for the *document* scroller, and
// on lg this app doesn't use it. The shell is `lg:h-screen lg:overflow-hidden`
// with `<main>` taking `lg:overflow-y-auto`, so the thing that scrolls is a
// div, and the document scroller never moves. There is nothing for the
// browser to restore, which is why Back always landed at the top of a
// 3000px dealer list. Geist lists "Back/Forward restores prior scroll" as a
// rule; we failed it on every page.
//
// Keyed on pathname + query, so a filtered list and the same list unfiltered
// are treated as different places — which they are. sessionStorage rather
// than memory so it survives a real browser navigation rather than only a
// client-side one.
//
// The restore runs in a rAF: on a fresh mount `main` exists but the rows
// below it may not have laid out yet, so setting scrollTop synchronously
// clamps to a height that hasn't arrived. One frame later it has.
export function RestoreScroll() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const key = `scroll:${pathname}?${searchParams.toString()}`

  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return

    const saved = sessionStorage.getItem(key)
    if (saved) {
      const top = Number(saved)
      if (Number.isFinite(top) && top > 0) {
        requestAnimationFrame(() => {
          main.scrollTop = top
        })
      }
    }

    // Written on scroll rather than on unmount: a hard navigation (a full
    // page load, a link to another origin, closing the tab) never runs the
    // cleanup, so unmount alone would lose the position exactly when the
    // browser's own restore also can't help.
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        sessionStorage.setItem(key, String(main.scrollTop))
      })
    }
    main.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      main.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [key])

  return null
}
