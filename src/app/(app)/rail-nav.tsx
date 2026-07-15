'use client'

import { usePathname } from 'next/navigation'
import { LogoutButton } from './logout-button'
import { LogoMark, IconGrid, IconUsersRail, IconUserPlus, IconReceipt, IconList, IconTruckRail, IconChart, IconReconcile, IconShield } from './rail-icons'

export type RailItem = { href: string; label: string; group: string; badge?: number }

const ICONS: Record<string, (props: { className?: string }) => React.JSX.Element> = {
  '/dashboard': IconGrid,
  '/dealers': IconUsersRail,
  '/onboard': IconUserPlus,
  '/entry': IconReceipt,
  '/records': IconList,
  '/delivery': IconTruckRail,
  '/reports': IconChart,
  '/reconcile': IconReconcile,
  '/audit': IconShield,
}

export function RailNav({ items }: { items: RailItem[] }) {
  const pathname = usePathname()

  const groups = new Map<string, RailItem[]>()
  for (const item of items) {
    const list = groups.get(item.group) ?? []
    list.push(item)
    groups.set(item.group, list)
  }

  return (
    <aside className="rail group">
      <div className="mb-1.5 flex items-center gap-2.5 px-1.5 pb-4 pt-1.5">
        <LogoMark className="h-8 w-8 shrink-0" />
        <span className="overflow-hidden whitespace-nowrap text-base font-extrabold tracking-tight text-paper opacity-0 transition-opacity group-hover:opacity-100">
          DealerHub
        </span>
      </div>

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
        <LogoutButton variant="rail" />
      </div>
    </aside>
  )
}
