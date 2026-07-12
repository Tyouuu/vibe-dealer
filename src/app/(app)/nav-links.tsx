'use client'

import { usePathname } from 'next/navigation'

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-0.5 text-sm">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'rounded-full bg-jade/10 px-3 py-1.5 font-semibold text-jade-bright'
                : 'rounded-full px-3 py-1.5 font-medium text-paper-dim transition-colors hover:bg-ink-850 hover:text-paper'
            }
          >
            {item.label}
          </a>
        )
      })}
    </nav>
  )
}
