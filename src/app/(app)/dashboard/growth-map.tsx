'use client'

import { useEffect, useState } from 'react'

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
const REGION_COORDS: Record<string, { x: number; y: number }> = {
  Penang: { x: 38.9, y: 42.2 },
  Taiping: { x: 59.4, y: 58.8 },
  Ipoh: { x: 77.0, y: 66.3 },
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

const MAP_VIEWBOX = '0 0 200 340'

const MAINLAND_PATH =
  'M 65.5,12.43 L 63.58,13.32 L 62.15,15.66 L 63.07,19.57 L 61.83,20.24 L 61.61,21.84 L 63.36,27.72 L 62.57,28.34 L 60.68,27.07 L 60.91,36.93 L 59.56,38.13 L 59.8,39.76 L 58.36,42.08 L 57.04,42.73 L 62,55.9 L 64.67,60.17 L 69.08,63.59 L 71.37,67.51 L 73.61,75.54 L 77.69,80.45 L 80.02,87.65 L 80.41,97.12 L 81.86,103.63 L 80.12,114.72 L 82.36,117.92 L 80.71,118.59 L 79.35,117.65 L 78.23,118.83 L 79.08,121.41 L 78.83,127.66 L 82.33,132.84 L 83.05,139.71 L 81.34,145.67 L 82.67,148.59 L 85.54,151.13 L 85.3,153.11 L 86.91,156.86 L 85.61,158.52 L 87.96,164.08 L 86.86,165.77 L 87.93,168.46 L 84.6,170.88 L 81.08,176.22 L 82.99,177.3 L 85.24,185.39 L 86.83,185.25 L 87.34,190.18 L 89.24,193.37 L 91.84,191.93 L 95.33,193.45 L 93.2,194.91 L 93.57,198.36 L 96.68,198.91 L 99.68,196.7 L 99.93,198.68 L 102.26,198.69 L 99.95,200.35 L 101.6,206 L 104.8,206.81 L 107.71,205.53 L 106.18,206.94 L 106.89,208.57 L 103.61,208.44 L 102.7,210.05 L 104.51,218.04 L 110.59,216.9 L 108.51,219.62 L 105.54,220.87 L 103.61,224.58 L 103.31,228.44 L 106.91,229.54 L 110.75,228.52 L 109.32,231.18 L 107.45,231.95 L 106.79,240.46 L 105.57,242.69 L 103.55,242.58 L 104.47,245.12 L 103.66,245.28 L 100.81,254.11 L 102.35,253.81 L 103.62,255.54 L 104.17,261.56 L 106,263.62 L 105.27,265.95 L 106.62,268.54 L 107.71,269.31 L 109.81,267.83 L 113.79,268.66 L 121.25,276.48 L 121.21,284.5 L 120.23,285.8 L 116.46,284.61 L 115.42,286.15 L 115.68,295.52 L 117.68,298.97 L 119.29,299.79 L 122.4,300.33 L 125.39,298.92 L 128.03,299.34 L 128.1,300.52 L 126.93,300.38 L 126.63,301.33 L 126.42,306.58 L 132.06,308.09 L 136.7,312.45 L 138.96,317.44 L 142.74,318.02 L 146.94,321.14 L 150.59,325.7 L 157.37,340 L 200,340 L 200,92.98 L 193.71,96.65 L 193.59,98.02 L 184.14,97.43 L 182.54,101.65 L 180.01,102.31 L 179.61,104.16 L 177.56,103.63 L 176.35,104.81 L 175.47,103.65 L 172.63,103.82 L 169.96,108.76 L 171.12,113.24 L 170.12,115.13 L 166.85,116.25 L 166.5,118.86 L 162.23,120.24 L 161.43,121.95 L 158.39,123.65 L 157.35,118.85 L 154.55,114.67 L 153.08,114.02 L 153.29,112.96 L 151.22,112.33 L 151.02,110.57 L 148.39,111.2 L 146.77,108.27 L 143.95,106.61 L 143.4,104.28 L 146.19,101.25 L 145.9,97.63 L 147.94,94.82 L 147.58,93.7 L 150.31,93.97 L 151.34,93.03 L 153.5,94.08 L 154.51,89.95 L 157.44,87.3 L 155.7,85.96 L 156.44,81.09 L 155.03,79.98 L 157.66,74.31 L 155.59,73.66 L 153.94,71.55 L 150.87,70.77 L 153.58,67.13 L 157.67,65.74 L 155.52,61.2 L 156.24,59.84 L 151.4,59.06 L 146.53,60.33 L 141.9,56.69 L 139.7,58.6 L 139.47,60.67 L 136.74,60.18 L 134.89,61.53 L 132.23,58.54 L 132.04,60.96 L 130.37,61.81 L 128.47,56.12 L 129.91,53.54 L 127.18,49.35 L 127.39,44.31 L 126.26,40.78 L 122.65,38.7 L 120.32,39.22 L 118.86,33.96 L 115.94,37.91 L 110.21,40.74 L 109.63,39.16 L 106.78,39.02 L 101.25,35.4 L 99.83,36.55 L 96.88,36.14 L 94.38,34.14 L 94.02,32.45 L 92.05,32.96 L 90.68,31.82 L 86.82,33.13 L 85.21,31.36 L 81.59,30.99 L 80.15,27.71 L 75.52,24.48 L 77.6,22.86 L 76.62,21.34 L 77.75,18.59 L 74.43,17.02 L 74.3,14.22 L 71.5,15.11 L 70.75,13.86 L 69.37,15.66 L 67.88,15.66 L 65.43,12.64 Z'

const PENANG_ISLAND_PATH =
  'M 70.7,136.85 L 68.8,138.46 L 67.26,138.46 L 66.08,139.13 L 64.56,137.72 L 63.66,137.86 L 63.56,137.17 L 62.53,137.67 L 63.4,139.58 L 62.69,141.63 L 63.81,141.96 L 63.97,143.35 L 64.57,143.54 L 63.9,143.64 L 63.48,146.72 L 64.6,151.15 L 64.72,153.93 L 63.2,154.49 L 63.39,155.53 L 62.77,156.83 L 63.5,158.36 L 63.9,156.93 L 67.18,157.01 L 67.35,156.37 L 67.84,156.29 L 68.89,156.73 L 69.47,157.67 L 69.8,157.11 L 71.01,157.17 L 71.78,157.72 L 72.5,159.28 L 73.26,159.21 L 73.22,158.14 L 74.09,157.01 L 73.85,156.4 L 74.45,155.75 L 76.16,151.11 L 76.76,148.75 L 76.7,146.63 L 78.35,144.93 L 77.99,144.65 L 78.44,144.89 L 78.87,144.44 L 78.76,143.93 L 79.44,143.7 L 79.62,142.9 L 77.78,142.43 L 76.04,141.12 L 75.77,140.62 L 76.36,139.91 L 76.38,138.8 L 74.24,138.11 L 72.85,138.26 L 72.49,137.23 L 70.95,136.79 Z'

type Region = { region: string; pct: number; color: string }

// One shared, self-contained card: the map's pins and the chip legend both
// drive the same selection state, so this can't be split into two
// independently-rendered pieces without lifting that state up into all
// three call sites (master/accountant/cs dashboards) separately. Escape
// clears the selection from anywhere on the page, not just while a pin has
// focus — a client is as likely to hit Escape right after clicking as while
// still hovering it.
export function RegionGrowthCard({ regions }: { regions: Region[] }) {
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function toggle(region: string) {
    setSelected((s) => (s === region ? null : region))
  }

  const active = regions.find((r) => r.region === selected) ?? null

  return (
    <div className="app-card">
      <h3 className="mb-1 text-sm font-bold text-paper">Growth by Region</h3>
      <p className="mb-3.5 text-xs text-paper-dim">
        {active ? (
          <>
            <span className="font-semibold" style={{ color: active.color }}>
              {active.region}
            </span>{' '}
            — {active.pct}% of this month&apos;s verified top-up points.{' '}
            <button type="button" onClick={() => setSelected(null)} className="font-semibold text-primary-deep hover:underline">
              Show all regions
            </button>
          </>
        ) : (
          <>
            Share of this month&apos;s verified top-up points, top {regions.length || 0} region{regions.length === 1 ? '' : 's'}.{' '}
            {regions.length > 0 && <span className="text-paper-dim/70">Click a region to focus it — Esc to clear.</span>}
          </>
        )}
      </p>
      {regions.length ? (
        <div className="flex flex-wrap gap-2.5">
          {regions.map((r) => (
            <button
              type="button"
              key={r.region}
              onClick={() => toggle(r.region)}
              className={`region-chip transition-all ${hasMapPin(r.region) ? '' : 'opacity-60'} ${
                selected && selected !== r.region ? 'opacity-40' : ''
              } ${selected === r.region ? 'ring-2 ring-offset-1' : ''}`}
              style={selected === r.region ? ({ '--tw-ring-color': r.color } as React.CSSProperties) : undefined}
              title={hasMapPin(r.region) ? undefined : `${r.region} is outside this map's coverage area — no pin shown below`}
            >
              <span className="swatch" style={{ background: r.color }} />
              {r.region} {r.pct}%
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-paper-dim">No verified transactions this month yet.</p>
      )}
      <GrowthMap regions={regions} selected={selected} onToggle={toggle} />
    </div>
  )
}

function GrowthMap({ regions, selected, onToggle }: { regions: Region[]; selected: string | null; onToggle: (region: string) => void }) {
  return (
    <div className="relative mx-auto mt-1 aspect-[10/17] w-full max-w-[220px]">
      <svg viewBox={MAP_VIEWBOX} className="h-full w-full" aria-hidden="true">
        <path d={MAINLAND_PATH} className="fill-ink-850 stroke-ink-800" strokeWidth="1.5" strokeLinejoin="round" />
        <path d={PENANG_ISLAND_PATH} className="fill-ink-850 stroke-ink-800" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      {regions.map((r) => {
        const coord = REGION_COORDS[r.region]
        if (!coord) return null
        const isSelected = selected === r.region
        const isDimmed = selected !== null && !isSelected
        return (
          <button
            type="button"
            key={r.region}
            onClick={() => onToggle(r.region)}
            aria-pressed={isSelected}
            aria-label={`${r.region}, ${r.pct}% of this month's top-up`}
            className="group absolute -translate-x-1/2 -translate-y-1/2 transition-opacity"
            style={{ left: `${coord.x}%`, top: `${coord.y}%`, opacity: isDimmed ? 0.35 : 1 }}
          >
            <span
              className={`block rounded-full shadow ring-2 ring-white transition-all ${isSelected ? 'h-4 w-4 ring-[3px]' : 'h-3 w-3'}`}
              style={{ background: r.color }}
            />
            <span
              className={`pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-paper px-2 py-1 text-[10px] font-semibold text-white shadow-lg transition-opacity ${
                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              {r.region} {r.pct}%
            </span>
          </button>
        )
      })}
    </div>
  )
}
