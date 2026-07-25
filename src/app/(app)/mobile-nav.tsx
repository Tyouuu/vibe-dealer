'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LogoutButton } from './logout-button'
import { setPreviewRole } from './preview-role-actions'
import type { Notification } from './types'
import type { Role } from '@/lib/auth/dal'

type NavItem = { href: string; label: string }

const ROLE_LABEL: Record<Role, string> = { master: 'Master', accountant: 'Accountant', cs: 'CS' }
const PREVIEW_ROLES: Role[] = ['master', 'accountant', 'cs']

// Below md: the rail nav, search trigger, and topbar icon menus don't fit a
// phone-width header, so they all collapse into this one hamburger panel —
// including notifications and the role-preview switcher, since there's no
// separate bell/profile icon on mobile. This used to be split across this
// component AND TopbarMenus rendered side by side in the header, which
// meant a real phone screen showed the unread dot twice, Credit Balance
// twice, and Logout reachable from two different menus at once. One panel
// now, not two.
export function MobileNav({
  items,
  roleLabel,
  email,
  notifications,
  creditBalance,
  role,
  actualRole,
}: {
  items: NavItem[]
  roleLabel: string
  email: string | null
  notifications: Notification[]
  creditBalance?: { available: number; low: boolean }
  role: Role
  actualRole: Role
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const pathname = usePathname()
  const router = useRouter()

  function pickPreviewRole(r: Role) {
    startTransition(async () => {
      await setPreviewRole(r)
      router.refresh()
    })
  }

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
          {creditBalance && (
            <a
              href="/purchases"
              className={`mb-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-bold ${
                creditBalance.available <= 0
                  ? 'bg-clay/10 text-clay-bright'
                  : creditBalance.low
                    ? 'bg-brass/10 text-brass-bright'
                    : 'bg-ink-850 text-paper-dim'
              }`}
            >
              Credit balance
              <span>{creditBalance.available.toLocaleString()} pts</span>
            </a>
          )}
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
            <a
              href="/notifications"
              className={
                pathname === '/notifications'
                  ? 'flex items-center gap-2 rounded-lg bg-paper px-3 py-2.5 text-sm font-bold text-white'
                  : 'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-paper-dim transition-colors hover:bg-ink-850 hover:text-paper'
              }
            >
              Notifications
              {notifications.length > 0 && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-clay" />}
            </a>
            <a
              href="/account"
              className={
                pathname === '/account'
                  ? 'rounded-lg bg-paper px-3 py-2.5 text-sm font-bold text-white'
                  : 'rounded-lg px-3 py-2.5 text-sm font-medium text-paper-dim transition-colors hover:bg-ink-850 hover:text-paper'
              }
            >
              Account Settings
            </a>
          </nav>

          {actualRole === 'master' && (
            <div className="mt-3 border-t border-ink-800 pt-3">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-paper-dim">Demo: view as</div>
              <div className="flex gap-1.5">
                {PREVIEW_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={pending}
                    onClick={() => pickPreviewRole(r)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[11.5px] font-bold transition-colors disabled:opacity-60 ${
                      role === r ? 'border-primary bg-primary-soft text-primary-deep' : 'border-ink-800 text-paper-dim hover:bg-ink-850 hover:text-paper'
                    }`}
                  >
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-ink-800 pt-3">
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5">
                <span className="pill pill-neutral w-fit">{roleLabel}</span>
                {role !== actualRole && <span className="rounded-full bg-primary-soft px-1.5 py-px text-[9.5px] font-bold text-primary-deep">Preview</span>}
              </span>
              {email && <span className="text-[11px] text-paper-dim">{email}</span>}
            </div>
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  )
}
