'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
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
  IconShoppingBagPlus,
  IconShield,
  IconSettings,
  IconLayers,
  IconLayersPlus,
} from './rail-icons'
import { IconBell, IconChevronDown } from './icons'

export type RailItem = { href: string; label: string; group: string; badge?: number }

const ICONS: Record<string, (props: { className?: string }) => React.JSX.Element> = {
  '/dashboard': IconGrid,
  '/dealers': IconUsersRail,
  '/onboard': IconUserPlus,
  '/entry': IconReceipt,
  '/records': IconList,
  '/delivery': IconTruckRail,
  '/sim-stock': IconLayers,
  '/sim-stock/log': IconLayersPlus,
  '/reports': IconChart,
  '/reconcile': IconReconcile,
  '/purchases': IconShoppingBag,
  '/purchases/new': IconShoppingBagPlus,
  '/audit': IconShield,
}

const PREVIEW_ROLES: Role[] = ['master', 'accountant', 'cs']

type Panel = 'profile' | null

// localStorage-backed store for the folded nav groups, read through
// useSyncExternalStore. Module scope so the snapshot functions keep a stable
// identity across renders — passing fresh closures re-subscribes on every
// render. The `storage` event covers other tabs; the custom event covers this
// one, which `storage` deliberately does not fire for.
const COLLAPSED_KEY = 'railCollapsedGroups'
const COLLAPSED_EVENT = 'rail-collapsed-change'

function subscribeToCollapsed(onChange: () => void) {
  window.addEventListener(COLLAPSED_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function getCollapsedSnapshot(): string {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) ?? ''
  } catch {
    return ''
  }
}

// Nothing folded on the server, so the first paint matches a fresh visitor.
function getCollapsedServerSnapshot(): string {
  return ''
}

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

  // Which nav groups the user has folded away.
  //
  // The rail holds thirteen destinations for a master, and measured against a
  // real laptop that does not fit: at a 720px viewport 204px of it — about
  // five items — sits below the fold and has to be scrolled to. Folding a
  // group you are not working in today is the way to get that back without
  // taking anything away.
  //
  // useSyncExternalStore rather than reading localStorage into state in an
  // effect. localStorage does not exist on the server, so a lazy initialiser
  // would render a different tree on each side and trip hydration; setting
  // state from an effect avoids that but is what the React compiler's
  // set-state-in-effect rule exists to stop. This is the shape the API was
  // added for: a server snapshot, a client snapshot, and a subscription.
  //
  // The snapshots return the raw string, not a parsed array — getSnapshot has
  // to be referentially stable or React re-renders forever, and JSON.parse
  // hands back a new array every call.
  const collapsedRaw = useSyncExternalStore(subscribeToCollapsed, getCollapsedSnapshot, getCollapsedServerSnapshot)
  const collapsed = useMemo<string[]>(() => {
    try {
      const parsed = JSON.parse(collapsedRaw || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [collapsedRaw])

  function toggleGroup(group: string) {
    const next = collapsed.includes(group) ? collapsed.filter((g) => g !== group) : [...collapsed, group]
    try {
      window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
    } catch {
      // A blocked or full localStorage must not take the navigation with it.
      // Without the write the store never changes and the group stays as it
      // was, which is the right failure: nothing is hidden.
    }
    window.dispatchEvent(new Event(COLLAPSED_EVENT))
  }

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
        {[...groups.entries()].map(([group, groupItems]) => {
          // A group of one is not worth a disclosure — the chevron would be
          // the only thing it hides.
          const collapsible = groupItems.length > 1
          // The group holding the current page never collapses. Otherwise the
          // first navigation inside a folded group hides the very item you
          // just landed on, and the rail stops telling you where you are.
          const holdsCurrent = groupItems.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
          const openGroup = !collapsible || holdsCurrent || !collapsed.includes(group)
          return (
          <div key={group}>
            {collapsible ? (
              <button
                type="button"
                className="rail-group-label flex w-full items-center justify-between gap-2 hover:text-paper"
                aria-expanded={openGroup}
                aria-controls={`rail-group-${group}`}
                onClick={() => toggleGroup(group)}
                // A folded group still contains the page you are on only while
                // that page is open; saying so stops the control looking stuck.
                title={holdsCurrent ? `${group} — holds the page you are on` : undefined}
              >
                <span>{group}</span>
                <IconChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${openGroup ? '' : '-rotate-90'}`} />
              </button>
            ) : (
              <div className="rail-group-label">{group}</div>
            )}
            <div id={`rail-group-${group}`} hidden={!openGroup}>
            {groupItems.map((item) => {
              const Icon = ICONS[item.href]
              // Longest match wins. A prefix test alone lit both SIM Card
              // Stock and Log SIM Stock on /sim-stock/log, because one href
              // is a prefix of the other. The same would happen to any
              // future child route, so the rule is "this item is active only
              // if no other item matches this path more specifically".
              const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
              const active = matches(item.href) && !items.some((o) => o.href !== item.href && o.href.startsWith(item.href) && matches(o.href))
              return (
                <a key={item.href} href={item.href} className={`rail-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                  {Icon && <Icon />}
                  <span className="lbl">{item.label}</span>
                  {item.badge != null && item.badge > 0 && <span className="badge">{item.badge}</span>}
                </a>
              )
            })}
            </div>
          </div>
          )
        })}
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
