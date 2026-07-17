'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogoutButton } from './logout-button'
import { setPreviewRole } from './preview-role-actions'
import { IconBell, IconChevronDown } from './icons'
import type { Role } from '@/lib/auth/dal'

export type Notification = { title: string; subtitle: string }

type Panel = 'notif' | 'profile' | null

const ROLE_LABEL: Record<Role, string> = { master: 'Master', accountant: 'Accountant', cs: 'CS' }
const PREVIEW_ROLES: Role[] = ['master', 'accountant', 'cs']

export function TopbarMenus({
  notifications,
  userName,
  roleLabel,
  role,
  actualRole,
}: {
  notifications: Notification[]
  userName: string
  roleLabel: string
  role: Role
  actualRole: Role
}) {
  const [open, setOpen] = useState<Panel>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const wrapRef = useRef<HTMLDivElement>(null)

  function pickPreviewRole(r: Role) {
    startTransition(async () => {
      await setPreviewRole(r)
      router.refresh()
    })
  }

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
          onClick={() => setOpen((p) => (p === 'profile' ? null : 'profile'))}
          aria-expanded={open === 'profile'}
          className="flex items-center gap-2.5 rounded-lg border border-ink-800 bg-ink-900 py-1 pl-1 pr-2.5 transition-colors hover:bg-ink-850"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-200 to-orange-300 text-[13px] font-bold text-orange-900">
            {initials}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block max-w-[120px] truncate text-[13.5px] font-bold text-paper">{userName}</span>
            <span className="flex items-center gap-1 text-[11.5px] text-paper-dim">
              {roleLabel}
              {role !== actualRole && <span className="rounded-full bg-primary-soft px-1.5 py-px text-[9.5px] font-bold text-primary-deep">Preview</span>}
            </span>
          </span>
          <IconChevronDown className="hidden h-3.5 w-3.5 text-paper-dim sm:block" />
        </button>
        {open === 'profile' && (
          <div className="dropdown-panel w-56">
            {actualRole === 'master' && (
              <>
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
                <div className="my-1 border-t border-ink-800" />
              </>
            )}
            <div className="px-1 pb-0.5">
              <LogoutButton />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
