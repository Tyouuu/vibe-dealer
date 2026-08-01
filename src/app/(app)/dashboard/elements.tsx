import Link from 'next/link'
import { Avatar } from '../avatar'

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

export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s, i) => {
        const r = s.chg == null ? null : Math.round(s.chg * 10) / 10
        return (
          <Link key={s.label} href={s.href} className="app-tile group block">
            <div className="text-[12px] text-paper-dim">{s.label}</div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="figure-points text-[23px] leading-tight tracking-[-.026em] group-hover:underline">{s.value}</span>
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

/* --------------------------------------------------------------- pace ring
   A balance says how much; a runway says until when. The dashboard read
   "RM 0.00  ↓100.0%" on the first of every month, which is true, alarming and
   useless — an indicator you learn to ignore for three weeks out of four is
   not an indicator. This compares elapsed days against booked commission so
   the reading is "ahead" or "behind", not "down 100%". */
export function PaceRing({
  elapsedPct,
  bookedPct,
  value,
  target,
  line,
}: {
  elapsedPct: number
  bookedPct: number
  value: string
  target: string
  line: string
}) {
  const R = 40
  const C = 2 * Math.PI * R
  const pct = Math.max(0, Math.min(100, bookedPct))
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={`${Math.round(pct)}% booked, ${Math.round(elapsedPct)}% of the month elapsed`}>
        <circle cx="48" cy="48" r={R} fill="none" stroke="var(--color-ink-800)" strokeWidth="10" />
        <circle
          cx="48"
          cy="48"
          r={R}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct / 100)}
          transform="rotate(-90 48 48)"
        />
        <text x="48" y="53" textAnchor="middle" fontSize="18" fontWeight="600" fill="var(--color-paper)">
          {Math.round(pct)}%
        </text>
      </svg>
      <div className="min-w-0 flex-1">
        <div className="figure-money text-[22px] tracking-[-.025em]">
          {value} <span className="text-[15px] font-normal text-paper-dim">of {target}</span>
        </div>
        <p className="mt-1 max-w-[70ch] text-[12px] leading-relaxed text-paper-dim">{line}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- leaderboard
   249 dealers, and this page had never named one of them. The bar makes the
   gap between #1 and #5 readable without doing arithmetic. */
export function Leaderboard({
  rows,
}: {
  rows: { id: string; name: string; points: number; href: string }[]
}) {
  if (!rows.length) return <p className="text-[13px] text-paper-dim">No verified top-ups yet this period.</p>
  const max = Math.max(...rows.map((r) => r.points), 1)
  return (
    <div className="flex flex-col">
      {rows.map((r, i) => (
        <Link
          key={r.id}
          href={r.href}
          className="grid grid-cols-[22px_26px_minmax(0,1fr)_90px] items-center gap-3 border-t border-ink-800 py-2.5 transition-colors hover:bg-ink-850 sm:grid-cols-[22px_26px_minmax(0,1fr)_120px_90px]"
        >
          <span className="figure text-[12px] text-paper-dim">#{i + 1}</span>
          <Avatar name={r.name} size={26} />
          <span className="truncate text-[13px] font-semibold text-paper">{r.name}</span>
          <span className="hidden h-1.5 rounded-full bg-ink-800 sm:block" aria-hidden="true">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (r.points / max) * 100)}%` }} />
          </span>
          <span className="figure-points text-right text-[13px]">{r.points.toLocaleString()} pts</span>
        </Link>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ status split
   Three separate counts become one proportion, and the flagged sliver is
   impossible to miss at a glance. */
export function StatusSplit({
  parts,
}: {
  parts: { label: string; count: number; className: string; dot: string; href: string }[]
}) {
  const total = parts.reduce((s, p) => s + p.count, 0)
  return (
    <div>
      {total > 0 ? (
        <div className="flex h-3 overflow-hidden rounded-full bg-ink-800" role="img" aria-label={parts.map((p) => `${p.count} ${p.label}`).join(', ')}>
          {parts
            .filter((p) => p.count > 0)
            .map((p) => (
              <span key={p.label} className={`block h-full ${p.className}`} style={{ width: `${(p.count / total) * 100}%` }} />
            ))}
        </div>
      ) : (
        <div className="h-3 rounded-full bg-ink-800" />
      )}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12px]">
        {parts.map((p) => (
          <Link key={p.label} href={p.href} className="inline-flex items-center gap-2 text-paper-dim hover:text-paper">
            <span className={`h-2 w-2 shrink-0 rounded-full ${p.dot}`} />
            {p.label} <b className="figure text-paper">{p.count}</b>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- region bars
   Was one line of grey text. With data it is a ranked bar list, and it earns
   the width it is given. */
export function RegionBars({ rows }: { rows: { region: string; points: number }[] }) {
  if (!rows.length) return <p className="text-[13px] text-paper-dim">No verified transactions this month yet.</p>
  const max = Math.max(...rows.map((r) => r.points), 1)
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.region} className="grid grid-cols-[90px_minmax(0,1fr)_78px] items-center gap-3 text-[13px]">
          <span className="truncate text-paper-dim">{r.region}</span>
          <span className="h-2 rounded-full bg-ink-800" aria-hidden="true">
            <span className="block h-full rounded-full bg-jade" style={{ width: `${Math.max(2, (r.points / max) * 100)}%` }} />
          </span>
          <span className="figure text-right text-paper">{r.points.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
