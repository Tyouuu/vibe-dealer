'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { LogoutButton } from './logout-button'

type NavItem = { href: string; label: string }

// Below md: the full pill-row NavLinks + search trigger + email don't fit a
// phone-width header, so they all collapse into this one hamburger panel
// instead of silently overflowing.
export function MobileNav({ items, roleLabel, email }: { items: NavItem[]; roleLabel: string; email: string | null }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close the panel on navigation. Adjusted during render (React's supported
  // pattern for "reset state when a prop changes") rather than in an effect,
  // so it doesn't trigger an extra commit-then-rerender pass.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setOpen(false)
  }

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink-700 text-paper transition-colors hover:bg-ink-850"
      >
        {open ? (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-4 w-4">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-4 w-4">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" />
          </svg>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-0 top-[57px] z-40 max-h-[calc(100vh-57px)] overflow-y-auto border-b border-ink-800 bg-ink-950 px-4 py-3 shadow-2xl">
          <nav className="flex flex-col gap-0.5">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'rounded-lg bg-jade/10 px-3 py-2.5 text-sm font-semibold text-jade-bright'
                      : 'rounded-lg px-3 py-2.5 text-sm font-medium text-paper-dim transition-colors hover:bg-ink-850 hover:text-paper'
                  }
                >
                  {item.label}
                </a>
              )
            })}
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-ink-800 pt-3">
            <div className="flex flex-col gap-1">
              <span className="pill pill-neutral w-fit">{roleLabel}</span>
              {email && <span className="text-[11px] text-paper-dim">{email}</span>}
            </div>
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  )
}
