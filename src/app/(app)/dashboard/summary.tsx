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

// Severity first, age second.
//
// The list arrived in whatever order buildNotifications produced, which put a
// dealer quiet for 58 days above a statement that is blocking the monthly
// report. Age alone is the wrong sort: "open one day and blocking the month"
// outranks "quiet since June". So the variant the notification already
// classified itself with decides the band, and within a band the thing that
// has waited longest comes first.
const SEVERITY: Record<BuiltNotification['variant'], number> = { clay: 0, brass: 1, info: 2, slate: 3 }

function byUrgency(a: BuiltNotification, b: BuiltNotification) {
  return SEVERITY[a.variant] - SEVERITY[b.variant] || b.staleDays - a.staleDays
}

export function NeedsAttention({ items, flat }: { items: BuiltNotification[]; flat?: boolean }) {
  const shown = [...items].sort(byUrgency).slice(0, 4)
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

      {/* A timeline, not a flat list. The rail down the left is what makes
          these read as one ordered sequence rather than two unrelated
          notices — and the order is now deliberate (see byUrgency) instead
          of whatever order the builder happened to emit. */}
      <ol className="relative mt-4 flex flex-col pl-7">
        <span aria-hidden="true" className="absolute bottom-4 left-[6px] top-4 w-px bg-ink-800" />
        {shown.map((n) => (
          <li key={n.id} className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-7 top-[14px] grid h-[13px] w-[13px] place-items-center rounded-full border-2 border-ink-800 bg-ink-900"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[n.variant]}`} />
            </span>
            <Link
              href={n.href}
              className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 transition-colors hover:bg-ink-850"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold leading-snug text-paper">{n.title}</span>
                <span className="block truncate text-[12px] text-paper-dim">{n.subtitle}</span>
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-primary group-hover:underline">{n.actionLabel} &rarr;</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
