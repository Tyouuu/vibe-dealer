'use client'

import { useEffect, useState } from 'react'

export type Region = {
  region: string
  points: number
  pct: number
  color: string
  dealers: { name: string; points: number }[]
}

// One shared, self-contained card. The ranked list is the primary object and
// the map is secondary — deliberately. A map is good at "where am I / which
// towns do I cover", and poor at "how do these values compare": the eye
// can't read a magnitude off a dot's position, and the region shapes here
// differ wildly in area (Perak dwarfs Penang), which would overstate the
// bigger one. So the list carries the numbers and the map carries the
// geography, and the two cross-highlight.
export function RegionGrowthCard({ regions }: { regions: Region[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const active = regions.find((r) => r.region === selected) ?? null
  const maxPoints = regions.reduce((m, r) => Math.max(m, r.points), 0)
  const highlight = hovered ?? selected

  return (
    <div className="app-card">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-paper">
          Growth by Region
          {active && <span className="text-paper-dim"> · {active.region}</span>}
        </h3>
        {active && (
          <button type="button" onClick={() => setSelected(null)} className="shrink-0 text-[12px] font-bold text-primary-deep hover:underline">
            ← All regions
          </button>
        )}
      </div>

      <p className="mb-3 text-xs text-paper-dim">
        {active ? (
          <>
            {active.dealers.length} dealer{active.dealers.length === 1 ? '' : 's'} · {active.points.toLocaleString()} pts this month ·{' '}
            {active.pct}% of total
          </>
        ) : regions.length ? (
          <>
            All {regions.length} region{regions.length === 1 ? '' : 's'} with verified top-up this month, best first.{' '}
            <span className="text-paper-dim">Click one to see its dealers.</span>
          </>
        ) : (
          'No verified transactions this month yet.'
        )}
      </p>

      {regions.length > 0 &&
        (active ? (
          <DealerList active={active} />
        ) : (
          <RegionList regions={regions} maxPoints={maxPoints} highlight={highlight} onHover={setHovered} onSelect={setSelected} />
        ))}

      {/* The map used to sit here and has been removed. It could only plot 6
          of the app's 44 regions, so 140 of 249 dealers (56%) were absent from
          a picture that reads as "here is where my dealers are" — it hid more
          of the business than it showed, and it was the tallest thing on the
          page, which stretched the row and left a ~400px void in the chart
          card beside it. The list above answers the same question ("which
          areas sell best") over all regions instead of six.

          Worth rebuilding only with coordinates for all 44 towns — see
          docs/ui-backlog.md. */}
    </div>
  )
}

// The primary read: name, a bar for at-a-glance comparison, the real points
// figure, and the share. The old version showed only a coloured chip with a
// percentage, which meant the magnitude lived entirely in text and neither
// the chip nor the map encoded it at all.
function RegionList({
  regions,
  maxPoints,
  highlight,
  onHover,
  onSelect,
}: {
  regions: Region[]
  maxPoints: number
  highlight: string | null
  onHover: (r: string | null) => void
  onSelect: (r: string) => void
}) {
  return (
    // Capped and scrollable: this now lists every region that sold, which is
    // 40+ in real data. Roughly seven rows are visible before it scrolls, so
    // the leaders are what you land on while the rest stays reachable without
    // the card growing taller than the chart beside it.
    <div className="flex max-h-[248px] flex-col overflow-y-auto pr-1">
      {regions.map((r) => {
        const dim = highlight !== null && highlight !== r.region
        return (
          <button
            type="button"
            key={r.region}
            onClick={() => onSelect(r.region)}
            onMouseEnter={() => onHover(r.region)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(r.region)}
            onBlur={() => onHover(null)}
            className={`group flex items-center gap-2.5 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-ink-850 ${
              dim ? 'opacity-45' : ''
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] font-bold text-paper">{r.region}</span>
                <span className="figure-points shrink-0 text-[12px] font-semibold text-paper">{r.points.toLocaleString()}</span>
              </span>
              <span className="mt-1 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                  <span
                    className="block h-full rounded-full transition-all"
                    style={{ width: `${maxPoints ? Math.max(3, (r.points / maxPoints) * 100) : 0}%`, background: r.color }}
                  />
                </span>
                <span className="figure w-8 shrink-0 text-right text-[12px] text-paper-dim">{r.pct}%</span>
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// The drill-down the map itself can't do: dealers have a region but no
// latitude/longitude, so they genuinely cannot be plotted as individual pins
// without inventing positions. The ranked list is the honest — and per the
// research, more legible — way to answer "which dealers are in here and what
// did each one sell".
function DealerList({ active }: { active: Region }) {
  const max = active.dealers.reduce((m, d) => Math.max(m, d.points), 0)
  return (
    <div className="flex max-h-52 flex-col overflow-y-auto">
      {active.dealers.map((d) => (
        <div key={d.name} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12px] font-semibold text-paper">{d.name}</span>
              <span className="figure-points shrink-0 text-[12px] text-paper">{d.points.toLocaleString()}</span>
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-800">
              <span
                className="block h-full rounded-full"
                style={{ width: `${max ? Math.max(3, (d.points / max) * 100) : 0}%`, background: active.color }}
              />
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}
