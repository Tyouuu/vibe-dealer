'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LogoutButton } from './logout-button'
import { IconBell, IconHelp, IconChevronDown } from './icons'

export type Notification = { title: string; subtitle: string }

type Panel = 'notif' | 'help' | 'profile' | null

export function TopbarMenus({
  notifications,
  userName,
  roleLabel,
}: {
  notifications: Notification[]
  userName: string
  roleLabel: string
}) {
  const [open, setOpen] = useState<Panel>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?'

  return (
    <div ref={wrapRef} className="flex items-center gap-2.5">
      <div className="relative">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOpen((p) => (p === 'notif' ? null : 'notif'))}
          aria-label="Notifications"
          aria-expanded={open === 'notif'}
        >
          <IconBell />
          {notifications.length > 0 && <span className="dot" />}
        </button>
        {open === 'notif' && (
          <div className="dropdown-panel w-64">
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
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOpen((p) => (p === 'help' ? null : 'help'))}
          aria-label="Help"
          aria-expanded={open === 'help'}
        >
          <IconHelp />
        </button>
        {open === 'help' && (
          <div className="dropdown-panel w-56">
            <div className="hd">Help</div>
            <a href="/PROJECT_SPEC.md" target="_blank" rel="noopener noreferrer" className="dropdown-item">
              Getting started guide
            </a>
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
          onClick={() => setOpen((p) => (p === 'profile' ? null : 'profile'))}
          aria-expanded={open === 'profile'}
          className="flex items-center gap-2.5 rounded-lg border border-ink-800 bg-ink-900 py-1 pl-1 pr-2.5 transition-colors hover:bg-ink-850"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-200 to-orange-300 text-[13px] font-bold text-orange-900">
            {initials}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block max-w-[120px] truncate text-[13.5px] font-bold text-paper">{userName}</span>
            <span className="block text-[11.5px] text-paper-dim">{roleLabel}</span>
          </span>
          <IconChevronDown className="hidden h-3.5 w-3.5 text-paper-dim sm:block" />
        </button>
        {open === 'profile' && (
          <div className="dropdown-panel w-52">
            <Link href="/account" className="dropdown-item">
              Account settings
            </Link>
            <div className="my-1 border-t border-ink-800" />
            <div className="px-1 pb-0.5">
              <LogoutButton />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
