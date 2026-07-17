'use client'

import { useMemo, useState } from 'react'
import type { BuiltNotification } from '@/lib/notifications/build'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@/lib/notifications/preferences'

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

export function NotificationsList({ notifications }: { notifications: BuiltNotification[] }) {
  const [filter, setFilter] = useState<NotificationCategory | 'all'>('all')

  const presentCategories = useMemo(
    () => NOTIFICATION_CATEGORIES.filter((c) => notifications.some((n) => n.category === c.key)),
    [notifications]
  )

  const filtered = filter === 'all' ? notifications : notifications.filter((n) => n.category === filter)

  return (
    <div className="flex flex-col gap-4">
      {presentCategories.length > 1 && (
        <div className="segmented flex-wrap">
          <button type="button" onClick={() => setFilter('all')} className={`segmented-btn ${filter === 'all' ? 'active' : ''}`}>
            All ({notifications.length})
          </button>
          {presentCategories.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={`segmented-btn ${filter === c.key ? 'active' : ''}`}
            >
              {c.label} ({notifications.filter((n) => n.category === c.key).length})
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink-800 py-14 text-center">
          <p className="text-sm text-paper-dim">
            {notifications.length === 0 ? "All clear — nothing needs your attention." : 'Nothing in this category right now.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map((n) => (
            <div
              key={n.id}
              className={`flex flex-col gap-2 rounded-lg border border-ink-800 bg-ink-900 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${VARIANT_TR[n.variant]}`}
            >
              <div className="min-w-0">
                <div className="text-[12.5px] font-bold text-paper">{n.title}</div>
                <div className="mt-0.5 text-[11.5px] text-paper-dim">{n.subtitle}</div>
              </div>
              <a
                href={n.href}
                className={`shrink-0 self-start rounded-md px-3 py-1.5 text-xs font-bold text-white transition-colors sm:self-auto ${VARIANT_BTN[n.variant]}`}
              >
                {n.actionLabel}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
