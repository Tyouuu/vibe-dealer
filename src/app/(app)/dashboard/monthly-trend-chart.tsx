'use client'

import { useMemo, useState } from 'react'
import { Listbox } from '../listbox'

export type TrendRow = { month: string; label: string; region: string; points: number }

// 1400x180, not 640x180. An SVG with `w-full` scales its viewBox to the
// available width, so a 640-wide box in a ~1500px card was being blown up
// 2.3x — 6 data points over 420px of mostly empty fill. Capping the height
// with max-h and `preserveAspectRatio="none"` fixed the height but stretched
// everything inside horizontally, including the month labels: "Mar" and
// "Aug" rendered visibly wide. A viewBox whose aspect already matches where
// it renders needs neither, so the type stays undistorted.
const CHART_W = 1400
const CHART_H = 180
// Half a month label's width, or the first and last ones clip against
// the viewBox edge — 'Aug' was cut off on the right.
const PAD_L = 30
const PAD_R = 30
// Tall enough to leave room for the peak-value label above the highest
// point — that label sits 10px above its point (see the last.points <text>
// below) and is itself ~11px tall, so a point at exactly the chart's own
// top (niceMax, common whenever the latest month is also the peak, as it
// usually is) needs ~24px of clearance above y=0 or the label's top edge
// gets clipped by the SVG's own viewBox boundary.
const PAD_T = 26
const PAD_B = 28

export function MonthlyTrendChart({ rows, regions }: { rows: TrendRow[]; regions: string[] }) {
  const [region, setRegion] = useState('all')
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const months = useMemo(() => [...new Set(rows.map((r) => r.month))].sort(), [rows])

  const series = useMemo(
    () =>
      months.map((month) => {
        const matching = rows.filter((r) => r.month === month && (region === 'all' || r.region === region))
        return {
          month,
          label: rows.find((r) => r.month === month)?.label ?? month,
          points: matching.reduce((s, r) => s + r.points, 0),
        }
      }),
    [rows, months, region]
  )

  const hasData = series.some((s) => s.points > 0)
  const maxVal = Math.max(1, ...series.map((s) => s.points))
  const niceMax = Math.ceil(maxVal / 4) * 4 || 4
  const innerW = CHART_W - PAD_L - PAD_R
  const innerH = CHART_H - PAD_T - PAD_B
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0

  const xFor = (i: number) => PAD_L + stepX * i
  const yFor = (v: number) => PAD_T + innerH - (v / niceMax) * innerH

  const linePath = series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(s.points)}`).join(' ')
  const areaPath = `${linePath} L ${xFor(series.length - 1)} ${PAD_T + innerH} L ${xFor(0)} ${PAD_T + innerH} Z`

  const last = series[series.length - 1]
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f)

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * CHART_W
    const idx = stepX > 0 ? Math.round((relX - PAD_L) / stepX) : 0
    setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)))
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        onMouseMove={hasData ? handleMove : undefined}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Monthly top-up trend"
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-jade)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-jade)" stopOpacity={0} />
          </linearGradient>
        </defs>

        {gridLines.map((g) => (
          <line
            key={g}
            x1={PAD_L}
            x2={CHART_W - PAD_R}
            y1={yFor(g)}
            y2={yFor(g)}
            stroke="var(--color-ink-800)"
            strokeWidth={1}
          />
        ))}

        {hasData && (
          <>
            <path d={areaPath} fill="url(#trend-fill)" stroke="none" />
            <path d={linePath} fill="none" stroke="var(--color-jade-bright)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}

        {series.map((s, i) => (
          <text key={s.month} x={xFor(i)} y={CHART_H - 8} textAnchor="middle" fontSize={12} fill="var(--color-paper-dim)">
            {s.label}
          </text>
        ))}

        {hasData && hoverIdx != null && (
          <line
            x1={xFor(hoverIdx)}
            x2={xFor(hoverIdx)}
            y1={PAD_T}
            y2={PAD_T + innerH}
            stroke="var(--color-paper-dim)"
            strokeWidth={1}
            strokeOpacity={0.5}
          />
        )}

        {hasData &&
          series.map((s, i) => {
            const isLast = i === series.length - 1
            const isHovered = hoverIdx === i
            if (!isLast && !isHovered) return null
            return (
              <circle
                key={s.month}
                cx={xFor(i)}
                cy={yFor(s.points)}
                r={4}
                fill="var(--color-jade-bright)"
                stroke="var(--color-ink-900)"
                strokeWidth={2}
              />
            )
          })}

        {hasData && last && (
          // Math.max clamps this defensively even if PAD_T above ever drifts
          // out of sync with this label's own offset/font-size again — the
          // label's top edge should never be able to reach y=0.
          <text
            x={xFor(series.length - 1)}
            y={Math.max(yFor(last.points) - 10, 14)}
            textAnchor="end"
            fontSize={12}
            fontWeight={600}
            fill="var(--color-jade-bright)"
          >
            {last.points.toLocaleString()}
          </text>
        )}
      </svg>

      <div className="mt-2 flex min-h-[34px] flex-wrap items-center gap-3 text-xs text-paper-dim">
        {!hasData ? (
          <span>No verified top-up yet — this chart fills in once transactions start coming through.</span>
        ) : hoverIdx != null && series[hoverIdx] ? (
          <span>
            {series[hoverIdx].label}: <b className="figure-points">{series[hoverIdx].points.toLocaleString()} pts</b>
          </span>
        ) : (
          <span>Hover the line for a monthly figure. Verified top-up points, {region === 'all' ? 'all regions' : region}.</span>
        )}
        {/* On the caption line, not in a band of its own above the plot.
            Floating there it left an empty strip between the supporting
            stats and the chart they trail. */}
        {regions.length > 0 && (
          <div className="ml-auto w-40 shrink-0">
            <Listbox
              value={region}
              onChange={setRegion}
              options={[{ value: 'all', label: 'All Regions' }, ...regions.map((r) => ({ value: r, label: r }))]}
            />
          </div>
        )}
      </div>
    </div>
  )
}
