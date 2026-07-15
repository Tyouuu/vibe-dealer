'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { LogoutButton } from './logout-button'
import type { Notification } from './topbar-menus'

type NavItem = { href: string; label: string }

// Below md: the rail nav, search trigger, and topbar icon menus don't fit a
// phone-width header, so they all collapse into this one hamburger panel —
// including notifications, since there's no separate bell icon on mobile.
export function MobileNav({
  items,
  roleLabel,
  email,
  notifications,
}: {
  items: NavItem[]
  roleLabel: string
  email: string | null
  notifications: Notification[]
}) {
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
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} className="icon-btn">
        {open ? (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-4 w-4">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        ) : (
          <>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-4 w-4">
              <path d="M3 5.5h14M3 10h14M3 14.5h14" />
            </svg>
            {notifications.length > 0 && <span className="dot" />}
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-0 top-[57px] z-40 max-h-[calc(100vh-57px)] overflow-y-auto border-b border-ink-800 bg-ink-900 px-4 py-3 shadow-2xl">
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
                      ? 'rounded-lg bg-paper px-3 py-2.5 text-sm font-bold text-white'
                      : 'rounded-lg px-3 py-2.5 text-sm font-medium text-paper-dim transition-colors hover:bg-ink-850 hover:text-paper'
                  }
                >
                  {item.label}
                </a>
              )
            })}
          </nav>

          {notifications.length > 0 && (
            <div className="mt-3 border-t border-ink-800 pt-3">
              <div className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-paper-dim">Notifications</div>
              {notifications.map((n, i) => (
                <div key={i} className="rounded-lg px-3 py-2">
                  <div className="text-[12.5px] font-bold text-paper">{n.title}</div>
                  <div className="mt-0.5 text-[11.5px] text-paper-dim">{n.subtitle}</div>
                </div>
              ))}
            </div>
          )}

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
