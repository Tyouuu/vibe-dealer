'use client'

import { useState } from 'react'

export type PackageSegment = {
  key: string
  label: string
  count: number
  colorClass: string
  stroke: string
}

const SIZE = 168
const R = 60
const STROKE_W = 22
const CIRC = 2 * Math.PI * R

// A ring, not a stacked bar — this is the one place on the dashboard that
// borrows Tekion's confident, colorful data-viz instead of staying inside
// this app's restrained single-accent palette. Each package tier gets its
// own hue so the chart reads as lively at a glance, the way theirs do.
export function PackageDistributionDonut({ segments, total }: { segments: PackageSegment[]; total: number }) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (!total) {
    return <p className="text-sm text-paper-dim">No dealers yet.</p>
  }

  const arcs = segments
    .filter((s) => s.count > 0)
    .reduce<{ cumulative: number; items: (PackageSegment & { pct: number; dash: number; offset: number })[] }>(
      (acc, s) => {
        const pct = s.count / total
        const dash = pct * CIRC
        const offset = -acc.cumulative * CIRC
        return { cumulative: acc.cumulative + pct, items: [...acc.items, { ...s, pct, dash, offset }] }
      },
      { cumulative: 0, items: [] }
    ).items

  const highlighted = hovered ? segments.find((s) => s.key === hovered) : null

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full -rotate-90" role="img" aria-label="Package distribution by dealer count">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--color-ink-800)" strokeWidth={STROKE_W} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={a.stroke}
              strokeWidth={STROKE_W}
              strokeDasharray={`${a.dash} ${CIRC - a.dash}`}
              strokeDashoffset={a.offset}
              strokeLinecap={arcs.length > 1 ? 'butt' : 'round'}
              className="cursor-pointer transition-opacity duration-150"
              style={{ opacity: hovered && hovered !== a.key ? 0.3 : 1 }}
              onMouseEnter={() => setHovered(a.key)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="figure text-3xl font-semibold text-paper">
              {highlighted ? highlighted.count : total}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-paper-dim">
              {highlighted ? highlighted.label.split(' · ')[0] : 'Dealers'}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 text-xs">
        {segments.map((s) => {
          const pct = total ? Math.round((s.count / total) * 100) : 0
          return (
            <div
              key={s.key}
              className="flex cursor-pointer items-center gap-2"
              onMouseEnter={() => setHovered(s.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: s.count > 0 ? s.stroke : 'var(--color-ink-700)' }}
              />
              <span className="text-paper-dim">{s.label}</span>
              <b className="figure text-paper">{s.count}</b>
              <span className="text-paper-dim">({pct}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
