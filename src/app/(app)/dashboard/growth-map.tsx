// Real positions, not guesses: derived from each town's actual lat/long,
// projected onto the same 0-100 viewBox as PENINSULA_PATH below (both use
// lon 99.0-105.0 -> x 0-100, lat 6.8-0.8 -> y 0-100), so pins land on the
// coastline where they should. PENINSULA_PATH itself is a simplified real
// boundary — extracted from geoBoundaries' Malaysia ADM0 GeoJSON
// (github.com/wmgeolab/geoBoundaries), not hand-drawn.
const REGION_COORDS: Record<string, { x: number; y: number }> = {
  Penang: { x: 22.2, y: 23.2 },
  Taiping: { x: 29.0, y: 32.5 },
  Ipoh: { x: 34.7, y: 36.7 },
  Kampar: { x: 35.8, y: 41.7 },
  Sitiawan: { x: 28.3, y: 43.2 },
  'Teluk Intan': { x: 33.7, y: 46.3 },
  Kuantan: { x: 72.2, y: 49.7 },
  Klang: { x: 40.8, y: 62.7 },
  KL: { x: 44.8, y: 61.0 },
  Seremban: { x: 49.0, y: 67.8 },
  Melaka: { x: 54.2, y: 76.8 },
  Johor: { x: 79.3, y: 88.5 },
}

const PENINSULA_PATH =
  'M 20.08,1.24 L 18.67,6.29 L 22.5,13.77 L 23.83,26.51 L 22.68,28.54 L 27.63,35.45 L 25.97,41.52 L 29.37,45.25 L 28.78,49 L 30.51,49.06 L 30.24,50.26 L 38.32,59.11 L 39.91,63.55 L 38.22,66.04 L 46.31,70.13 L 47.56,73.29 L 49.53,73.36 L 52.57,76.39 L 58.49,78.55 L 61.8,82.44 L 72.03,87.2 L 75.14,92.22 L 75.66,88.74 L 75.96,91.16 L 78.52,88.64 L 83.3,89.42 L 82.79,86.27 L 84.8,90.52 L 88.05,90.5 L 87.46,85.77 L 80.39,70.28 L 77.24,68.93 L 74.02,65.06 L 74.58,54.63 L 72.09,51.01 L 74,47.29 L 73.09,44.82 L 74.86,41.49 L 74.59,37.87 L 73.99,33.64 L 68.6,23.42 L 58.45,15.47 L 55.76,10.52 L 51.52,9.26 L 47.08,17.78 L 44.86,17.42 L 43.02,14.43 L 37.94,16.47 L 35.57,19.78 L 33.07,16.55 L 35.41,13.72 L 34.31,10.96 L 35.21,9.14 L 30.89,9.47 L 28.98,4.83 L 27.53,5.96 L 23.64,4.69 L 20.08,1.24 Z'

export function GrowthMap({ regions }: { regions: { region: string; pct: number; color: string }[] }) {
  return (
    <div className="relative mx-auto mt-1 aspect-[5/6] w-full max-w-[220px]">
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
        <path d={PENINSULA_PATH} className="fill-ink-850 stroke-ink-800" strokeWidth="1.2" strokeLinejoin="round" />
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
            <span className="block h-3 w-3 rounded-full shadow ring-2 ring-white" style={{ background: r.color }} />
            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-paper px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {r.region} {r.pct}%
            </span>
          </div>
        )
      })}
    </div>
  )
}
