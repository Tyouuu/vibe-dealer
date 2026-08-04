'use client'

import { useMemo, useState } from 'react'
import type { BuiltNotification } from '@/lib/notifications/build'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@/lib/notifications/preferences'
import { IconCheckCircle, IconTruck, IconCoin, IconUsers } from '../icons'

// Color used to live on the icon AND a left border-accent AND a solid-fill
// button — three repeats of the same category color per row, so a list
// mixing categories read as a wall of competing bright colors rather than a
// calm list with a hierarchy. Every row now shares one neutral border and
// one neutral (btn-ghost) action button; the icon tint is the only place
// category color still shows, which is enough for it to register at a
// glance without shouting.
const VARIANT_ICON_BG: Record<BuiltNotification['variant'], string> = {
  brass: 'bg-brass/12 text-brass-bright',
  clay: 'bg-clay/12 text-clay-bright',
  info: 'bg-info/12 text-info-bright',
  slate: 'bg-slate/12 text-slate-bright',
}

const CATEGORY_ICON: Record<NotificationCategory, (props: { className?: string }) => React.JSX.Element> = {
  pending_review: IconCheckCircle,
  deliveries: IconTruck,
  credit_reconciliation: IconCoin,
  dealer_activity: IconUsers,
}

type Sort = 'oldest' | 'newest'

export function NotificationsList({ notifications }: { notifications: BuiltNotification[] }) {
  const [filter, setFilter] = useState<NotificationCategory | 'all'>('all')
  const [sort, setSort] = useState<Sort>('oldest')

  const filtered = filter === 'all' ? notifications : notifications.filter((n) => n.category === filter)
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => (sort === 'oldest' ? b.staleDays - a.staleDays : a.staleDays - b.staleDays)),
    [filtered, sort]
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="segmented flex-wrap">
          <button type="button" onClick={() => setFilter('all')} className={`segmented-btn ${filter === 'all' ? 'active' : ''}`}>
            All
          </button>
          {NOTIFICATION_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={`segmented-btn ${filter === c.key ? 'active' : ''}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="segmented">
          <button type="button" onClick={() => setSort('oldest')} className={`segmented-btn ${sort === 'oldest' ? 'active' : ''}`}>
            Oldest first
          </button>
          <button type="button" onClick={() => setSort('newest')} className={`segmented-btn ${sort === 'newest' ? 'active' : ''}`}>
            Newest first
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink-800 py-14 text-center">
          <p className="text-sm text-paper-dim">
            {notifications.length === 0 ? "All clear — nothing needs your attention." : 'Nothing in this category right now.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((n) => {
            const Icon = CATEGORY_ICON[n.category]
            return (
              <div
                key={n.id}
                className="flex flex-col gap-3 rounded-xl border border-ink-800 bg-ink-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${VARIANT_ICON_BG[n.variant]}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  {/* truncate is load-bearing, not cosmetic: it's what makes a
                      full-width row legitimate. A row that wrapped to multiple
                      lines at this width would run past a readable line
                      length, which is exactly the case where a max-width would
                      be needed instead. */}
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-paper">{n.title}</div>
                    {/* Two lines on a phone, one on a wide screen — same reason as the
                        dashboard's alert rows. "0 pts left — log a Credit Purchase
                        before it blocks a sale" was arriving without the half that
                        says what happens if you ignore it. */}
                    <div className="mt-0.5 text-[12px] leading-snug text-paper-dim [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden sm:truncate">{n.subtitle}</div>
                  </div>
                </div>
                <a href={n.href} className="btn-ghost shrink-0 self-start py-1.5 text-xs sm:self-auto">
                  {n.actionLabel}
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
