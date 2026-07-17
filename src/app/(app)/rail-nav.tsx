'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogoutButton } from './logout-button'
import { CommandPalette } from './command-palette'
import { setPreviewRole } from './preview-role-actions'
import type { Notification } from './topbar-menus'
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
} from './rail-icons'
import { IconBell, IconHelp } from './icons'

export type RailItem = { href: string; label: string; group: string; badge?: number }
type NavItemLite = { href: string; label: string }
type DealerItem = { id: string; company_name: string }

const ICONS: Record<string, (props: { className?: string }) => React.JSX.Element> = {
  '/dashboard': IconGrid,
  '/dealers': IconUsersRail,
  '/onboard': IconUserPlus,
  '/entry': IconReceipt,
  '/records': IconList,
  '/delivery': IconTruckRail,
  '/reports': IconChart,
  '/reconcile': IconReconcile,
  '/purchases': IconShoppingBag,
  '/audit': IconShield,
}

const ROLE_LABEL: Record<Role, string> = { master: 'Master', accountant: 'Accountant', cs: 'CS' }
const PREVIEW_ROLES: Role[] = ['master', 'accountant', 'cs']

type Panel = 'notif' | 'help' | 'profile' | null

export function RailNav({
  items,
  dealers,
  notifications,
  userName,
  roleLabel,
  role,
  actualRole,
}: {
  items: RailItem[]
  dealers: DealerItem[]
  notifications: Notification[]
  userName: string
  roleLabel: string
  role: Role
  actualRole: Role
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState<Panel>(null)
  const [pending, startTransition] = useTransition()
  const wrapRef = useRef<HTMLDivElement>(null)

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

  const navItemsLite: NavItemLite[] = items.map((i) => ({ href: i.href, label: i.label }))
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'

  return (
    <aside className="rail group" ref={wrapRef}>
      <div className="mb-1.5 flex items-center gap-2.5 px-1.5 pb-4 pt-1.5">
        <LogoMark className="h-8 w-8 shrink-0" />
        <span className="overflow-hidden whitespace-nowrap text-base font-extrabold tracking-tight text-paper opacity-0 transition-opacity group-hover:opacity-100">
          DealerHub
        </span>
      </div>

      <CommandPalette navItems={navItemsLite} dealers={dealers} variant="rail" />

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

      <div className="mt-auto border-t border-ink-800 pt-2">
        <div className="relative">
          <button type="button" className="rail-item" onClick={() => setOpen((p) => (p === 'notif' ? null : 'notif'))} aria-expanded={open === 'notif'}>
            <span className="relative">
              <IconBell className="h-[18px] w-[18px]" />
              {notifications.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-[7px] w-[7px] rounded-full border-[1.5px] border-ink-900 bg-clay" />}
            </span>
            <span className="lbl">Notifications</span>
          </button>
          {open === 'notif' && (
            <div className="dropdown-panel-rail w-64">
              <div className="hd">Notifications</div>
              {notifications.length === 0 ? (
                <p className="px-2.5 py-4 text-center text-sm text-paper-dim">All clear — nothing needs attention.</p>
              ) : (
                notifications.map((n, i) => (
                  <div key={i} className="dropdown-notif-item">
                    <div className="text-[12.5px] font-bold text-paper">{n.title}</div>
                    <div className="mt-0.5 text-[11.5px] text-paper-dim">{n.subtitle}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" className="rail-item" onClick={() => setOpen((p) => (p === 'help' ? null : 'help'))} aria-expanded={open === 'help'}>
            <IconHelp className="h-[18px] w-[18px]" />
            <span className="lbl">Help</span>
          </button>
          {open === 'help' && (
            <div className="dropdown-panel-rail w-56">
              <div className="hd">Help</div>
              <Link href="/help" className="dropdown-item">
                Getting started guide
              </Link>
              <a href="mailto:support@creatiqai.com" className="dropdown-item">
                Contact support
              </a>
              <div className="px-2.5 py-2 text-xs text-paper-dim">DealerHub v1.0</div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            className="rail-item"
            onClick={() => setOpen((p) => (p === 'profile' ? null : 'profile'))}
            aria-expanded={open === 'profile'}
          >
            <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-gradient-to-br from-amber-200 to-orange-300 text-[9.5px] font-bold text-orange-900">
              {initials}
            </span>
            <span className="min-w-0 flex-1 overflow-hidden text-left leading-tight opacity-0 transition-opacity group-hover:opacity-100">
              <span className="block truncate">{userName}</span>
              <span className="flex items-center gap-1 text-[10.5px] font-medium normal-case text-paper-dim">
                {roleLabel}
                {role !== actualRole && <span className="rounded-full bg-primary-soft px-1.5 py-px text-[9px] font-bold text-primary-deep">Preview</span>}
              </span>
            </span>
          </button>
          {open === 'profile' && (
            <div className="dropdown-panel-rail w-56">
              <Link href="/account" className="dropdown-item">
                Account settings
              </Link>
              {actualRole === 'master' && (
                <>
                  <div className="my-1 border-t border-ink-800" />
                  <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wide text-paper-dim">Demo: view as</div>
                  <div className="flex gap-1 px-2.5 pb-2">
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
                </>
              )}
            </div>
          )}
        </div>

        <LogoutButton variant="rail" />
      </div>
    </aside>
  )
}
