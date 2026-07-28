import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { SIM_BOX_SIZE, SIM_MARGIN_RM, SIM_SELL_PRICE_RM, SIM_UNIT_COST_RM, SIM_STOCK_TYPES, SIM_TYPE_LABEL, SIM_TYPE_PILL_CLASS, isPhysicalSimType, type SimStockType } from '@/lib/sim-stock'
import { ConfirmSubmitButton } from '../confirm-submit-button'
import { markSimOrderSent } from './actions'
import { OrderForm } from './order-form'
import { IntakeForm } from './intake-form'
import { IconInfo } from '../icons'

export const metadata: Metadata = {
  title: 'SIM Card Stock — DealerHub',
}

type IntakeRow = {
  id: string
  intake_date: string
  sim_type: SimStockType
  quantity: number
  cost_per_unit_rm: number
  note: string | null
  recorded_by: string
}

type OrderRow = {
  id: string
  dealer_id: string
  order_date: string
  sim_type: SimStockType
  quantity: number
  unit_price_rm: number
  unit_cost_rm?: number
  shipping_fee_rm: number | null
  shipping_invoice_path: string | null
  esim_codes: string | null
  delivery_status: 'pending' | 'sent'
  recorded_by: string
  delivered_by: string | null
  dealers?: { company_name: string } | { company_name: string }[] | null
}

type BalanceRow = { sim_type: SimStockType; total_intake: number; total_sold: number; available: number }

const PAGE_SIZE = 50

type PageProps = {
  searchParams: Promise<{ error?: string; intake_saved?: string; order_saved?: string; orders_page?: string; intake_page?: string }>
}

