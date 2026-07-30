'use client'

import { useEffect, useRef, useState } from 'react'
import { DISTRICTS } from './districts'

// The dealer network is Northern Malaysia only — Perak/Penang/Kedah, from
// Tanjung Malim (the network's actual southern edge) up to the Thai border —
// so the map is cropped to that real coverage box rather than showing the
// whole (mostly irrelevant) peninsula. Both the coastline and the town pins
// below are derived from real lon/lat, projected onto the same viewBox
// (lon 99.55-101.55 -> x 0-200, lat 6.85-3.45 -> y 0-340), extracted from
// geoBoundaries' Malaysia ADM0 GeoJSON (github.com/wmgeolab/geoBoundaries)
// and clipped/simplified with a Sutherland-Hodgman + Douglas-Peucker pass —
// not hand-drawn. Penang Island is its own polygon in the source data, so it
// renders as a real separate landmass rather than a blob on the coast.
// labelAbove flips a town's name to sit above its dot instead of below.
// Needed only where a neighbour sits directly underneath: Kampar is ~8 units
// below Ipoh, which at this map's rendered size put Kampar's dot straight
// through the "Ipoh" label and clipped it to "Ip".
const REGION_COORDS: Record<string, { x: number; y: number; labelAbove?: boolean }> = {
  Penang: { x: 38.9, y: 42.2 },
  // Taiping's label goes above too. Ipoh already flips above (Kampar sits
  // directly under it), and with Taiping's sitting below its own dot the two
  // labels landed on the same eye level — Ipoh's to the left of Ipoh's dot,
  // Taiping's to the right of Taiping's. Each then read as captioning the
  // other town's circle, so the biggest region looked like the second
  // biggest. Both above keeps every label directly over its own dot.
  Taiping: { x: 59.4, y: 58.8, labelAbove: true },
  Ipoh: { x: 77.0, y: 66.3, labelAbove: true },
  Kampar: { x: 79.8, y: 74.7 },
  Sitiawan: { x: 57.5, y: 77.5 },
  'Teluk Intan': { x: 73.5, y: 83.2 },
}

// Onboarding suggests region names outside this map's real coverage box too
// (KL, Johor, Klang, Melaka, Seremban, Kuantan — all south of where this
// crop ends) — those can't get an honest pin here (fabricating a position
// for a town this map doesn't actually depict would be worse than omitting
// it), but callers rendering a region legend alongside this map should use
// this to show an unmapped region differently rather than implying every
// legend entry has a matching dot.
export function hasMapPin(region: string): boolean {
  return region in REGION_COORDS
}

