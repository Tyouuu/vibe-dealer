import Link from 'next/link'

// null means "no meaningful baseline" — callers must skip the change badge
// rather than render it.
//
// Two ways a baseline stops being meaningful. The prior period being 0 is the
// obvious one: the arithmetic is a divide by zero. The other showed up on the
// dashboard as "34,799 pts ↑ 840.5%", which is arithmetically right and tells
// the reader nothing — June happened to be a 3,700 pt month, so the percentage
// is really a statement about how small June was, not how big July is. Past a
// few hundred percent the number reads as a bug and the two absolute figures
// say it better; the caption beside the badge already names the period being
// compared, so dropping the badge loses nothing.
const MAX_MEANINGFUL_PCT = 300

export function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null
  const pct = ((curr - prev) / prev) * 100
  if (Math.abs(pct) >= MAX_MEANINGFUL_PCT) return null
  return pct
}

// One headline figure with its supporting numbers. Shared by Dashboard,
// Monthly Report and Credit Purchases so all three open the same way.
//
// It replaces four equal-weight KPI tiles. Four tiles of identical size state
// that four things matter equally, which leaves the reader to work out which
// one to look at first — NN/g's visual-hierarchy guidance is that scale IS the
// signal for importance, and their eighth guideline for complex applications
// is to make important information salient by emphasising it *or by removing
// what isn't essential*. Both cards below do the second thing: this is two
// blocks where there were four, so the page gets less dense, not more. That
// matters here because a denser dashboard was explicitly rejected once before.
//
// Stripe's dashboard home opens the same way — total volume as one primary
// figure with supporting counts beneath it, rather than a row of peers.

export function HeroCard({
  label,
  value,
  chg,
  chgSuffix,
  stats,
  spark,
  sparkLabel,
  chart,
  footnote,
  header,
  flat,
  href,
}: {
  /** What the headline number is. Kept short — the number is the message. */
  label: string
  value: string
  /** Percent change vs the previous period. null = no meaningful baseline. */
  chg?: number | null
  /** e.g. "vs last month" — says what the change is measured against. */
  chgSuffix?: string
  /** The supporting figures. Deliberately capped at 3: past that this stops
      being a hierarchy and becomes the tile row again.
   *
   *  Optional, because a hero over a number small enough to count does not
   *  need one. Dealer Requests printed "Top-ups 2 / Packages 0" under a
   *  figure of 2 — the total restated as its own parts, in a block that
   *  doubled the card and pushed the first request off the first screen. When
   *  the split fits in a clause, it belongs in chgSuffix. */
  stats?: {
    label: string
    value: string
    href: string
    /** 'caution' is brass and means "expected, worth noticing"; 'warn' is
        clay and means "something is wrong". A figure that is negative by
        design — cash margin before stock is sold through — must not be red,
        or it reads as an error every month. */
    tone?: 'normal' | 'caution' | 'warn'
    /** Percent change vs the prior period, shown small beside the value. */
    chg?: number | null
    /** One short line under the value — a caveat, not a second figure. */
    sub?: string
  }[]
  /** Trailing monthly values, oldest first. Omit where there's no series. */
  spark?: number[]
  sparkLabel?: string
  /** A real chart in place of the sparkline. The Dashboard was drawing the
      same six-month series twice — once as this card's sparkline and again
      as a full "Monthly Top-up Trend" card directly below it. One series,
      one chart, and it gets the card's whole width. */
  chart?: React.ReactNode
  /** Anything that needs to sit below the stats — an explanation the figures
      can't carry on their own. */
  footnote?: React.ReactNode
  /** Identity that belongs above the figure — who or what these numbers are
      about. On the dealer page the name, code, attribute chips and actions
      were a separate card *below* the hero, so the page opened with a number
      before it said whose number it was. They are one record header. */
  header?: React.ReactNode
  /** Drop the card and sit directly on the canvas as a page band. Used by
      the Dashboard, where four stacked panels were the whole problem. */
  flat?: boolean
  href: string
}) {
  return (
    <div className={`${flat ? 'page-band' : 'app-card'} flex flex-col justify-between gap-5`}>
      {header && <div className="border-b border-ink-800 pb-5">{header}</div>}
      <div>
        <Link href={href} className="group inline-flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-paper-dim group-hover:text-paper">{label}</span>
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {/* The one number the reader came for. 38px against the 15px
              supporting figures below — a real step, not a nudge.

              The currency prefix is set smaller and dimmer rather than left
              inline. Intl.NumberFormat separates it with U+00A0, and in the
              mono face this app reserves for figures that space is a full
              character cell — invisible at the 15px these figures normally
              run at, a visible gulf at 38px. Splitting it also puts the
              emphasis where it belongs: on the amount, not on "RM". */}
          <span className="flex items-baseline gap-1.5 text-paper">
            {(() => {
              // The separator is \u00a0. Written as an escape rather than typed
              // as the character itself: an invisible byte inside a regex is a
              // trap for whoever edits this next.
              const m = /^([^\d.-]+)\u00a0(.+)$/.exec(value)
              if (!m) return <span className="figure-money text-[38px] font-semibold leading-none tracking-tight">{value}</span>
              return (
                <>
                  <span className="text-[19px] font-semibold leading-none text-paper-dim">{m[1]}</span>
                  <span className="figure-money text-[38px] font-semibold leading-none tracking-tight">{m[2]}</span>
                </>
              )
            })()}
          </span>
          {chg != null && <Delta pct={chg} big />}
          {chgSuffix && <span className="text-[12px] text-paper-dim">{chgSuffix}</span>}
        </div>
      </div>

      {/* The sparkline stays here, tucked under the number it trails. A full
          chart does not: it went between the headline figure and the three
          stats that support it, which measured 359px apart on /dashboard —
          one thought split in half by a picture. Stripe's dashboard home,
          which this card is modelled on, is figure, then supporting counts,
          then the trailing chart. That order now. */}
      {!chart && spark && spark.length > 1 && <Sparkline values={spark} label={sparkLabel} />}

      {/* No stats, no rule and no row — an empty grid under a hairline is a
          card that looks like it failed to load its second half. */}
      {(stats?.length || footnote) && (
      <div>
        {stats?.length ? (
        <div className="grid grid-cols-1 gap-3 border-t border-ink-800 pt-4 sm:grid-cols-3">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="group min-w-0">
              <div className="truncate text-[12px] font-medium text-paper-dim">{s.label}</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span
                  className={`figure-points truncate whitespace-nowrap text-[14px] font-semibold group-hover:underline ${
                    s.tone === 'warn' ? 'text-clay-bright' : s.tone === 'caution' ? 'text-brass-bright' : 'text-paper'
                  }`}
                >
                  {s.value}
                </span>
                {s.chg != null && <Delta pct={s.chg} />}
              </div>
              {s.sub && <div className="mt-0.5 text-[12px] leading-snug text-paper-dim">{s.sub}</div>}
            </Link>
          ))}
        </div>
        ) : null}
        {footnote && <div className="mt-3 text-[12px] leading-relaxed text-paper-dim">{footnote}</div>}
      </div>
      )}

      {chart}
    </div>
  )
}

