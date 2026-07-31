import Link from 'next/link'
import type { BuiltNotification } from '@/lib/notifications/build'
import { IconCheckCircle, IconChevronDown } from '../icons'

// Everything the system already knows needs doing, in one place.
//
// The app computes five kinds of alert in buildNotifications — transactions
// pending review, credit balance running low, SIM deliveries queued, the month
// not reconciled, dealers gone quiet — but the dashboard only ever surfaced
// one of them (reconciliation), inside a KPI tile. Someone reading the
// dashboard could not see that three transactions were waiting or that the
// balance was about to block a sale; they had to know to open the bell.
//
// Same source as the bell and the /notifications page, so the three can't
// drift apart.
// Written out rather than composed — Tailwind scans source for complete class
// names, so `bg-${variant}` would compile to nothing and the dots would be
// invisible.
const DOT_CLASS: Record<BuiltNotification['variant'], string> = {
  clay: 'bg-clay',
  brass: 'bg-brass',
  info: 'bg-info',
  slate: 'bg-slate',
}

export function NeedsAttention({ items }: { items: BuiltNotification[] }) {
  const shown = items.slice(0, 4)
  const rest = items.length - shown.length

  return (
    <div className="app-card flex flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-paper">Needs attention</h3>
        {items.length > 0 && <span className="pill pill-neutral">{items.length}</span>}
      </div>

      {shown.length === 0 ? (
        // No count, no call to action. Finished work shouldn't read as a chore
        // — the same reasoning as EmptyState's `cleared` variant.
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-jade/12 text-jade-bright">
            <IconCheckCircle className="h-5 w-5" />
          </span>
          <p className="text-[13px] font-semibold text-paper">All clear</p>
          <p className="text-[12px] text-paper-dim">Nothing is waiting on you right now.</p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col">
          {shown.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href}
                className="group -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-ink-850"
              >
                {/* Colour carries the severity the notification already
                    classified itself with, so it reads at a glance without
                    the reader parsing the sentence. */}
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASS[n.variant]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-snug text-paper">{n.title}</span>
                  <span className="block truncate text-[12px] text-paper-dim">{n.subtitle}</span>
                </span>
                <IconChevronDown className="mt-1 h-3 w-3 shrink-0 -rotate-90 text-paper-dim opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rest > 0 && (
        <Link href="/notifications" className="mt-2 text-[12px] font-semibold text-primary hover:underline">
          {rest} more
        </Link>
      )}
    </div>
  )
}
