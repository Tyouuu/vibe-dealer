'use client'

import { Fragment, useState } from 'react'
import { SIM_TYPE_LABEL, SIM_TYPE_PILL_CLASS, type SimStockType } from '@/lib/sim-stock'
import { ScrollFade } from '../scroll-fade'
import { formatMYR } from '@/lib/money'
import { LOG_COL, LOG_COL_NOTE_FLEX } from '@/lib/log-columns'
import { formatDateLabel } from '@/lib/month'
import { AdjustIntakeButton } from './adjust-intake-button'

export type IntakeItem = {
  id: string
  intake_date: string
  sim_type: SimStockType
  quantity: number
  cost_per_unit_rm: number
  totalCost: number
  note: string | null
  recordedByName: string
  // Adjust is refused on a row that is itself already a correction — same
  // rule as records' AdjustButton and adjustSimStockIntake's own server-side
  // check, mirrored here so the button never appears where it would fail.
  isCorrection: boolean
}

// Seven columns, plus one 32px chevron — the same width dealer-orders-table
// already spends on its own disclosure, on the same page. This table used to
// have no chevron at all: the six data columns were hidden behind one inside
// a 607px card, and once the form moved below rather than beside the log and
// the columns came out full-width, hiding them again would have opened a
// 640px hole in every row. That reasoning holds for the six data columns —
// none of them are behind the chevron here. What earns a disclosure now is
// the one thing that genuinely cannot be a column without widening every row
// on the page for a button most rows never use: correcting a mis-entered
// intake.
//
// Column ORDER, and why the money is last.
//
// Giving the slack to Note fixed the box and not the complaint. The client
// said "统一" four times about this table and was never talking about its
// width — all three tables on this page are 1136px and end at the same x,
// measured twice. They were pointing at where the last GLYPH sits. A
// right-aligned figure or a chevron puts ink on the right edge; a
// left-aligned sentence puts ink wherever it happens to stop, and Note
// stopped 223px short while the two tables above and below it reached the
// edge (qa-probe-ink.mjs measures exactly this — healthy is 12px, the cell's
// own padding).
//
// So the flexible column moves inland, where its ragged edge is covered by
// the next column, and the row ends the way every other finance table in
// this app ends: on a right-aligned total, now followed only by the same
// narrow chevron the orders table already carries.
//
// Note and Recorded By sit together at 2 and 3 because they are the same
// kind of thing — who says so, and what they said — and neither is what the
// row is about.
export function StockIntakeTable({ intakes }: { intakes: IntakeItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <ScrollFade label="SIM stock intake history">
      <div
        className="log-grid grid gap-x-3 text-sm"
        style={{
          // Shared widths — see lib/log-columns.ts. Date, SIM Type, Qty and
          // both money columns are the same size as the orders table below.
          // The 1fr is second, not last: see the note above on why the row has
          // to end on ink rather than on whitespace.
          gridTemplateColumns: [
            LOG_COL.date,
            LOG_COL_NOTE_FLEX,
            LOG_COL.person,
            LOG_COL.sim,
            LOG_COL.qty,
            LOG_COL.money,
            LOG_COL.money,
            LOG_COL.chevron,
          ].join(' '),
        }}
      >
        <div className="th">Date</div>
        <div className="th">Note</div>
        <div className="th">Recorded By</div>
        <div className="th">SIM Type</div>
        <div className="th text-right">Qty</div>
        <div className="th text-right">Cost/Unit</div>
        <div className="th text-right">Total Cost</div>
        <div className="th"></div>
        {intakes.map((r, i) => {
          const open = openId === r.id
          const toggle = () => setOpenId(open ? null : r.id)
          const showDivider = !(i === intakes.length - 1 && !open)
          return (
            <Fragment key={r.id}>
              {/* formatDateLabel, like every other date in the app. This
                  printed the raw ISO string, so the two tables on this one
                  page dated their rows differently: 2026-07-28 above, 7 Aug
                  2026 below. */}
              <div onClick={toggle} className="px-3 py-3.5 cursor-pointer whitespace-nowrap text-paper-dim">
                {formatDateLabel(r.intake_date)}
              </div>
              <div
                onClick={toggle}
                className="px-3 py-3.5 cursor-pointer truncate text-paper-dim"
                title={r.note ?? undefined}
              >
                {r.isCorrection && <span className="mr-1 font-semibold text-paper">Correction —</span>}
                {r.note ?? <span className="text-paper-dim/50">—</span>}
              </div>
              <div onClick={toggle} className="px-3 py-3.5 cursor-pointer truncate text-paper-dim" title={r.recordedByName}>
                {r.recordedByName}
              </div>
              <div onClick={toggle} className="px-3 py-3.5 cursor-pointer">
                {/* max-w-none: .tag caps at 150px for the short labels it was
                    built for, and a SIM type name is 176px — inside that cap it
                    wrapped to two lines and took the row height with it. */}
                <span className={`tag max-w-none whitespace-nowrap ${SIM_TYPE_PILL_CLASS[r.sim_type]}`}>{SIM_TYPE_LABEL[r.sim_type]}</span>
              </div>
              <div onClick={toggle} className="px-3 py-3.5 cursor-pointer text-right text-paper-dim">
                {r.quantity.toLocaleString()}
              </div>
              <div onClick={toggle} className="px-3 py-3.5 cursor-pointer text-right figure-money font-normal text-paper-dim">
                {formatMYR(r.cost_per_unit_rm)}
              </div>
              <div onClick={toggle} className="px-3 py-3.5 cursor-pointer text-right figure-money font-semibold text-paper">
                {formatMYR(r.totalCost)}
              </div>
              <div onClick={toggle} className="px-3 py-3.5 cursor-pointer text-paper-dim">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
              {/* One divider spanning every column, not a border-b per cell —
                  this is a CSS grid with gap-x-3, and a per-cell border stops
                  at each cell's edge, so the gutters cut the line into
                  visible dashes across the row. */}
              {showDivider && !open && <div style={{ gridColumn: '1 / -1' }} className="border-b border-ink-800" />}
              {open && (
                <div style={{ gridColumn: '1 / -1' }} className="pb-4">
                  <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-4">
                    {r.isCorrection ? (
                      <p className="text-[13px] text-paper-dim">
                        This is itself a correction — to fix it further, correct the intake it points to instead.
                      </p>
                    ) : (
                      <div onClick={(e) => e.stopPropagation()}>
                        <AdjustIntakeButton intakeId={r.id} currentQuantity={r.quantity} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </ScrollFade>
  )
}
