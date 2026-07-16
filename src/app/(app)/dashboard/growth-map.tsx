// Approximate (not surveyed) positions for each dealer region, derived from
// real lat/long of each town projected onto a simple flat viewBox — good
// enough to show "Ipoh and Penang are up north, Johor is down south" at a
// glance, which is the point of this widget.
const REGION_COORDS: Record<string, { x: number; y: number }> = {
  Penang: { x: 16, y: 20 },
  Taiping: { x: 25, y: 30 },
  Ipoh: { x: 32, y: 35 },
  Kampar: { x: 33, y: 40 },
  Sitiawan: { x: 24, y: 42 },
  'Teluk Intan': { x: 30, y: 45 },
  Kuantan: { x: 77, y: 49 },
  Klang: { x: 39, y: 63 },
  KL: { x: 44, y: 61 },
  Seremban: { x: 49, y: 69 },
  Melaka: { x: 55, y: 78 },
  Johor: { x: 85, y: 91 },
}

const PENINSULA_PATH =
  'M 12,15 Q 10,25 14,35 Q 16,42 20,48 Q 24,55 28,60 Q 32,68 38,74 Q 45,80 52,85 Q 62,90 72,94 L 82,97 Q 90,92 92,82 Q 90,68 86,55 Q 82,42 76,32 Q 68,20 58,12 Q 45,6 32,8 Q 20,10 12,15 Z'

export function GrowthMap({ regions }: { regions: { region: string; pct: number; color: string }[] }) {
  return (
    <div className="relative mx-auto mt-1 aspect-[4/5] w-full max-w-[210px]">
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
        <path d={PENINSULA_PATH} className="fill-ink-850 stroke-ink-800" strokeWidth="1.5" />
      </svg>
      {regions.map((r) => {
        const coord = REGION_COORDS[r.region]
        if (!coord) return null
        return (
          <div
            key={r.region}
            className="group absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${coord.x}%`, top: `${coord.y}%` }}
          >
            <span
              className="block h-3 w-3 rounded-full shadow ring-2 ring-white"
              style={{ background: r.color }}
            />
            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-paper px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {r.region} {r.pct}%
            </span>
          </div>
        )
      })}
    </div>
  )
}