export default async function SimStockPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error, intake_saved, order_saved, orders_page, intake_page } = await searchParams
  const ordersPageNum = Math.max(1, Math.trunc(Number(orders_page)) || 1)
  const intakePageNum = Math.max(1, Math.trunc(Number(intake_page)) || 1)
  const isFinance = user.role === 'accountant' || user.role === 'master'

  if (user.role !== 'cs' && !isFinance) {
    return <PermissionDenied role={user.role} action="view SIM stock" />
  }

  const supabase = await createClient()

  const [{ data: balanceRows }, { data: dealers }, { data: orderRows }, { data: profiles }] = await Promise.all([
    supabase.from('sim_stock_balance').select('sim_type, total_intake, total_sold, available'),
    supabase.from('dealers_directory').select('id, company_name, address').order('company_name', { ascending: true }),
    isFinance
      ? supabase
          .from('sim_orders')
          .select(
            'id, dealer_id, order_date, sim_type, quantity, unit_price_rm, unit_cost_rm, shipping_fee_rm, shipping_invoice_path, esim_codes, delivery_status, recorded_by, delivered_by, dealers(company_name)'
          )
          .order('order_date', { ascending: false })
      : supabase
          .from('sim_orders_directory')
          .select('id, dealer_id, order_date, sim_type, quantity, unit_price_rm, shipping_fee_rm, shipping_invoice_path, esim_codes, delivery_status, recorded_by, delivered_by')
          .order('order_date', { ascending: false }),
    supabase.from('profiles').select('id, name, email'),
  ])

  const balanceByType = new Map((balanceRows as BalanceRow[] | null ?? []).map((b) => [b.sim_type, b]))
  const emptyBalanceFor = (t: SimStockType): BalanceRow => ({ sim_type: t, total_intake: 0, total_sold: 0, available: 0 })
  const balances = SIM_STOCK_TYPES.map((t) => balanceByType.get(t) ?? emptyBalanceFor(t))
  const availableByType = Object.fromEntries(balances.map((b) => [b.sim_type, b.available])) as Record<SimStockType, number>

  const dealerList = (dealers ?? []) as { id: string; company_name: string; address: string | null }[]
  const dealerNameById = new Map(dealerList.map((d) => [d.id, d.company_name]))
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name ?? p.email ?? '—']))
  const orders = (orderRows as unknown as OrderRow[] | null) ?? []

  let intakes: IntakeRow[] = []
  if (isFinance) {
    const { data } = await supabase
      .from('sim_stock_intakes')
      .select('id, intake_date, sim_type, quantity, cost_per_unit_rm, note, recorded_by')
      .order('intake_date', { ascending: false })
    intakes = (data as IntakeRow[] | null) ?? []
  }

  const totalIntakeCost = intakes.reduce((s, r) => s + r.quantity * Number(r.cost_per_unit_rm), 0)
  const totalOrderRevenue = orders.reduce((s, o) => s + o.quantity * Number(o.unit_price_rm), 0)
  const totalOrderMargin = isFinance ? orders.reduce((s, o) => s + o.quantity * (Number(o.unit_price_rm) - Number(o.unit_cost_rm ?? 0)), 0) : 0

  // Sliced in memory rather than a second .range() query per list — unlike
  // Records/Dealers this data doesn't grow across a whole customer base, just
  // one master dealer's own order/intake history, so fetching the full set
  // once (already needed for the totals above) and paginating the *render*
  // is simpler without meaningfully changing what gets sent over the wire.
  const ordersTotalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))
  const ordersPage = Math.min(ordersPageNum, ordersTotalPages)
  const pagedOrders = orders.slice((ordersPage - 1) * PAGE_SIZE, ordersPage * PAGE_SIZE)

  const intakesTotalPages = Math.max(1, Math.ceil(intakes.length / PAGE_SIZE))
  const intakesPage = Math.min(intakePageNum, intakesTotalPages)
  const pagedIntakes = intakes.slice((intakesPage - 1) * PAGE_SIZE, intakesPage * PAGE_SIZE)

  function ordersPageHref(p: number) {
    return `/sim-stock${p > 1 ? `?orders_page=${p}` : ''}#dealer-orders`
  }
  function intakePageHref(p: number) {
    return `/sim-stock${p > 1 ? `?intake_page=${p}` : ''}#stock-intake-history`
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="app-card">
        <h1 className="mb-1 text-[26px] font-extrabold tracking-tight text-paper">SIM Card Stock</h1>
        <div className="info-strip mb-4">
          <IconInfo className="mt-0.5 h-[15px] w-[15px] shrink-0" />
          <span>
            SIM cards — physical, physical with no number, or eSIM — bought from Vibe Mobile in bulk (a box is{' '}
            {SIM_BOX_SIZE}), resold to dealers in batches. Same system across all three, each its own stock pool; only
            physical has a real shipment. Kept separate from the points/topup ledger — this is a flat per-card
            margin, not a %-rate commission.
          </span>
        </div>

        {error && <div className="alert alert-bad">{error}</div>}
        {intake_saved && <div className="alert alert-ok">Stock intake recorded.</div>}
        {order_saved && <div className="alert alert-ok">Order recorded.</div>}

        <div className="grid gap-3 sm:grid-cols-3">
          {balances.map((b) => (
            <div key={b.sim_type} className="app-tile">
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-paper-dim">{SIM_TYPE_LABEL[b.sim_type]}</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10.5px] font-semibold text-paper-dim">Available</div>
                  <div className={`figure mt-1 text-lg font-semibold ${b.available <= 0 ? 'text-clay-bright' : 'text-paper'}`}>
                    {b.available.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10.5px] font-semibold text-paper-dim">Bought In</div>
                  <div className="figure mt-1 text-lg font-semibold text-paper">{b.total_intake.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-semibold text-paper-dim">Total Sold</div>
                  <div className="figure mt-1 text-lg font-semibold text-paper">{b.total_sold.toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {isFinance && (
          <>
            <div className="mt-3.5 app-tile">
              <div className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">Margin So Far (all types)</div>
              <div className="figure-money mt-1.5 text-xl font-semibold">RM {totalOrderMargin.toLocaleString()}</div>
              <div className="mt-0.5 text-[11px] text-paper-dim">RM {SIM_MARGIN_RM.toFixed(2)}/card</div>
            </div>
            <p className="note-strip mt-3.5">
              Cost RM {SIM_UNIT_COST_RM.toFixed(2)}/card from Vibe Mobile, resold at RM {SIM_SELL_PRICE_RM.toFixed(2)}/card — spent RM{' '}
              {totalIntakeCost.toLocaleString()} on stock so far, collected RM {totalOrderRevenue.toLocaleString()} from dealer orders.
            </p>
          </>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="app-card" id="dealer-orders">
          <div className="mb-3.5 flex items-center justify-between">
            <h3 className="text-sm font-bold text-paper">Dealer Orders</h3>
            <span className="pill pill-neutral">{orders.length} order{orders.length === 1 ? '' : 's'}</span>
          </div>
          {/* Date/SIM Type/Qty are given the exact same fixed widths, in the
              same column order, as Stock Intake History below — Dealer is
              the one column without a specified width (a bare <col />), so
              it alone absorbs whatever space table-fixed has left over.
              Without a flexible column like this, the browser stretches
              EVERY fixed-width column proportionally to fill the table's
              actual rendered width, and since that width differs from Stock
              Intake History's (different column count, different min-w
              floor), the "same" 90px Date column would render at a
              different actual pixel width in each table and the two would
              never line up — at any zoom level, not just this one. */}
          {orders.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-[90px]" />
                  <col className="w-32" />
                  <col className="w-14" />
                  <col />
                  <col className="w-20" />
                  {isFinance && <col className="w-20" />}
                  <col className="w-[70px]" />
                  <col className="w-24" />
                  <col className="w-[70px]" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">SIM Type</th>
                    <th className="th text-right">Qty</th>
                    <th className="th">Dealer</th>
                    <th className="th text-right">Paid (RM)</th>
                    {isFinance && <th className="th text-right">Margin (RM)</th>}
                    <th className="th text-right">Shipping</th>
                    <th className="th">Invoice / Codes</th>
                    <th className="th">Status</th>
                    <th className="th">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedOrders.map((o) => {
                    const dealerRel = Array.isArray(o.dealers) ? o.dealers[0] : o.dealers
                    const dealerName = dealerRel?.company_name ?? dealerNameById.get(o.dealer_id) ?? '—'
                    const paid = o.quantity * Number(o.unit_price_rm)
                    const margin = isFinance ? o.quantity * (Number(o.unit_price_rm) - Number(o.unit_cost_rm ?? 0)) : 0
                    return (
                      <tr key={o.id} className="tr-row">
                        <td className="td text-paper-dim">{o.order_date}</td>
                        <td className="td">
                          <span className={`tag ${SIM_TYPE_PILL_CLASS[o.sim_type]}`}>{SIM_TYPE_LABEL[o.sim_type]}</span>
                        </td>
                        <td className="td text-right">{o.quantity.toLocaleString()}</td>
                        <td className="td font-semibold text-paper">{dealerName}</td>
                        <td className="td figure-money text-right">RM {paid.toLocaleString()}</td>
                        {isFinance && <td className="td figure-money text-right">RM {margin.toLocaleString()}</td>}
                        <td className="td text-right text-paper-dim">{o.shipping_fee_rm != null ? `RM ${Number(o.shipping_fee_rm).toLocaleString()}` : '—'}</td>
                        <td className="td">
                          {isPhysicalSimType(o.sim_type) ? (
                            o.shipping_invoice_path ? (
                              <a
                                href={`/api/sim-stock/invoice?path=${encodeURIComponent(o.shipping_invoice_path)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                View
                              </a>
                            ) : (
                              <span className="text-paper-dim/50">—</span>
                            )
                          ) : o.esim_codes ? (
                            <span className="block truncate text-paper-dim" title={o.esim_codes}>
                              {o.esim_codes}
                            </span>
                          ) : (
                            <span className="text-paper-dim/50">—</span>
                          )}
                        </td>
                        <td className="td">
                          {o.delivery_status === 'sent' ? <span className="pill pill-jade">Sent</span> : <span className="pill pill-brass">Pending</span>}
                        </td>
                        <td className="td">
                          {o.delivery_status === 'pending' ? (
                            <form action={markSimOrderSent}>
                              <input type="hidden" name="id" value={o.id} />
                              <ConfirmSubmitButton className="btn-jade" confirmMessage="Mark this order as shipped? This cannot be undone.">
                                Mark as Sent
                              </ConfirmSubmitButton>
                            </form>
                          ) : (
                            <span className="text-paper-dim/50">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-paper-dim">No orders recorded yet.</p>
          )}
          {ordersTotalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
              <span className="text-[11.5px] text-paper-dim">
                Page {ordersPage} of {ordersTotalPages}
              </span>
              <div className="flex items-center gap-2">
                {ordersPage > 1 ? (
                  <Link href={ordersPageHref(ordersPage - 1)} className="btn-ghost py-1.5 text-xs">
                    ← Prev
                  </Link>
                ) : (
                  <span className="btn-ghost cursor-not-allowed py-1.5 text-xs opacity-40">← Prev</span>
                )}
                {ordersPage < ordersTotalPages ? (
                  <Link href={ordersPageHref(ordersPage + 1)} className="btn-ghost py-1.5 text-xs">
                    Next →
                  </Link>
                ) : (
                  <span className="btn-ghost cursor-not-allowed py-1.5 text-xs opacity-40">Next →</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="app-card">
          <h3 className="mb-3.5 text-sm font-bold text-paper">Place Order</h3>
          <OrderForm
            dealers={dealerList.map((d) => ({ id: d.id, company_name: d.company_name, address: d.address }))}
            availableByType={availableByType}
          />
        </div>
      </div>

      {isFinance && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="app-card" id="stock-intake-history">
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-paper">Stock Intake History</h3>
              <span className="pill pill-neutral">{intakes.length} intake{intakes.length === 1 ? '' : 's'}</span>
            </div>
            {intakes.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
                  <colgroup>
                    <col className="w-[90px]" />
                    <col className="w-32" />
                    <col className="w-14" />
                    <col className="w-20" />
                    <col className="w-24" />
                    <col />
                    <col className="w-28" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">SIM Type</th>
                      <th className="th text-right">Qty</th>
                      <th className="th text-right">Cost/Unit</th>
                      <th className="th text-right">Total Cost</th>
                      <th className="th">Note</th>
                      <th className="th">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedIntakes.map((r) => (
                      <tr key={r.id} className="tr-row">
                        <td className="td text-paper-dim">{r.intake_date}</td>
                        <td className="td">
                          <span className={`tag ${SIM_TYPE_PILL_CLASS[r.sim_type]}`}>{SIM_TYPE_LABEL[r.sim_type]}</span>
                        </td>
                        <td className="td text-right">{r.quantity.toLocaleString()}</td>
                        <td className="td figure-money text-right">RM {Number(r.cost_per_unit_rm).toFixed(2)}</td>
                        <td className="td figure-money text-right">RM {(r.quantity * Number(r.cost_per_unit_rm)).toLocaleString()}</td>
                        <td className="td text-paper-dim">{r.note ?? '—'}</td>
                        <td className="td text-paper-dim">{nameById.get(r.recorded_by) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-paper-dim">No stock intake recorded yet.</p>
            )}
            {intakesTotalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
                <span className="text-[11.5px] text-paper-dim">
                  Page {intakesPage} of {intakesTotalPages}
                </span>
                <div className="flex items-center gap-2">
                  {intakesPage > 1 ? (
                    <Link href={intakePageHref(intakesPage - 1)} className="btn-ghost py-1.5 text-xs">
                      ← Prev
                    </Link>
                  ) : (
                    <span className="btn-ghost cursor-not-allowed py-1.5 text-xs opacity-40">← Prev</span>
                  )}
                  {intakesPage < intakesTotalPages ? (
                    <Link href={intakePageHref(intakesPage + 1)} className="btn-ghost py-1.5 text-xs">
                      Next →
                    </Link>
                  ) : (
                    <span className="btn-ghost cursor-not-allowed py-1.5 text-xs opacity-40">Next →</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="app-card">
            <h3 className="mb-3.5 text-sm font-bold text-paper">Log Stock Intake</h3>
            <IntakeForm />
          </div>
        </div>
      )}
    </div>
  )
}
