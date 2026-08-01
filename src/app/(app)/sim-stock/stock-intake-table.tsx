import { SIM_TYPE_LABEL, SIM_TYPE_PILL_CLASS, type SimStockType } from '@/lib/sim-stock'
import { ScrollFade } from '../scroll-fade'
import { formatMYR } from '@/lib/money'

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
      <div className="grid grid-cols-[84px_max-content_60px_104px_132px_150px_minmax(120px,1fr)] gap-x-3 text-sm">
        <div className="th">Date</div>
        <div className="th">SIM Type</div>
        <div className="th text-right">Qty</div>
        <div className="th text-right">Cost/Unit</div>
        <div className="th text-right">Total Cost</div>
        <div className="th">Recorded By</div>
        <div className="th">Note</div>
        {intakes.map((r, i) => (
          <div key={r.id} className="contents">
            <div className="whitespace-nowrap py-3.5 text-paper-dim">{r.intake_date}</div>
            <div className="py-3.5">
              {/* max-w-none: .tag caps at 150px for the short labels it was
                  built for, and a SIM type name is 176px — inside that cap it
                  wrapped to two lines and took the row height with it. */}
              <span className={`tag max-w-none whitespace-nowrap ${SIM_TYPE_PILL_CLASS[r.sim_type]}`}>{SIM_TYPE_LABEL[r.sim_type]}</span>
            </div>
            <div className="py-3.5 text-right text-paper-dim">{r.quantity.toLocaleString()}</div>
            <div className="py-3.5 text-right figure-money font-normal text-paper-dim">{formatMYR(r.cost_per_unit_rm)}</div>
            <div className="py-3.5 text-right figure-money font-semibold text-paper">{formatMYR(r.totalCost)}</div>
            <div className="truncate py-3.5 text-paper-dim" title={r.recordedByName}>
              {r.recordedByName}
            </div>
            <div className="truncate py-3.5 text-paper-dim" title={r.note ?? undefined}>
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
