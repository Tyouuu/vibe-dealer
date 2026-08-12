import { SIM_TYPE_LABEL, SIM_TYPE_PILL_CLASS, type SimStockType } from '@/lib/sim-stock'
import { ScrollFade } from '../scroll-fade'
import { formatMYR } from '@/lib/money'
import { LOG_COL, LOG_COL_NOTE_FLEX } from '@/lib/log-columns'
import { formatDateLabel } from '@/lib/month'

export type IntakeItem = {
  id: string
  intake_date: string
  sim_type: SimStockType
  quantity: number
  cost_per_unit_rm: number
  totalCost: number
  note: string | null
  recordedByName: string
}

// Every column, no click-to-expand.
//
// This table used to hide Cost/Unit, Recorded By and Note behind a chevron.
// That was the right call when it lived inside a 607px card beside a form —
// six columns in that space read as cramped, which is exactly what the
// client complained about. The form now sits below rather than alongside, so
// the log has the full width of the band, and in that space the disclosure
// inverted the problem: four short columns across 1,137px left a 640px hole
// in every row.
//
// The reason for hiding them is gone, so they come back. Note takes the
// slack because it is the one genuinely variable-length value here; a
// right-aligned money column taking it is what opened the hole in the first
// place.
export function StockIntakeTable({ intakes }: { intakes: IntakeItem[] }) {
  return (
    <ScrollFade label="SIM stock intake history">
      <div
        className="log-grid grid gap-x-3 text-sm"
        style={{
          // Shared widths — see lib/log-columns.ts. Date, SIM Type, Qty and
          // both money columns are the same size as the orders table below.
          // The last data column is fixed and the slack goes to a trailing
          // spacer, exactly as the orders table below does. Note was
          // minmax(120px,1fr) and took 384px of the row — a near-empty column
          // three times the width of any figure beside it, which is most of
          // why the two tables on this page did not look related.
          gridTemplateColumns: [LOG_COL.date, LOG_COL.sim, LOG_COL.qty, LOG_COL.money, LOG_COL.money, LOG_COL.person, LOG_COL_NOTE_FLEX].join(' '),
        }}
      >
        <div className="th">Date</div>
        <div className="th">SIM Type</div>
        <div className="th text-right">Qty</div>
        <div className="th text-right">Cost/Unit</div>
        <div className="th text-right">Total Cost</div>
        <div className="th">Recorded By</div>
        <div className="th">Note</div>
        {intakes.map((r, i) => (
          <div key={r.id} className="contents">
            {/* formatDateLabel, like every other date in the app. This printed
                the raw ISO string, so the two tables on this one page dated
                their rows differently: 2026-07-28 above, 7 Aug 2026 below. */}
            <div className="px-3 py-3.5 whitespace-nowrap text-paper-dim">{formatDateLabel(r.intake_date)}</div>
            <div className="px-3 py-3.5">
              {/* max-w-none: .tag caps at 150px for the short labels it was
                  built for, and a SIM type name is 176px — inside that cap it
                  wrapped to two lines and took the row height with it. */}
              <span className={`tag max-w-none whitespace-nowrap ${SIM_TYPE_PILL_CLASS[r.sim_type]}`}>{SIM_TYPE_LABEL[r.sim_type]}</span>
            </div>
            <div className="px-3 py-3.5 text-right text-paper-dim">{r.quantity.toLocaleString()}</div>
            <div className="px-3 py-3.5 text-right figure-money font-normal text-paper-dim">{formatMYR(r.cost_per_unit_rm)}</div>
            <div className="px-3 py-3.5 text-right figure-money font-semibold text-paper">{formatMYR(r.totalCost)}</div>
            <div className="px-3 py-3.5 truncate text-paper-dim" title={r.recordedByName}>
              {r.recordedByName}
            </div>
            <div className="px-3 py-3.5 truncate text-paper-dim" title={r.note ?? undefined}>
              {r.note ?? <span className="text-paper-dim/50">—</span>}
            </div>
            {/* One divider spanning every column, not a border-b per cell —
                this is a CSS grid with gap-x-3, and a per-cell border stops
                at each cell's edge, so the gutters cut the line into seven
                visible dashes across the row. */}
            {i < intakes.length - 1 && <div style={{ gridColumn: '1 / -1' }} className="border-b border-ink-800" />}
          </div>
        ))}
      </div>
    </ScrollFade>
  )
}
