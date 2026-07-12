'use client'

import { useState } from 'react'

export type PackageSegment = {
  key: string
  label: string
  count: number
  colorClass: string
}

// Part-to-whole with ≤4 categories reads best as a single stacked bar, not a
// donut — pie/donut charts make close values hard to compare by eye. A 2px
// surface gap keeps touching segments visually distinct without a border.
export function PackageDistributionBar({ segments, total }: { segments: PackageSegment[]; total: number }) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (!total) {
    return <p className="text-sm text-paper-dim">No dealers yet.</p>
  }

  return (
    <div>
      <div className="flex h-6 gap-0.5 overflow-hidden rounded" role="img" aria-label="Package distribution by dealer count">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => {
            const pct = (s.count / total) * 100
            return (
              <div
                key={s.key}
                className={`relative h-full ${s.colorClass} transition-opacity ${hovered && hovered !== s.key ? 'opacity-50' : ''}`}
                style={{ width: `${pct}%` }}
                onMouseEnter={() => setHovered(s.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(s.key)}
                onBlur={() => setHovered(null)}
                tabIndex={0}
              >
                {hovered === s.key && (
                  <div className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-ink-700 bg-ink-850 px-2 py-1 text-[11px] font-semibold text-paper shadow-lg">
                    {s.label}: {s.count} ({pct.toFixed(0)}%)
                  </div>
                )}
              </div>
            )
          })}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${s.count > 0 ? s.colorClass : 'bg-ink-700'}`} />
            <span className="text-paper-dim">{s.label}</span>
            <b className="figure text-paper">{s.count}</b>
          </div>
        ))}
      </div>
    </div>
  )
}
