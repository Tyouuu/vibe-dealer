'use client'

import { useState, useTransition } from 'react'
import type { NotificationCategory } from '@/lib/notifications/preferences'
import { setNotificationsMasterEnabled, setNotificationCategoryEnabled } from './actions'

export function NotificationPrefsForm({
  masterEnabled: initialMasterEnabled,
  categories: initialCategories,
  visibleCategories,
}: {
  masterEnabled: boolean
  categories: Record<NotificationCategory, boolean>
  visibleCategories: { key: NotificationCategory; label: string; description: string }[]
}) {
  const [masterEnabled, setMasterEnabled] = useState(initialMasterEnabled)
  const [categories, setCategories] = useState(initialCategories)
  const [, startTransition] = useTransition()

  function toggleMaster() {
    const next = !masterEnabled
    setMasterEnabled(next)
    startTransition(() => {
      setNotificationsMasterEnabled(next)
    })
  }

  function toggleCategory(key: NotificationCategory) {
    const next = !categories[key]
    setCategories((prev) => ({ ...prev, [key]: next }))
    startTransition(() => {
      setNotificationCategoryEnabled(key, next)
    })
  }

  return (
    <div className="flex flex-col gap-3.5">
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-ink-800 bg-ink-850 px-3.5 py-2.5">
        <span className="text-sm font-semibold text-paper">All notifications</span>
        <input type="checkbox" checked={masterEnabled} onChange={toggleMaster} className="h-4 w-4 accent-primary" />
      </label>

      <div className={masterEnabled ? '' : 'pointer-events-none opacity-40'}>
        <div className="flex flex-col divide-y divide-ink-800 rounded-lg border border-ink-800">
          {visibleCategories.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5">
              <span>
                <span className="block text-[13px] font-semibold text-paper">{c.label}</span>
                <span className="block text-[12px] text-paper-dim">{c.description}</span>
              </span>
              <input
                type="checkbox"
                checked={categories[c.key]}
                onChange={() => toggleCategory(c.key)}
                disabled={!masterEnabled}
                className="h-4 w-4 shrink-0 accent-primary"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