// The three-state change badge, shared by the hero and its supporting stats.
// Rounding to one decimal means a real change of +0.04% displays as 0.0%, and
// showing that in green with an up arrow reads as growth when nothing moved —
// hence a neutral third state rather than a binary up/down.
function Delta({ pct, big = false }: { pct: number; big?: boolean }) {
  const r = Math.round(pct * 10) / 10
  return (
    <span className={`chg ${r === 0 ? 'chg-warn' : r > 0 ? 'chg-up' : 'chg-down'} ${big ? '' : 'text-[12px]'}`}>
      {r === 0 ? '→' : r > 0 ? '↑' : '↓'} {Math.abs(r).toFixed(1)}%
    </span>
  )
}

// A headline number says where you are; it takes a shape to say where you're
// heading. Stripe's dashboard home pairs its volume figure with exactly this —
// the small trailing chart directly under the number — and it's what earns the
// space this card would otherwise leave blank.
//
// Deliberately unlabelled and unaxised: it's a direction, not a readable
// chart. The full chart with hover figures is already directly below.
function Sparkline({ values, label }: { values: number[]; label?: string }) {
  const W = 100
  const H = 22
  const max = Math.max(...values)
  const min = Math.min(...values)

  // Nothing at all is not the same as nothing changed. Six months of zero
  // rendered a dead-straight rule the full width of the card — on a phone,
  // four of them down the page, each reading as a stray horizontal line
  // rather than a chart. A trend line implies there is a trend; when every
  // point is zero there is no history yet, and the honest thing is to draw
  // nothing. (A flat series that is *not* zero still draws — that genuinely
  // is "nothing changed", which is worth showing.)
  if (values.every((v) => v === 0)) return null

  // A flat series would divide by zero and collapse every point onto y=0.
  const span = max - min || 1
  const pt = (v: number, i: number) => {
    const x = (i / (values.length - 1)) * W
    const y = H - ((v - min) / span) * (H - 2) - 1
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }
  const line = values.map(pt).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  const rising = values[values.length - 1] >= values[0]
  const stroke = rising ? 'var(--color-jade)' : 'var(--color-clay)'

  return (
    <div className="mt-1">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-full" role="img" aria-label={label ?? 'Trend'}>
        <polygon points={area} fill={stroke} opacity="0.10" />
        <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {label && <p className="mt-1.5 text-[12px] text-paper-dim">{label}</p>}
    </div>
  )
}
