import Link from 'next/link'
import type { BuiltNotification } from '@/lib/notifications/build'
import { IconCheckCircle } from '../icons'

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

// Now the page's opening statement rather than a card in the corner.
//
// The dashboard used to lead with a 550px chart whose headline figure was
// RM 0.00 — the largest thing on the page was an empty month, and it was
// history, which is the one thing on a dashboard nobody can act on. The three
// items that DO need acting on sat below the fold in a third-width card.
//
// So this goes first, full width, and states the count in words. Each row is
// a full-width target with the action named on the right, rather than a
// truncated line with a chevron that only appears on hover.
export function NeedsAttention({ items, flat }: { items: BuiltNotification[]; flat?: boolean }) {
  const shown = items.slice(0, 4)
  const rest = items.length - shown.length

  if (shown.length === 0) {
    // One quiet line, not an eight-line empty state with an icon badge.
    // Finished work should take up less room than unfinished work, and this
    // is the state the page is in most mornings.
    return (
      <div className={`${flat ? 'page-band' : 'app-card'} flex items-center gap-2.5 py-4`}>
        <span className="text-jade-bright">
          <IconCheckCircle className="h-4 w-4" />
        </span>
        <p className="text-[13px] font-semibold text-paper">All clear</p>
        <p className="text-[13px] text-paper-dim">Nothing is waiting on you right now.</p>
      </div>
    )
  }

  return (
    <div className={flat ? 'page-band' : 'app-card'}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-paper">
          {items.length} {items.length === 1 ? 'thing needs' : 'things need'} you
        </h2>
        {rest > 0 && (
          <Link href="/notifications" className="text-[12px] font-semibold text-primary hover:underline">
            {rest} more
          </Link>
        )}
      </div>

      <ul className="mt-3 flex flex-col divide-y divide-ink-800 border-t border-ink-800">
        {shown.map((n) => (
          <li key={n.id}>
            <Link href={n.href} className="group flex items-center gap-3 py-3 transition-colors hover:bg-ink-850">
              {/* Colour carries the severity the notification already
                  classified itself with, so it reads at a glance without
                  the reader parsing the sentence. */}
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASS[n.variant]}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold leading-snug text-paper">{n.title}</span>
                <span className="block truncate text-[12px] text-paper-dim">{n.subtitle}</span>
              </span>
              {/* Named, and always visible. A chevron that appears on hover
                  tells you nothing about where the row goes, and tells a
                  touch user nothing at all. */}
              <span className="shrink-0 text-[12px] font-semibold text-primary group-hover:underline">{n.actionLabel} &rarr;</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
