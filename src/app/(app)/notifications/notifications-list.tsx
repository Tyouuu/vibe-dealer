'use client'

import { useMemo, useState } from 'react'
import type { BuiltNotification } from '@/lib/notifications/build'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@/lib/notifications/preferences'
import { IconCheckCircle, IconTruck, IconCoin, IconUsers } from '../icons'

const VARIANT_TR: Record<BuiltNotification['variant'], string> = {
  brass: 'tr-warn',
  clay: 'tr-urgent',
  info: 'tr-info',
  slate: 'tr-slate',
}

// .btn-primary's own bg-paper is overridden by these — same specificity,
// later in the generated stylesheet (utilities layer beats components layer
// in Tailwind v4), so the plain utility class wins.
const VARIANT_BTN: Record<BuiltNotification['variant'], string> = {
  brass: 'bg-brass-bright hover:bg-brass',
  clay: 'bg-clay-bright hover:bg-clay',
  info: 'bg-info hover:bg-info-bright',
  slate: 'bg-slate-bright hover:bg-slate',
}

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

  const countFor = (key: NotificationCategory) => notifications.filter((n) => n.category === key).length

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
            All ({notifications.length})
          </button>
          {NOTIFICATION_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={`segmented-btn ${filter === c.key ? 'active' : ''}`}
            >
              {c.label} ({countFor(c.key)})
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
                className={`flex flex-col gap-3 rounded-xl border border-ink-800 bg-ink-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${VARIANT_TR[n.variant]}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${VARIANT_ICON_BG[n.variant]}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-paper">{n.title}</div>
                    <div className="mt-0.5 text-[12px] text-paper-dim">{n.subtitle}</div>
                  </div>
                </div>
                <a
                  href={n.href}
                  className={`shrink-0 self-start rounded-lg px-3.5 py-1.5 text-xs font-bold text-white transition-colors sm:self-auto ${VARIANT_BTN[n.variant]}`}
                >
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
