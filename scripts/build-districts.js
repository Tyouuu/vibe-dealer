// One-off build step: turns DOSM's national district GeoJSON into the small
// projected SVG paths the dashboard map ships with. Run manually, commit the
// output — the app never fetches boundary data at runtime.
//
// Usage:
//   curl -sLo /tmp/dosm-districts.geojson \
//     https://raw.githubusercontent.com/dosm-malaysia/data-open/main/datasets/geodata/administrative_2_district.geojson
//   node scripts/build-districts.js /tmp/dosm-districts.geojson "src/app/(app)/dashboard/districts.ts"
const fs = require('fs')

const SRC = process.argv[2]
const OUT = process.argv[3]

if (!SRC || !OUT) {
  console.error('usage: node scripts/build-districts.js <source.geojson> <output.ts>')
  process.exit(1)
}

// Same projection the existing coastline path already uses, so the districts
// land exactly on top of it: lon 99.55..101.55 -> x 0..200,
// lat 6.85..3.45 -> y 0..340 (north at the top, hence the inverted lat).
const LON0 = 99.55, LON1 = 101.55, LAT0 = 6.85, LAT1 = 3.45
const W = 200, H = 340
const project = ([lon, lat]) => [((lon - LON0) / (LON1 - LON0)) * W, ((LAT0 - lat) / (LAT0 - LAT1)) * H]

const STATES = ['Perak', 'Pulau Pinang', 'Kedah']

// Sutherland-Hodgman against the viewBox rect: without clipping, districts
// that run past the coverage crop (Kedah reaching the Thai border, Perak
// reaching Pahang) would carry thousands of vertices the map never shows.
function clip(poly) {
  const edges = [
    { inside: p => p[0] >= 0, x: 0, axis: 0 },
    { inside: p => p[0] <= W, x: W, axis: 0 },
    { inside: p => p[1] >= 0, x: 0, axis: 1 },
    { inside: p => p[1] <= H, x: H, axis: 1 },
  ]
  let out = poly
  for (const e of edges) {
    const input = out
    out = []
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length]
      const curIn = e.inside(cur), prevIn = e.inside(prev)
      if (curIn !== prevIn) {
        const t = (e.x - prev[e.axis]) / (cur[e.axis] - prev[e.axis])
        const pt = [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]
        pt[e.axis] = e.x
        out.push(pt)
      }
      if (curIn) out.push(cur)
    }
    if (!out.length) return []
  }
  return out
}

// Douglas-Peucker. Tolerance is in viewBox units; the map renders 200 units
// across ~220px and zooms to at most 3.4x, so 0.4 stays under ~1.5px of error
// even fully zoomed in.
function simplify(pts, tol) {
  if (pts.length < 3) return pts
  let maxD = -1, idx = 0
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1]
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i]
    let d
    if (len2 === 0) d = Math.hypot(px - ax, py - ay)
    else {
      let t = ((px - ax) * dx + (py - ay) * dy) / len2
      t = Math.max(0, Math.min(1, t))
      d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    }
    if (d > maxD) { maxD = d; idx = i }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]]
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)]
}

const r = n => Math.round(n * 100) / 100
const ringToPath = ring => 'M ' + ring.map(p => `${r(p[0])},${r(p[1])}`).join(' L ') + ' Z'

const g = JSON.parse(fs.readFileSync(SRC, 'utf8'))
const out = []

for (const f of g.features) {
  const { state, district } = f.properties
  if (!STATES.includes(state)) continue
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  const paths = []
  let area = 0, cx = 0, cy = 0
  for (const poly of polys) {
    for (const ring of poly) {
      const projected = ring.map(project)
      const clipped = clip(projected)
      if (clipped.length < 4) continue
      const simplified = simplify(clipped, 0.4)
      if (simplified.length < 4) continue
      paths.push(ringToPath(simplified))
      // Shoelace area + centroid, for label placement.
      let a = 0, x = 0, y = 0
      for (let i = 0; i < simplified.length; i++) {
        const [x0, y0] = simplified[i], [x1, y1] = simplified[(i + 1) % simplified.length]
        const cross = x0 * y1 - x1 * y0
        a += cross; x += (x0 + x1) * cross; y += (y0 + y1) * cross
      }
      a /= 2
      if (Math.abs(a) > Math.abs(area)) { area = a; cx = x / (6 * a); cy = y / (6 * a) }
    }
  }
  if (!paths.length) continue
  out.push({ state, district, d: paths.join(' '), cx: r(cx), cy: r(cy), area: r(Math.abs(area)) })
}

out.sort((a, b) => a.state.localeCompare(b.state) || a.district.localeCompare(b.district))

const body = out
  .map(o => `  { state: ${JSON.stringify(o.state)}, district: ${JSON.stringify(o.district)}, cx: ${o.cx}, cy: ${o.cy}, d: '${o.d}' },`)
  .join('\n')

fs.writeFileSync(
  OUT,
  `// GENERATED FILE — do not edit by hand.
//
// District (daerah) outlines for the three states this dealer network covers,
// projected onto the same 200x340 viewBox as the coastline in growth-map.tsx
// (lon 99.55-101.55 -> x 0-200, lat 6.85-3.45 -> y 0-340), clipped to that
// box and simplified with Douglas-Peucker at 0.4 viewBox units.
//
// Source: Department of Statistics Malaysia (DOSM), dosm-malaysia/data-open,
// datasets/geodata/administrative_2_district.geojson. DOSM's Open Data
// License grants commercial use explicitly ("You are allowed to copy,
// publish, distribute, transmit, adapt and exploit the data commercially and
// non-commercially"). Chosen over geoBoundaries ADM2 deliberately: that
// dataset's licence provenance is contradictory (the site claims CC BY 4.0,
// its own MYS-ADM2 metadata claims CC BY 3.0 via citypopulation.de, whose
// terms expressly reserve map data, and HDX's mirror labels it ODbL), which
// is not a chain worth relying on in a commercial product. DOSM also carries
// a parent-state field, which geoBoundaries lacks.
//
// Note: DOSM splits Perak into 13 by listing "Larut Dan Matang" and "Selama"
// separately; the state officially has 12 with those merged. Kept as DOSM
// publishes it, since that matches the statistics the rest of the ledger
// would be compared against.
//
// Regenerate with scripts/build-districts.js if the source is ever refreshed.

export type District = { state: string; district: string; cx: number; cy: number; d: string }

export const DISTRICTS: District[] = [
${body}
]
`
)

const bytes = fs.statSync(OUT).size
console.log(`wrote ${out.length} districts -> ${OUT} (${(bytes / 1024).toFixed(1)} KB)`)
for (const s of STATES) console.log(`  ${s}: ${out.filter(o => o.state === s).length}`)
