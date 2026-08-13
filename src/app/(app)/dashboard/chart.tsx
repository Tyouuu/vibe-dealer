/* The dashboard's chart vocabulary.
 *
 * Separate from elements.tsx because these three are about one month at day
 * resolution, where everything in that file is about six months at month
 * resolution. They are not variants of each other.
 */

/* ------------------------------------------------------------- month chart
   The line, at the resolution the data actually has.

   What this replaces drew six points — six MONTHLY totals — so it was a
   zigzag with long flat runs however carefully it was stroked. The client's
   words: 那条线可以更加细节一点. It could, and not by restyling it: six points
   was the whole problem. `trendTx` already returns every verified
   transaction with its own tx_date, and monthlySeries() was summing that
   down to one number a month. Summing by day instead gives 31 points from
   the same query — no new read, no new column.

   Six layers, each answering something the figure beside it cannot:

     the line      what this month has done, cumulative, day by day
     the ghost     the same span of last month, so "down 5.4%" becomes a
                   shape — you see WHERE it fell behind, not only that it did
     the target    where last month finished. Whether this month can still
                   catch it becomes a horizontal line rather than arithmetic
     the forecast  a dotted continuation to month end. Dotted because it has
                   not happened yet
     today         the line stops at today and the endpoint is marked, so the
                   empty right-hand side reads as "not yet" and not as zero
     the axis      1 / 7 / 14 / 21 / 28, so a bump has a date

   Weekend banding and a dot per day were both drawn and both cut: eight
   bands slice the month into strips, and 31 dots turn the line into beads.

   Server-rendered, so there is no hover readout — that needs a client
   component and is the one thing from the demo not in this pass. */
/* The viewBox aspect has to match the box it renders into, or the browser
   letterboxes it.
 *
 * First cut used 640×168 in a 1136px-wide band with a fixed 152px height.
 * SVG's default preserveAspectRatio is "xMidYMid meet", so it fitted the
 * 3.8:1 drawing inside a 7.5:1 box and centred it — the chart drew at 579px
 * and sat in the right half of the card with the whole left side empty. It
 * looked like a bug in the data.
 *
 * preserveAspectRatio="none" is the other way out and is the wrong one here:
 * it stretches the stroke horizontally, which is the exact thing the comment
 * above Sparkline in elements.tsx warns about. Matching the aspect keeps the
 * stroke even and the endpoint dots round. */
const W = 1120
const H = 150
const PAD_L = 8
const PAD_R = 8
const TOP = 10
const BASE = 122

/* Last month's line has to be readable as data and quieter than this
   month's. --color-ink-700 (#d3dbe5) is a hairline colour — at 1.5px dashed
   across 1,100px it disappeared, so the chart looked like it had lost the
   comparison rather than drawn it faintly. Mixing paper-dim down keeps it in
   the same navy family as everything else and lands about halfway between
   the hairline and the body text. */
const GHOST_STROKE = 'color-mix(in srgb, var(--color-paper-dim) 46%, transparent)'

