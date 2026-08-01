'use client'

import { Fragment, useState } from 'react'
import { markSimOrderSent } from './actions'
import { ConfirmSubmitButton } from '../confirm-submit-button'
import { SIM_TYPE_LABEL, SIM_TYPE_PILL_CLASS, isPhysicalSimType, type SimStockType } from '@/lib/sim-stock'
import { ScrollFade } from '../scroll-fade'
import { formatMYR } from '@/lib/money'

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
// need horizontal scroll — that packed enough into each row that it read as
// cramped regardless of how the columns themselves aligned. Real dense-but-
// calm tables (Linear's issue list, Stripe's transaction list) solve this
// with progressive disclosure, not tighter packing: the default row shows
// one clear value per column, and anything secondary (margin, shipping,
// invoice, the Mark as Sent action) lives in a click-to-expand panel below
// it — same pattern this app already uses for the Audit Log's detail row.
export function DealerOrdersTable({ orders, isFinance }: { orders: OrderItem[]; isFinance: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <ScrollFade label="Dealer SIM orders">
      <div className="grid grid-cols-[72px_minmax(110px,1fr)_120px_50px_84px_84px_24px] gap-x-3 text-sm">
        <div className="th">Date</div>
        <div className="th">Dealer</div>
        <div className="th">SIM Type</div>
        <div className="th text-right">Qty</div>
        <div className="th text-right">Paid (RM)</div>
        <div className="th">Status</div>
        <div className="th"></div>
        {orders.map((o, i) => {
          const open = openId === o.id
          const border = i === orders.length - 1 && !open ? '' : 'border-b border-ink-800'
          const toggle = () => setOpenId(open ? null : o.id)
          return (
            <Fragment key={o.id}>
              <div onClick={toggle} className={`cursor-pointer whitespace-nowrap py-3.5 text-paper-dim ${border}`}>
                {o.order_date}
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5 font-semibold text-paper ${border}`}>
                {o.dealerName}
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5 ${border}`}>
                <span className={`tag ${SIM_TYPE_PILL_CLASS[o.sim_type]}`}>{SIM_TYPE_LABEL[o.sim_type]}</span>
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5 text-right text-paper-dim ${border}`}>
                {o.quantity.toLocaleString()}
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5 text-right figure-money font-semibold text-paper ${border}`}>
                {formatMYR(o.paid)}
              </div>
              <div onClick={toggle} className={`cursor-pointer py-3.5 ${border}`}>
                {o.delivery_status === 'sent' ? <span className="pill pill-jade">Sent</span> : <span className="pill pill-brass">Pending</span>}
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
                      {isFinance && (
                        <div>
                          <dt className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">Margin</dt>
                          <dd className="mt-1 text-[13px] font-semibold text-paper">+{formatMYR(o.margin)}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">Shipping</dt>
                        <dd className="mt-1 text-[13px] font-semibold text-paper">
                          {o.shipping_fee_rm != null ? `${formatMYR(Number(o.shipping_fee_rm))}` : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">
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
                    {o.delivery_status === 'pending' && (
                      <form action={markSimOrderSent} className="mt-4" onClick={(e) => e.stopPropagation()}>
                        <input type="hidden" name="id" value={o.id} />
                        <ConfirmSubmitButton className="btn-jade" confirmMessage="Mark this order as shipped? This cannot be undone.">
                          Mark as Sent
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