const MAINLAND_PATH =
  'M 65.5,12.43 L 63.58,13.32 L 62.15,15.66 L 63.07,19.57 L 61.83,20.24 L 61.61,21.84 L 63.36,27.72 L 62.57,28.34 L 60.68,27.07 L 60.91,36.93 L 59.56,38.13 L 59.8,39.76 L 58.36,42.08 L 57.04,42.73 L 62,55.9 L 64.67,60.17 L 69.08,63.59 L 71.37,67.51 L 73.61,75.54 L 77.69,80.45 L 80.02,87.65 L 80.41,97.12 L 81.86,103.63 L 80.12,114.72 L 82.36,117.92 L 80.71,118.59 L 79.35,117.65 L 78.23,118.83 L 79.08,121.41 L 78.83,127.66 L 82.33,132.84 L 83.05,139.71 L 81.34,145.67 L 82.67,148.59 L 85.54,151.13 L 85.3,153.11 L 86.91,156.86 L 85.61,158.52 L 87.96,164.08 L 86.86,165.77 L 87.93,168.46 L 84.6,170.88 L 81.08,176.22 L 82.99,177.3 L 85.24,185.39 L 86.83,185.25 L 87.34,190.18 L 89.24,193.37 L 91.84,191.93 L 95.33,193.45 L 93.2,194.91 L 93.57,198.36 L 96.68,198.91 L 99.68,196.7 L 99.93,198.68 L 102.26,198.69 L 99.95,200.35 L 101.6,206 L 104.8,206.81 L 107.71,205.53 L 106.18,206.94 L 106.89,208.57 L 103.61,208.44 L 102.7,210.05 L 104.51,218.04 L 110.59,216.9 L 108.51,219.62 L 105.54,220.87 L 103.61,224.58 L 103.31,228.44 L 106.91,229.54 L 110.75,228.52 L 109.32,231.18 L 107.45,231.95 L 106.79,240.46 L 105.57,242.69 L 103.55,242.58 L 104.47,245.12 L 103.66,245.28 L 100.81,254.11 L 102.35,253.81 L 103.62,255.54 L 104.17,261.56 L 106,263.62 L 105.27,265.95 L 106.62,268.54 L 107.71,269.31 L 109.81,267.83 L 113.79,268.66 L 121.25,276.48 L 121.21,284.5 L 120.23,285.8 L 116.46,284.61 L 115.42,286.15 L 115.68,295.52 L 117.68,298.97 L 119.29,299.79 L 122.4,300.33 L 125.39,298.92 L 128.03,299.34 L 128.1,300.52 L 126.93,300.38 L 126.63,301.33 L 126.42,306.58 L 132.06,308.09 L 136.7,312.45 L 138.96,317.44 L 142.74,318.02 L 146.94,321.14 L 150.59,325.7 L 157.37,340 L 200,340 L 200,92.98 L 193.71,96.65 L 193.59,98.02 L 184.14,97.43 L 182.54,101.65 L 180.01,102.31 L 179.61,104.16 L 177.56,103.63 L 176.35,104.81 L 175.47,103.65 L 172.63,103.82 L 169.96,108.76 L 171.12,113.24 L 170.12,115.13 L 166.85,116.25 L 166.5,118.86 L 162.23,120.24 L 161.43,121.95 L 158.39,123.65 L 157.35,118.85 L 154.55,114.67 L 153.08,114.02 L 153.29,112.96 L 151.22,112.33 L 151.02,110.57 L 148.39,111.2 L 146.77,108.27 L 143.95,106.61 L 143.4,104.28 L 146.19,101.25 L 145.9,97.63 L 147.94,94.82 L 147.58,93.7 L 150.31,93.97 L 151.34,93.03 L 153.5,94.08 L 154.51,89.95 L 157.44,87.3 L 155.7,85.96 L 156.44,81.09 L 155.03,79.98 L 157.66,74.31 L 155.59,73.66 L 153.94,71.55 L 150.87,70.77 L 153.58,67.13 L 157.67,65.74 L 155.52,61.2 L 156.24,59.84 L 151.4,59.06 L 146.53,60.33 L 141.9,56.69 L 139.7,58.6 L 139.47,60.67 L 136.74,60.18 L 134.89,61.53 L 132.23,58.54 L 132.04,60.96 L 130.37,61.81 L 128.47,56.12 L 129.91,53.54 L 127.18,49.35 L 127.39,44.31 L 126.26,40.78 L 122.65,38.7 L 120.32,39.22 L 118.86,33.96 L 115.94,37.91 L 110.21,40.74 L 109.63,39.16 L 106.78,39.02 L 101.25,35.4 L 99.83,36.55 L 96.88,36.14 L 94.38,34.14 L 94.02,32.45 L 92.05,32.96 L 90.68,31.82 L 86.82,33.13 L 85.21,31.36 L 81.59,30.99 L 80.15,27.71 L 75.52,24.48 L 77.6,22.86 L 76.62,21.34 L 77.75,18.59 L 74.43,17.02 L 74.3,14.22 L 71.5,15.11 L 70.75,13.86 L 69.37,15.66 L 67.88,15.66 L 65.43,12.64 Z'

