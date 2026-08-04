'use client'

import { Fragment, useState } from 'react'
import { markSimOrderSent } from './actions'
import { ConfirmSubmitButton } from '../confirm-submit-button'
import { SIM_TYPE_LABEL, SIM_TYPE_PILL_CLASS, isPhysicalSimType, type SimStockType } from '@/lib/sim-stock'
import { ScrollFade } from '../scroll-fade'
import { StatusDot } from '../status-dot'
import { formatMYR } from '@/lib/money'
import { formatDateLabel } from '@/lib/month'

export type OrderItem = {
  id: string
  order_date: string
  dealerName: string
  sim_type: SimStockType
  quantity: number
  paid: number
  margin: number
  shipping_fee_rm: number | null
  shipping_invoice_path: string | null
  esim_codes: string | null
  delivery_status: 'pending' | 'sent'
}

// Every cell used to carry two stacked values (SIM Type+Qty, Paid+Margin,
// Shipping+Invoice, Status+Action) to keep the grid narrow enough to never
// need horizontal scroll. That packed enough into each row to read as
// cramped however well the columns aligned, so the secondary values went
// behind a chevron instead.
//
// The form has since moved below this log rather than beside it, and with
// the full width of the band there is room to show Margin and Shipping
// outright — hiding them now only leaves a hole on the right of every row.
// What stays behind the chevron is what genuinely cannot be a column: the
// invoice link / eSIM codes, and the Mark as sent action.
// isFinance and canMarkSent are two different splits and both are needed here.
// isFinance decides whether the margin column exists; canMarkSent mirrors who
// markSimOrderSent will actually accept (cs/master), which is not the same
// set. Showing the button to an accountant meant offering an action that
// always came back "you do not have permission".
export function DealerOrdersTable({
  orders,
  isFinance,
  canMarkSent,
}: {
  orders: OrderItem[]
  isFinance: boolean
  canMarkSent: boolean
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <ScrollFade label="Dealer SIM orders">
      {/* SIM Type sized to its own content so the pill holds "Physical SIM
          (With Number)" on one line — at 120px it wrapped and gave this
          table two row heights. Dealer takes what it needs up to 260px and
          truncates past that, for the same reason.
          Whatever width is left over goes into a trailing spacer, never into
          a data column: stretched across the band, one greedy column puts a
          300px hole in the middle of every row. */}
      <div
        className="grid gap-x-3 text-sm"
        style={{
          gridTemplateColumns: `72px minmax(140px,260px) max-content 44px 96px ${isFinance ? '92px ' : ''}100px 76px 20px minmax(0,1fr)`,
        }}
      >
        <div className="th">Date</div>
        <div className="th">Dealer</div>
        <div className="th">SIM Type</div>
        <div className="th text-right">Qty</div>
        <div className="th text-right">Paid (RM)</div>
        {isFinance && <div className="th text-right">Margin</div>}
        <div className="th text-right">Shipping</div>
        <div className="th">Status</div>
        {/* One cell over the chevron and the spacer — .th draws its own
            bottom border and the grid gutters would otherwise cut a
            conspicuous double gap into the end of the header rule. */}
        <div className="th" style={{ gridColumn: isFinance ? '9 / -1' : '8 / -1' }}></div>
        {orders.map((o, i) => {
          const open = openId === o.id
          // The row divider is one element spanning every column, not a
          // border-b on each cell. This is a CSS grid with gap-x-3, and a
          // per-cell border stops at each cell's edge — the 12px gutters
          // cut the line into seven visible dashes across the row. A real
          // <table> doesn't have this problem because border-collapse
          // joins the cells; a grid needs the divider drawn separately.
          const showDivider = !(i === orders.length - 1 && !open)
          const toggle = () => setOpenId(open ? null : o.id)
          return (
            <Fragment key={o.id}>
              <div onClick={toggle} className={`cursor-pointer whitespace-nowrap py-3.5 text-paper-dim`}>
                {formatDateLabel(o.order_date)}
              </div>
              <div onClick={toggle} title={o.dealerName} className={`cursor-pointer truncate py-3.5 font-semibold text-paper`}>
                {o.dealerName}
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5`}>
                {/* max-w-none: see the note in stock-intake-table.tsx. */}
                <span className={`tag max-w-none whitespace-nowrap ${SIM_TYPE_PILL_CLASS[o.sim_type]}`}>{SIM_TYPE_LABEL[o.sim_type]}</span>
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5 text-right text-paper-dim`}>
                {o.quantity.toLocaleString()}
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5 text-right figure-money font-semibold text-paper`}>
                {formatMYR(o.paid)}
              </div>
              {isFinance && (
                <div onClick={toggle} className={`cursor-pointer py-3.5 text-right figure-money font-normal text-paper-dim`}>
                  +{formatMYR(o.margin)}
                </div>
              )}
              <div onClick={toggle} className={`cursor-pointer py-3.5 text-right figure-money font-normal text-paper-dim`}>
                {o.shipping_fee_rm != null ? formatMYR(Number(o.shipping_fee_rm)) : <span className="text-paper-dim/50">—</span>}
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5`}>
                {o.delivery_status === 'sent' ? <StatusDot color="jade-bright" label="Sent" /> : <StatusDot color="brass-bright" label="Pending" pulse />}
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5 text-paper-dim`}>
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
              {showDivider && !open && <div style={{ gridColumn: '1 / -1' }} className="border-b border-ink-800" />}
              {open && (
                <div style={{ gridColumn: '1 / -1' }} className="pb-4">
                  <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-4">
                    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-paper-dim">
                          {isPhysicalSimType(o.sim_type) ? 'Invoice' : 'eSIM Codes'}
                        </dt>
                        <dd className="mt-1 text-[13px] font-semibold text-paper">
                          {isPhysicalSimType(o.sim_type) ? (
                            o.shipping_invoice_path ? (
                              <a
                                href={`/api/sim-stock/invoice?path=${encodeURIComponent(o.shipping_invoice_path)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline"
                              >
                                View invoice
                              </a>
                            ) : (
                              <span className="font-normal text-paper-dim/50">No invoice</span>
                            )
                          ) : o.esim_codes ? (
                            <span className="block max-w-[220px] truncate" title={o.esim_codes}>
                              {o.esim_codes}
                            </span>
                          ) : (
                            <span className="font-normal text-paper-dim/50">No codes</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                    {canMarkSent && o.delivery_status === 'pending' && (
                      <form action={markSimOrderSent} className="mt-4" onClick={(e) => e.stopPropagation()}>
                        <input type="hidden" name="id" value={o.id} />
                        <ConfirmSubmitButton className="btn-jade" confirmMessage="Mark this order as shipped? This cannot be undone.">
                          Mark as sent
                        </ConfirmSubmitButton>
                      </form>
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
