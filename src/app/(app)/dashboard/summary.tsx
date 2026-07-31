import Link from 'next/link'
import type { BuiltNotification } from '@/lib/notifications/build'
import { IconCheckCircle, IconChevronDown } from '../icons'

// The dashboard's opening row: one headline figure with its supporting
// numbers, beside everything that actually needs the reader to do something.
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
      being a hierarchy and becomes the tile row again. */
  stats: { label: string; value: string; href: string; tone?: 'normal' | 'warn' }[]
  /** Trailing monthly values, oldest first. Omit where there's no series. */
  spark?: number[]
  sparkLabel?: string
  href: string
}) {
  return (
    <div className="app-card flex flex-col justify-between gap-5">
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
          {chg != null &&
            (() => {
              // Three states, not two. Rounding to one decimal means a real
              // change of +0.04% displays as 0.0%, and showing that in green
              // with an up arrow reads as growth when nothing moved.
              const r = Math.round(chg * 10) / 10
              return (
                <span className={`chg ${r === 0 ? 'chg-warn' : r > 0 ? 'chg-up' : 'chg-down'}`}>
                  {r === 0 ? '→' : r > 0 ? '↑' : '↓'} {Math.abs(r).toFixed(1)}%
                </span>
              )
            })()}
          {chgSuffix && <span className="text-[12.5px] text-paper-dim">{chgSuffix}</span>}
        </div>
      </div>

      {spark && spark.length > 1 && <Sparkline values={spark} label={sparkLabel} />}

      <div className="grid grid-cols-1 gap-3 border-t border-ink-800 pt-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="group min-w-0">
            <div className="truncate text-[11.5px] font-medium text-paper-dim">{s.label}</div>
            <div
              className={`figure-points mt-0.5 truncate text-[15px] font-semibold group-hover:underline ${
                s.tone === 'warn' ? 'text-clay-bright' : 'text-paper'
              }`}
            >
              {s.value}
            </div>
          </Link>
        ))}
      </div>
    </div>
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
  // A flat series would divide by zero and collapse every point onto y=0;
  // drawing it mid-height is the honest reading of "nothing changed".
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
      {label && <p className="mt-1.5 text-[11.5px] text-paper-dim">{label}</p>}
    </div>
  )
}

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
        {items.length > 0 && <span className="pill pill-brass">{items.length}</span>}
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