const PENANG_ISLAND_PATH =
  'M 70.7,136.85 L 68.8,138.46 L 67.26,138.46 L 66.08,139.13 L 64.56,137.72 L 63.66,137.86 L 63.56,137.17 L 62.53,137.67 L 63.4,139.58 L 62.69,141.63 L 63.81,141.96 L 63.97,143.35 L 64.57,143.54 L 63.9,143.64 L 63.48,146.72 L 64.6,151.15 L 64.72,153.93 L 63.2,154.49 L 63.39,155.53 L 62.77,156.83 L 63.5,158.36 L 63.9,156.93 L 67.18,157.01 L 67.35,156.37 L 67.84,156.29 L 68.89,156.73 L 69.47,157.67 L 69.8,157.11 L 71.01,157.17 L 71.78,157.72 L 72.5,159.28 L 73.26,159.21 L 73.22,158.14 L 74.09,157.01 L 73.85,156.4 L 74.45,155.75 L 76.16,151.11 L 76.76,148.75 L 76.7,146.63 L 78.35,144.93 L 77.99,144.65 L 78.44,144.89 L 78.87,144.44 L 78.76,143.93 L 79.44,143.7 L 79.62,142.9 L 77.78,142.43 L 76.04,141.12 L 75.77,140.62 L 76.36,139.91 L 76.38,138.8 L 74.24,138.11 L 72.85,138.26 L 72.49,137.23 L 70.95,136.79 Z'

export type Region = {
  region: string
  points: number
  pct: number
  color: string
  dealers: { name: string; points: number }[]
}

const FULL_VIEW: ViewBox = { x: 0, y: 0, w: 200, h: 340 }

// How tight the drill-down frame is. 3.4x leaves enough coastline around the
// focused town that it's still recognisably that stretch of coast, rather
// than an anonymous grey field.
const ZOOM = 3.4
const ZOOM_MS = 480

type ViewBox = { x: number; y: number; w: number; h: number }

