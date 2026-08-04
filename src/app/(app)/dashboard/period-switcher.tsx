import Link from 'next/link'
import type { MonthRef } from '@/lib/dashboard-period'

// One control at the top of the page that every month-scoped block below
// follows — the shape Stripe's Dashboard home uses, where the period and the
// period it is compared against are page-level choices rather than something
// each chart decides for itself.
//
// This page used to hardcode "this month". On the 2nd of a month that made
// five of its seven sections empty by definition, which is a layout that only
// works when the data happens to be there. With a switcher, "this month" is
// one option among several and the page can open on whichever period actually
// has something in it.
//
// Plain links, no client component: changing period is a navigation, the URL
// should carry it, and Back should undo it.
export function PeriodSwitcher({
  months,
  selected,
  compareLabel,
}: {
  /** Oldest first — rendered newest first, the way you read a period list. */
  months: MonthRef[]
  selected: string
  /** The month this one is measured against, when there is one. */
  compareLabel?: string
}) {
  const shown = [...months].reverse()
  return (
    // One row that scrolls sideways rather than a block that wraps. Six
    // periods wrapped onto a second line at 390px and pushed the page's
    // first surface down to y=219, which design-audit flags — a phone should
    // still land on the alerts card, not on a control.
    // The months scroll; the comparison label does not. It used to sit inside
    // the same scrolling strip, so on a phone "vs July 2026" was pushed off
    // the right edge and only appeared if you thought to swipe a control that
    // looks like a row of buttons. It is not a button — it is the sentence
    // that says what every figure below is measured against.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="-mx-1 flex max-w-full overflow-x-auto px-1">
        <div className="segmented shrink-0 flex-nowrap">
          {shown.map((m) => (
            <Link
              key={m.key}
              href={`/dashboard?month=${m.key}`}
              aria-current={m.key === selected ? 'page' : undefined}
              className={`segmented-btn shrink-0 ${m.key === selected ? 'active' : ''}`}
            >
              {m.label}
            </Link>
          ))}
        </div>
      </div>
      {compareLabel && <span className="whitespace-nowrap text-[12px] text-paper-dim">vs {compareLabel}</span>}
    </div>
  )
}