export function MonthChart({
  daily,
  ghost,
  days,
  projected,
  ghostLabel,
  targetLabel,
  id,
}: {
  /** Cumulative value for each elapsed day of the shown month, day 1 first. */
  daily: number[]
  /** Cumulative value for every day of the month before. Omit if there is none. */
  ghost?: number[]
  /** Days in the shown month. */
  days: number
  /** Where the month lands at the current rate. Omit once the month is over. */
  projected?: number
  /** "July" — names the dashed line. */
  ghostLabel?: string
  /** "July finished at 248,029 pts" — names the horizontal target. */
  targetLabel?: string
  id: string
}) {
  // Two points make a line; one makes a dot with nothing to say.
  if (daily.length < 2 || days < 2) return null
  // Same rule as the sparkline it replaces: a month of zeroes is not a trend,
  // it is an absence, and drawing a dead-flat rule across the card implies
  // there is something to read.
  if (daily.every((v) => v === 0)) return null

  // The scale covers what is DRAWN, and what is drawn is the same span on
  // both months.
  //
  // The first cut put last month's whole-month total in here and drew a
  // horizontal line at it. Two things went wrong. The picture: August had
  // done RM 1,949 of a scale topped by July's RM 6,310, so this month — the
  // subject — was a low bump under two-thirds of empty card. And the
  // meaning: the headline beside it compares the same span of both months
  // ("↓5.4% · July same span RM 2,060"), so the chart was measuring one
  // thing while the number above it measured another.
  //
  // Now the ghost stops where this month stops, the scale follows, and
  // "July finished at RM 6,310" is a line of text in the key — which is the
  // right weight for a fact you check once, not one you read off a shape.
  const ghostEnd = ghost?.length ? ghost[ghost.length - 1] : 0
  const top = Math.max(daily[daily.length - 1], ghostEnd, projected ?? 0) * 1.08 || 1
  const x = (day: number) => PAD_L + ((day - 1) / (days - 1)) * (W - PAD_L - PAD_R)
  const y = (v: number) => BASE - (v / top) * (BASE - TOP)
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')

  const d = line(daily)
  const lastDay = daily.length
  const lastVal = daily[lastDay - 1]
  const ticks = [1, 7, 14, 21, 28].filter((t) => t <= days)

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-[150px] w-full" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0.2" />
            <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* the ground the fill sits on */}
        <line x1={PAD_L} y1={BASE} x2={W - PAD_R} y2={BASE} stroke="var(--color-ink-800)" strokeWidth="1" />

        {/* last month, day by day, over the same span */}
        {ghost && ghost.length > 1 && (
          <path d={line(ghost)} fill="none" stroke={GHOST_STROKE} strokeWidth="1.5" strokeDasharray="3 3" strokeLinejoin="round" />
        )}

        {/* where this month lands if it carries on */}
        {projected != null && lastDay < days && (
          <path
            d={`M${x(lastDay).toFixed(1)} ${y(lastVal).toFixed(1)} L${x(days).toFixed(1)} ${y(projected).toFixed(1)}`}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="1.5"
            strokeDasharray="2 4"
            opacity="0.55"
          />
        )}

        {/* this month */}
        <path d={`${d} L${x(lastDay).toFixed(1)} ${BASE} L${x(1).toFixed(1)} ${BASE} Z`} fill={`url(#${id})`} />
        <path d={d} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* today. The white ring is what keeps the dot readable over the fill. */}
        <circle cx={x(lastDay).toFixed(1)} cy={y(lastVal).toFixed(1)} r="6" fill="var(--color-ink-900)" />
        <circle cx={x(lastDay).toFixed(1)} cy={y(lastVal).toFixed(1)} r="4" fill="var(--color-primary)" />

        {ticks.map((t, i) => (
          <text
            key={t}
            x={x(t)}
            y={H - 4}
            fontSize="13"
            fill="var(--color-paper-dim)"
            textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
          >
            {t}
          </text>
        ))}
      </svg>

      {/* A key, because the dashed line is data and not decoration — and in
          words as well as stroke patterns, since this app's rule against
          relying on colour alone applies to dash patterns for the same
          reason. */}
      {(ghostLabel || targetLabel) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-paper-dim">
          {ghostLabel && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0 w-3.5 border-t-[1.5px] border-dashed" style={{ borderColor: GHOST_STROKE }} />
              {ghostLabel}
            </span>
          )}
          {targetLabel && <span>{targetLabel}</span>}
        </div>
      )}
    </div>
  )
}

/* There is no MonthProgress here, and there was.
 *
 * It was built — a track filled to day 13 of 31 with the projection marked —
 * and then the chart above made every part of it a second copy. The axis
 * already prints 1 / 7 / 14 / 21 / 28, the endpoint already marks today, and
 * the dotted continuation already runs to where the month lands. A 1,100px
 * blue bar under all of that said the same three things a third time and
 * read like a loading bar.
 *
 * Printing a figure twice is the defect this whole pass has been removing
 * from other pages; it would be a poor way to end. The projection survives
 * as one line of text in the chart's key, which is where the other things
 * the chart cannot say out loud already live.
 */

/* ------------------------------------------------------------- region strip
   Eight bar rows became one stacked band.

   By region is a share of a whole, and a share of a whole is what a stacked
   bar is for. As eight rows it took ~200px and sat beside the dealer
   leaderboard looking like a second leaderboard, which it is not: a dealer
   appears once, a region contains many.

   Six segments at most. A stacked bar with eleven slices cannot be read, and
   the tail is exactly what "other regions" means. */
export function RegionStrip({ rows }: { rows: { region: string; points: number }[] }) {
  if (!rows.length) return null
  const total = rows.reduce((s, r) => s + r.points, 0)
  if (total <= 0) return null

  const TOP_N = 5
  const head = rows.slice(0, TOP_N)
  const tail = rows.slice(TOP_N)
  const tailPoints = tail.reduce((s, r) => s + r.points, 0)
  const segs = [
    ...head.map((r) => ({ key: r.region, label: r.region, points: r.points })),
    ...(tailPoints > 0 ? [{ key: '__rest', label: `${tail.length} more`, points: tailPoints }] : []),
  ]

  // One hue, stepped. Region is a category with no natural order and no
  // meaning attached to any single one, so six different colours would be
  // six colours that encode nothing — which is the thing this app removes on
  // sight. Written as whole literal class names because Tailwind v4 tree-
  // shakes anything it cannot see spelled out.
  const SHADE = ['bg-primary', 'bg-primary/80', 'bg-primary/60', 'bg-primary/45', 'bg-primary/30', 'bg-primary/[0.18]']

  return (
    <div>
      <div
        className="flex h-2.5 gap-px overflow-hidden rounded-full"
        role="img"
        aria-label={segs.map((s) => `${s.label} ${s.points.toLocaleString()}`).join(', ')}
      >
        {segs.map((s, i) => (
          <span key={s.key} className={SHADE[Math.min(i, SHADE.length - 1)]} style={{ flex: s.points }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-paper-dim">
        {segs.map((s, i) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 shrink-0 rounded-[3px] ${SHADE[Math.min(i, SHADE.length - 1)]}`} />
            {s.label} <span className="figure text-paper">{s.points.toLocaleString()}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