// Frames the map on one town by recomputing the viewBox, NOT by CSS-scaling
// the rendered result. This is the whole point of the rewrite: a
// `transform: scale()` magnifies the same pixels, so strokes get 3x fatter,
// text blurs, and no new detail can ever appear. Re-deriving the viewBox
// re-renders the same vector geometry into a smaller coordinate window, so
// the coastline stays mathematically crisp at any zoom and the stroke width
// can be compensated to stay visually constant. It is also the standard
// approach in every real mapping library (d3-geo's projection.fitExtent,
// Highcharts' mapView.fitToBounds, MapLibre's fitBounds).
function frameOn(coord: { x: number; y: number }): ViewBox {
  const w = FULL_VIEW.w / ZOOM
  const h = FULL_VIEW.h / ZOOM
  // Clamped so a town near an edge still yields a full frame of map rather
  // than a frame half-full of empty space beyond the coverage box.
  const x = Math.max(0, Math.min(FULL_VIEW.w - w, (coord.x / 100) * FULL_VIEW.w - w / 2))
  const y = Math.max(0, Math.min(FULL_VIEW.h - h, (coord.y / 100) * FULL_VIEW.h - h / 2))
  return { x, y, w, h }
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

// CSS can't transition the viewBox attribute, so the tween is done by hand.
// requestAnimationFrame rather than a CSS transform for the reason above —
// the whole benefit of re-framing is lost if the motion is a scale.
function useViewBoxTween(target: ViewBox): ViewBox {
  const [view, setView] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = fromRef.current
    if (from.x === target.x && from.y === target.y && from.w === target.w) return
    let start: number | null = null
    function step(ts: number) {
      if (start === null) start = ts
      const t = Math.min(1, (ts - start) / ZOOM_MS)
      const k = easeOut(t)
      const next = {
        x: from.x + (target.x - from.x) * k,
        y: from.y + (target.y - from.y) * k,
        w: from.w + (target.w - from.w) * k,
        h: from.h + (target.h - from.h) * k,
      }
      setView(next)
      fromRef.current = next
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [target.x, target.y, target.w, target.h])

  return view
}

// Circle AREA encodes the value, so the radius scales with the square root —
// sizing the radius directly by value would overstate big towns roughly
// quadratically. Snapped to four discrete steps rather than left continuous:
// people systematically under-estimate area differences, and with only a
// handful of towns the lost precision costs nothing while the discrete sizes
// stay legible against the size legend below.
const DOT_STEPS = [11, 15, 20, 26]

function dotSize(points: number, max: number): number {
  if (max <= 0) return DOT_STEPS[0]
  const ratio = Math.sqrt(Math.max(0, points) / max)
  const idx = Math.min(DOT_STEPS.length - 1, Math.max(0, Math.ceil(ratio * DOT_STEPS.length) - 1))
  return DOT_STEPS[idx]
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
          <button type="button" onClick={() => setSelected(null)} className="shrink-0 text-[11px] font-bold text-primary-deep hover:underline">
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
            <span className="text-paper-dim/70">Click one to see its dealers.</span>
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

      {regions.length > 0 && (
        <GrowthMap
          regions={regions}
          maxPoints={maxPoints}
          selected={selected}
          highlight={highlight}
          onHover={setHovered}
          onSelect={setSelected}
        />
      )}
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
            title={hasMapPin(r.region) ? undefined : `${r.region} is outside this map's coverage area — no pin shown below`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12.5px] font-bold text-paper">{r.region}</span>
                <span className="figure-points shrink-0 text-[12px] font-semibold text-paper">{r.points.toLocaleString()}</span>
              </span>
              <span className="mt-1 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                  <span
                    className="block h-full rounded-full transition-all"
                    style={{ width: `${maxPoints ? Math.max(3, (r.points / maxPoints) * 100) : 0}%`, background: r.color }}
                  />
                </span>
                <span className="figure w-8 shrink-0 text-right text-[11px] text-paper-dim">{r.pct}%</span>
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
              <span className="truncate text-[12.5px] font-semibold text-paper">{d.name}</span>
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

function GrowthMap({
  regions,
  maxPoints,
  selected,
  highlight,
  onHover,
  onSelect,
}: {
  regions: Region[]
  maxPoints: number
  selected: string | null
  highlight: string | null
  onHover: (r: string | null) => void
  onSelect: (r: string) => void
}) {
  const focusCoord = selected ? REGION_COORDS[selected] : null
  const target = focusCoord ? frameOn(focusCoord) : FULL_VIEW
  const view = useViewBoxTween(target)

  const mapped = regions.filter((r) => hasMapPin(r.region)).length
  const unmapped = regions.length - mapped

  // Keeps outlines visually the same weight at every zoom level: the viewBox
  // shrinking is what makes a fixed stroke-width appear thicker, so scale it
  // by the same factor.
  const strokeScale = view.w / FULL_VIEW.w

  // District lines carry no information at overview scale (30 outlines in a
  // 220px box is just noise) and are the entire point once focused, so they
  // fade in with the zoom rather than being on or off.
  const zoomProgress = (FULL_VIEW.w - view.w) / (FULL_VIEW.w - FULL_VIEW.w / ZOOM)
  const districtOpacity = Math.max(0, Math.min(1, zoomProgress))

  return (
    <div className="mt-2">
      <div className="relative mx-auto aspect-[10/17] w-full max-w-[220px] overflow-hidden rounded-lg bg-info/5">
        <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="h-full w-full" aria-hidden="true">
          <path d={MAINLAND_PATH} className="fill-ink-850 stroke-ink-800" strokeWidth={1.5 * strokeScale} strokeLinejoin="round" />
          <path d={PENANG_ISLAND_PATH} className="fill-ink-850 stroke-ink-800" strokeWidth={1.5 * strokeScale} strokeLinejoin="round" />
          {/* District (daerah) outlines. These are what make the drill-down
              worth doing at all: zooming the coastline alone just enlarged a
              blank grey field, because most of these towns are inland and no
              new detail could ever appear. They fade up as you zoom so the
              overview stays calm and the focused view gains real structure. */}
          <g className="stroke-ink-800" fill="none" strokeWidth={0.7 * strokeScale} opacity={districtOpacity}>
            {DISTRICTS.map((d) => (
              <path key={`${d.state}-${d.district}`} d={d.d} />
            ))}
          </g>
        </svg>

        {/* District names, only once zoomed in far enough to have room for
            them. HTML rather than SVG <text> for the same reason as the pins:
            nothing gets transform-scaled, so type stays crisp. */}
        {districtOpacity > 0.5 &&
          DISTRICTS.map((d) => {
            const left = ((d.cx - view.x) / view.w) * 100
            const top = ((d.cy - view.y) / view.h) * 100
            if (left < 4 || left > 96 || top < 3 || top > 97) return null
            return (
              <span
                key={`label-${d.state}-${d.district}`}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[8px] font-semibold uppercase tracking-wide text-paper-dim/70"
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                {d.district}
              </span>
            )
          })}

        {regions.map((r) => {
          const coord = REGION_COORDS[r.region]
          if (!coord) return null
          // Pins are HTML positioned as a percentage of the CURRENT viewBox
          // rather than SVG children, which is what keeps every dot and
          // label exactly one size at every zoom level — no counter-scaling
          // and no blurred text, because nothing is ever transform-scaled.
          const left = (((coord.x / 100) * FULL_VIEW.w - view.x) / view.w) * 100
          const top = (((coord.y / 100) * FULL_VIEW.h - view.y) / view.h) * 100
          if (left < -8 || left > 108 || top < -8 || top > 108) return null

          const isSelected = selected === r.region
          const isHot = highlight === r.region
          const dim = highlight !== null && !isHot
          const size = dotSize(r.points, maxPoints)

          return (
            // p-1.5 keeps the button a >=24px touch target (WCAG 2.5.8)
            // regardless of how small the value-scaled dot inside it is.
            <button
              type="button"
              key={r.region}
              onClick={() => onSelect(r.region)}
              onMouseEnter={() => onHover(r.region)}
              onMouseLeave={() => onHover(null)}
              aria-pressed={isSelected}
              aria-label={`${r.region}, ${r.points.toLocaleString()} points, ${r.pct}% of this month's top-up`}
              className="group absolute -translate-x-1/2 -translate-y-1/2 p-1.5"
              style={{ left: `${left}%`, top: `${top}%`, opacity: dim ? 0.4 : 1, transition: 'opacity 200ms' }}
            >
              <span
                className="block rounded-full ring-2 ring-white transition-all"
                style={{ width: size, height: size, background: r.color, boxShadow: isHot ? '0 0 0 4px rgba(0,0,0,0.06)' : undefined }}
              />
              {/* Always-on place name — an unlabelled dot on a grey
                  silhouette is the main reason this card read as abstract.
                  The value only appears on hover/selection so the default
                  state stays uncluttered. */}
              <span
                className={`pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9.5px] font-bold text-paper-dim ${
                  coord.labelAbove ? 'bottom-full mb-0.5' : 'top-full mt-0.5'
                }`}
              >
                {r.region}
              </span>
              {isHot && (
                <span
                  className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-paper px-2 py-1 text-[10px] font-semibold text-white shadow-lg ${
                    coord.labelAbove ? 'top-full mt-1' : 'bottom-full mb-1'
                  }`}
                >
                  {r.points.toLocaleString()} pts · {r.pct}%
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Size legend with real units — "45%" alone never said 45% of what. */}
      {!selected && maxPoints > 0 && (
        <div className="mt-2 flex items-center justify-center gap-3 text-[9.5px] text-paper-dim">
          <span>Circle size = points</span>
          <span className="flex items-end gap-1.5">
            {[0.15, 0.5, 1].map((f) => (
              <span key={f} className="flex flex-col items-center gap-0.5">
                <span
                  className="rounded-full bg-ink-800"
                  style={{ width: dotSize(maxPoints * f, maxPoints), height: dotSize(maxPoints * f, maxPoints) }}
                />
                <span className="figure">{Math.round(maxPoints * f).toLocaleString()}</span>
              </span>
            ))}
          </span>
        </div>
      )}

      {/* Says out loud that the map is a partial view. Only six towns have
          real projected coordinates, but dealers span 40+ regions, so most of
          the business genuinely cannot appear here — and a map that silently
          omits more than half the network reads as "these are all my areas"
          when it isn't. The list above is the complete picture; this line is
          what stops the map quietly contradicting it. */}
      {!selected && unmapped > 0 && (
        <p className="mt-1.5 text-center text-[9.5px] text-paper-dim/70">
          Map shows the {mapped} main town{mapped === 1 ? '' : 's'} · {unmapped} more region{unmapped === 1 ? '' : 's'} in the list above
        </p>
      )}
    </div>
  )
}
