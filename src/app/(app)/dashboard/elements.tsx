import Link from 'next/link'
import { IconChevronDown } from '../icons'

// The dashboard's own element vocabulary.
//
// Every page in this app was previously assembled from five parts — a
// heading, a big figure, a list of rows, one line chart and a table — so
// every "redesign" could only ever rearrange the same five things. These are
// the parts the client picked to replace them with, and they are shaped by
// this business rather than by dashboards in general: a runway rather than a
// balance, cohorts rather than a headcount, a leaderboard because 249 dealers
// were never once named on this page.

/* StatTiles and its Sparkline were here, and both are gone.
   =========================================================================
   Four 22px figures in a row, each with a 46px trailing spark. Master lost
   them in the rebuild; the accountant kept them one release longer, which is
   why this file still had them. Two of master's four drew the same series —
   commission is 2% of top-up, so normalised their paths were byte-identical
   — and on the accountant's page the same four figures were the four things
   you read once and act on elsewhere. Both dashboards now lead with one
   figure and one real chart at day resolution (chart.tsx), and the other
   figures live as text on the line beneath it.

   Nothing else imported either of them, so they are deleted rather than left
   for a future page to pick up: a component nobody renders is a component
   nobody maintains, and this one encoded a layout the client has now
   rejected on both pages that used it.

   hero-card.tsx has its own Sparkline, still in use, and is unaffected. */

/* ------------------------------------------------------------ ghost empty
   The empty state that is not a dead pixel.

   Five sections of this page used to answer an empty month with one line of
   grey text — "No verified top-ups yet this period." That states the
   obvious, explains nothing and offers nothing. The pattern Carbon and
   PatternFly both land on instead is a ghost: the real thing, drawn faint,
   so the reader learns what will be here and what the columns are, with a
   sentence saying why it is empty and a way out.

   aria-hidden and inert on the ghost itself — it is last month's data shown
   as an illustration, so a screen reader gets the sentence and nothing that
   could be mistaken for this month's figures. */
export function GhostEmpty({ note, action, children }: { note: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-[12px] leading-relaxed text-paper-dim">
        {note}
        {action ? <> {action}</> : null}
      </p>
      <div aria-hidden="true" className="pointer-events-none select-none opacity-40 saturate-[.35]">
        {children}
      </div>
    </div>
  )
}

/* Pace was here — a ring showing month-to-date against the same span of the
   month before. The client did not want the circle. What it knew that
   nothing else did, the projection for an unfinished month, moved into the
   commission figure's own sub-line, so no information left with it, and the
   like-for-like baseline it introduced survives as that figure's percent
   badge. See sameSpanTotal.

   The status split lived here too — one proportion bar over Verified /
   Pending / Flagged. Also removed at the client's request; those three
   counts are one click away on Transactions, which filters by exactly
   them. */

/* ---------------------------------------------------------------- bar list
   One list shape for both rankings on this dashboard.

   Top dealers and Top-up by region are the same object — a label, its share
   of the leader, a figure — and they had drifted into two different row
   grids, two different type treatments, two different separators and two
   different bar colours. Region bars were jade, which is the colour that
   means "verified" everywhere else in the app; a region is not in a good
   state because it sold the most. One component now, so they cannot drift
   apart again.

   No avatar and no rank number. In a half-page column those cost 60px that
   the name needs — measured, every dealer here rendered as "ZZZ T…" with
   them in place. */
function BarList({
  rows,
  cap = 8,
  moreNoun,
}: {
  rows: { key: string; label: string; value: number; href?: string }[]
  /* Eight.
     A ranked bar list is scannable to about eight; past that the eye stops
     comparing lengths and starts reading numbers, at which point it should be
     a table. This one had no cap at all, which the demo hides — eight regions
     there against forty-four in production, and every dealer that traded in
     the month on the report. The rest are one disclosure away rather than one
     page away: the whole point of the list is the ranking, and a ranking
     split across two routes is two rankings. */
  cap?: number
  /** Pluralised in the disclosure: "36 more regions". */
  moreNoun: string
}) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  const shown = rows.slice(0, cap)
  const rest = rows.slice(cap)
  // The bar takes the slack, not the label. Given the 1fr the label stretched
  // to fill and opened a 300px gap in the middle of every row — the same
  // fault the SIM tables had. A proportional bar is the one thing here that
  // gets better with more width, so it is the one that flexes.
  const cell = 'grid grid-cols-[minmax(90px,190px)_minmax(0,1fr)_84px] items-center gap-4 border-t border-ink-800 py-2.5'
  // Bars stay proportional to the whole list's leader, not to whichever slice
  // is on screen — a revealed row must not redraw the eight above it.
  const row = (r: { key: string; label: string; value: number; href?: string }) => {
    const inner = (
      <>
        <span className="truncate text-[13px] font-semibold text-paper" title={r.label}>
          {r.label}
        </span>
        <span className="h-1.5 rounded-full bg-ink-800" aria-hidden="true">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
        </span>
        <span className="figure-points text-right text-[12px]">{r.value.toLocaleString()}</span>
      </>
    )
    return r.href ? (
      <Link key={r.key} href={r.href} className={`${cell} transition-colors hover:bg-ink-850`}>
        {inner}
      </Link>
    ) : (
      <div key={r.key} className={cell}>
        {inner}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {shown.map(row)}
      {rest.length > 0 && (
        <details className="group flex flex-col">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 border-t border-ink-800 py-2.5 text-[12px] font-semibold text-paper-dim hover:text-paper">
            <IconChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            <span className="group-open:hidden">
              {rest.length} more {moreNoun}
            </span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          {rest.map(row)}
        </details>
      )}
    </div>
  )
}

/* Top dealers. 249 of them, and this page had never named one. */
export function Leaderboard({ rows }: { rows: { id: string; name: string; points: number; href: string }[] }) {
  if (!rows.length) return <p className="text-[13px] text-paper-dim">No verified top-ups yet this period.</p>
  return <BarList moreNoun="dealers" rows={rows.map((r) => ({ key: r.id, label: r.name, value: r.points, href: r.href }))} />
}

/* RegionBars was here. Both dashboards draw regions as one stacked strip now
   (RegionStrip in chart.tsx) — a region is a share of a whole where a dealer
   is not, and a second bar list beside the first is what made the two read as
   a single object in two columns. */
