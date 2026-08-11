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

/* ---------------------------------------------------------------- sparkline
   Area fill, one hue, emphasised endpoint.

   The previous sparklines were a 1px stroke floating in white with no fill,
   no baseline and no endpoint — nothing to read at 40px tall — in four
   different hues that encoded nothing. Direction is carried by the ± figure
   beside the number instead, which is text and survives Geist's "never rely
   on colour alone".

   No preserveAspectRatio override: that is what was stretching the stroke
   horizontally and making the weight look uneven. */
const SW = 200
const SH = 46
const SP = 3

function sparkPath(values: number[]) {
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  return values.map((v, i) => [
    SP + i * ((SW - SP * 2) / Math.max(1, values.length - 1)),
    SP + (SH - SP * 2) * (1 - (v - min) / span),
  ] as const)
}

function Sparkline({ values, id }: { values: number[]; id: string }) {
  if (values.length < 2) return null

  // Nothing at all is not the same as nothing changed. Six months of zero drew
  // a dead-straight rule the full width of the tile, with a dot on the end —
  // on a phone, four of them down the page, each reading as a stray horizontal
  // line rather than a chart. A trend line implies there is a trend. Before
  // any real transaction exists there is no history to draw, so draw none.
  // A flat series that is not zero still draws: that genuinely is "nothing
  // changed", which is worth seeing.
  if (values.every((v) => v === 0)) return null

  const pts = sparkPath(values)
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${SW} ${SH}`} height={SH} className="mt-2.5 block w-full" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${SW - SP} ${SH} L ${SP} ${SH} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke="var(--color-primary)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r="3" fill="var(--color-ink-900)" stroke="var(--color-primary)" strokeWidth="1.6" />
    </svg>
  )
}

export type Stat = {
  label: string
  value: string
  href: string
  /** Percent change vs the prior period. null when there is no baseline. */
  chg?: number | null
  /** Six trailing values, oldest first. Omit where there is no series. */
  spark?: number[]
  /** One short line under the figure — a caveat, not a second number. */
  sub?: string
}

// Four figures in a row, on the canvas rather than in four little cards.
//
// The page now opens with one card — the alerts — and that card is the
// anchor. Four more cards immediately under it made the top of the page
// read as two rows of boxes, which is the "four boxes is not composition"
// complaint arriving by a different route. One surface per page, at the
// top; everything below it is flat and separated by rule and space.
export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s, i) => {
        const r = s.chg == null ? null : Math.round(s.chg * 10) / 10
        return (
          <Link key={s.label} href={s.href} className="group block">
            <div className="text-[12px] text-paper-dim">{s.label}</div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="figure-points text-[22px] leading-tight tracking-[-.026em] group-hover:underline">{s.value}</span>
              {r != null && (
                <span className={`chg text-[12px] ${r === 0 ? 'chg-warn' : r > 0 ? 'chg-up' : 'chg-down'}`}>
                  {r === 0 ? '→' : r > 0 ? '↑' : '↓'} {Math.abs(r).toFixed(1)}%
                </span>
              )}
            </div>
            {s.sub && <div className="mt-0.5 text-[12px] leading-snug text-paper-dim">{s.sub}</div>}
            {s.spark && <Sparkline values={s.spark} id={`sp${i}`} />}
          </Link>
        )
      })}
    </div>
  )
}

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

/* Top-up by region. The same shape as the leaderboard above by construction,
   not by two people happening to write it the same way. */
export function RegionBars({ rows }: { rows: { region: string; points: number }[] }) {
  if (!rows.length) return <p className="text-[13px] text-paper-dim">No verified transactions this month yet.</p>
  return <BarList moreNoun="regions" rows={rows.map((r) => ({ key: r.region, label: r.region, value: r.points }))} />
}
