'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { setPreviewRole } from './preview-role-actions'
import { ROLE_LABEL, type Notification } from './types'
import type { Role } from '@/lib/auth/dal'
import {
  LogoMark,
  IconGrid,
  IconUsersRail,
  IconUserPlus,
  IconReceipt,
  IconList,
  IconTruckRail,
  IconChart,
  IconReconcile,
  IconShoppingBag,
  IconShield,
  IconSettings,
  IconLayers,
} from './rail-icons'
import { IconBell } from './icons'

export type RailItem = { href: string; label: string; group: string; badge?: number }

const ICONS: Record<string, (props: { className?: string }) => React.JSX.Element> = {
  '/dashboard': IconGrid,
  '/dealers': IconUsersRail,
  '/onboard': IconUserPlus,
  '/entry': IconReceipt,
  '/records': IconList,
  '/delivery': IconTruckRail,
  '/sim-stock': IconLayers,
  '/reports': IconChart,
  '/reconcile': IconReconcile,
  '/purchases': IconShoppingBag,
  '/audit': IconShield,
}

const PREVIEW_ROLES: Role[] = ['master', 'accountant', 'cs']

type Panel = 'profile' | null

export function RailNav({
  items,
  notifications,
  userName,
  roleLabel,
  role,
  actualRole,
  creditBalance,
}: {
  items: RailItem[]
  notifications: Notification[]
  userName: string
  roleLabel: string
  role: Role
  actualRole: Role
  /** Finance roles only; cs has no financial visibility. */
  creditBalance?: { available: number; low: boolean; empty: boolean }
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState<Panel>(null)
  const [pending, startTransition] = useTransition()
  const wrapRef = useRef<HTMLDivElement>(null)
  const profileTriggerRef = useRef<HTMLButtonElement>(null)

  // Close whatever panel is open on navigation — clicking a nav link is a
  // click "inside" the rail (the outside-click handler below only closes on
  // clicks outside the whole aside), and layout components like this one
  // persist across route changes rather than remounting.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setOpen(null)
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  function closeProfilePanel() {
    setOpen(null)
    profileTriggerRef.current?.focus()
  }

  function pickPreviewRole(r: Role) {
    startTransition(async () => {
      await setPreviewRole(r)
      router.refresh()
    })
  }

  const groups = new Map<string, RailItem[]>()
  for (const item of items) {
    const list = groups.get(item.group) ?? []
    list.push(item)
    groups.set(item.group, list)
  }

  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'

  return (
    <aside className="rail" ref={wrapRef}>
      <Link href="/dashboard" className="flex items-center gap-2.5 px-1.5 pb-3 pt-1.5">
        <LogoMark className="h-8 w-8 shrink-0" />
        <span className="overflow-hidden whitespace-nowrap text-base font-semibold tracking-tight text-paper">DealerHub</span>
      </Link>

      {/* Credit balance sits with the brand mark, the way Vercel and Linear
          put the workspace/team context at the top of their rail.
          
          Third placement, and the reasoning for moving it again: it was a
          white card in a white top bar (read as a foreign plank), then a
          chip in a canvas-coloured top bar (a 41px full-width strip holding
          one small thing in the far corner — still mostly empty). The strip
          was always the problem, not the chip. There is no strip now: the
          whole desktop header is gone and every page starts at the top of
          the viewport. */}
      {creditBalance && (
        <a href="/purchases" className="rail-balance" title="Credit balance — points bought from Vibe Mobile and not yet resold. New transactions are blocked when this reaches zero.">
          <span
            className={`status-dot ${creditBalance.empty ? 'bg-clay-bright' : creditBalance.low ? 'bg-brass-bright' : 'bg-jade-bright'}`}
          />
          <span className="text-paper-dim">Credit</span>
          <span className="ml-auto font-semibold tabular-nums text-paper">{creditBalance.available.toLocaleString()}</span>
          <span className="text-paper-dim">pts</span>
        </a>
      )}

      {/* flex-1 + overflow-y-auto — .rail is a fixed h-screen column with no
          scroll of its own, so once the nav groups plus the footer below
          together outgrow the viewport (easy to hit: more nav items for
          master/accountant, or just less effective height at 100% zoom than
          at 80%), whatever didn't fit was simply cut off past the bottom
          edge with no way to reach it. This section now scrolls on its own
          when it needs to, while the footer (Notifications/Account
          Settings/profile) stays pinned and always reachable. */}
      <div className="flex-1 overflow-y-auto">
        {[...groups.entries()].map(([group, groupItems]) => (
          <div key={group}>
            <div className="rail-group-label">{group}</div>
            {groupItems.map((item) => {
              const Icon = ICONS[item.href]
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <a key={item.href} href={item.href} className={`rail-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                  {Icon && <Icon />}
                  <span className="lbl">{item.label}</span>
                  {item.badge != null && item.badge > 0 && <span className="badge">{item.badge}</span>}
                </a>
              )
            })}
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-ink-800 pt-2">
        <Link href="/notifications" className={`rail-item${pathname === '/notifications' ? ' active' : ''}`}>
          <span className="relative">
            <IconBell className="h-[18px] w-[18px]" />
            {notifications.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-[7px] w-[7px] rounded-full border-[1.5px] border-ink-900 bg-clay" />}
          </span>
          <span className="lbl">Notifications</span>
        </Link>

        <Link href="/account" className="rail-item">
          <IconSettings className="h-[18px] w-[18px]" />
          <span className="lbl">Account Settings</span>
        </Link>

        {actualRole === 'master' ? (
          <div className="relative" onKeyDown={(e) => e.key === 'Escape' && closeProfilePanel()}>
            <button
              ref={profileTriggerRef}
              type="button"
              className="rail-item"
              onClick={() => setOpen((p) => (p === 'profile' ? null : 'profile'))}
              aria-haspopup="true"
              aria-expanded={open === 'profile'}
            >
              <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-ink-800 text-[12px] font-semibold text-paper">
                {initials}
              </span>
              <span className="min-w-0 flex-1 overflow-hidden text-left leading-tight">
                <span className="block truncate">{userName}</span>
                <span className="flex items-center gap-1 text-[12px] font-medium normal-case text-paper-dim">
                  {roleLabel}
                  {role !== actualRole && <span className="rounded-full bg-primary-soft px-1.5 py-px text-[11px] font-semibold text-primary-deep">Preview</span>}
                </span>
              </span>
            </button>
            {open === 'profile' && (
              <div className="dropdown-panel-rail w-56">
                <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-paper-dim">Demo: view as</div>
                <div className="flex gap-1 px-2.5 pb-2">
                  {PREVIEW_ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={pending}
                      onClick={() => pickPreviewRole(r)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
                        role === r ? 'border-primary bg-primary-soft text-primary-deep' : 'border-ink-800 text-paper-dim hover:bg-ink-850 hover:text-paper'
                      }`}
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rail-item cursor-default hover:bg-transparent hover:text-paper-dim">
            <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-ink-800 text-[12px] font-semibold text-paper">
              {initials}
            </span>
            <span className="min-w-0 flex-1 overflow-hidden text-left leading-tight">
              <span className="block truncate">{userName}</span>
              <span className="block text-[12px] font-medium normal-case text-paper-dim">{roleLabel}</span>
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}
