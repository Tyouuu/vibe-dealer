'use client'

import { Fragment, useState } from 'react'
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

// Same progressive-disclosure pattern as Dealer Orders' table (and the
// Audit Log before it) — one clear value per column in the default row,
// with cost-per-unit/recorded-by/note (secondary to "what was bought and
// what it cost in total") behind a click-to-expand panel.
export function StockIntakeTable({ intakes }: { intakes: IntakeItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <ScrollFade label="SIM stock intake history">
      <div className="grid grid-cols-[72px_120px_50px_minmax(90px,1fr)_24px] gap-x-3 text-sm">
        <div className="th">Date</div>
        <div className="th">SIM Type</div>
        <div className="th text-right">Qty</div>
        <div className="th text-right">Total Cost</div>
        <div className="th"></div>
        {intakes.map((r, i) => {
          const open = openId === r.id
          const border = i === intakes.length - 1 && !open ? '' : 'border-b border-ink-800'
          const toggle = () => setOpenId(open ? null : r.id)
          return (
            <Fragment key={r.id}>
              <div onClick={toggle} className={`cursor-pointer whitespace-nowrap py-3.5 text-paper-dim ${border}`}>
                {r.intake_date}
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5 ${border}`}>
                <span className={`tag ${SIM_TYPE_PILL_CLASS[r.sim_type]}`}>{SIM_TYPE_LABEL[r.sim_type]}</span>
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5 text-right text-paper-dim ${border}`}>
                {r.quantity.toLocaleString()}
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5 text-right figure-money font-semibold text-paper ${border}`}>
                {formatMYR(r.totalCost)}
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5 text-paper-dim ${border}`}>
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
              {open && (
                <div style={{ gridColumn: '1 / -1' }} className="pb-4">
                  <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-4">
                    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">Cost/Unit</dt>
                        <dd className="mt-1 text-[13px] font-semibold text-paper">{formatMYR(r.cost_per_unit_rm)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">Recorded By</dt>
                        <dd className="mt-1 text-[13px] font-semibold text-paper">{r.recordedByName}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">Note</dt>
                        <dd className="mt-1 text-[13px] font-semibold text-paper">
                          {r.note ?? <span className="font-normal text-paper-dim/50">—</span>}
                        </dd>
                      </div>
                    </dl>
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
