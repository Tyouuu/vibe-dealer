import type { Metadata } from 'next'
import { Fragment } from 'react'
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

      {/* minmax(0, …) instead of a bare 1.4fr/1fr — a plain fr track's
          implicit minimum is its content's min-content width, so this grid
          and the near-identical one below (Stock Intake History) each ended
          up with a DIFFERENT actual pixel split for the "same" 1.4fr/1fr,
          purely because Place Order vs Log Stock Intake have different
          min-content widths. Two card widths that were only close by
          coincidence, not by design — minmax(0, …) makes both grids divide
          the same container width by the same ratio every time, so the two
          tables' cards always come out exactly the same width. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="app-card min-w-0" id="dealer-orders">
          <div className="mb-3.5 flex items-center justify-between">
            <h3 className="text-sm font-bold text-paper">Dealer Orders</h3>
            <span className="pill pill-neutral">{orders.length} order{orders.length === 1 ? '' : 's'}</span>
          </div>
          {/* A CSS Grid, not a <table> — a literal table forces every column
              to its own fixed minimum width, and even tightly stacked
              (Paid+Margin, Shipping+Invoice, Status+Action in one cell each)
              that still needed a horizontal scrollbar at every common laptop
              width (1366-1600px). One grid instance for the whole list (not
              a div per row) is what makes every row's Date/SIM Type/Paid/etc.
              line up in real columns — that alignment is the whole reason
              this isn't back to the flex-wrap chips from before, which let
              each row's text find its own width and drift out of line with
              its neighbors.

              Dealer has a real 80px floor (minmax(80px,1fr), not
              minmax(0,1fr)) — a bare 0 floor let it collapse to a few
              pixels the moment the other five fixed columns' combined width
              got close to the container's actual width, and a dealer name
              at ~4px doesn't wrap, it visually overflows into the next
              column and reads as garbled interleaved text. min-w-[528px] +
              overflow-x-auto is the honest fallback below that: scrolling a
              readable row is fine, silently overlapping two columns' text
              is not. */}
          {orders.length ? (
            <div className="overflow-x-auto">
            <div className="grid min-w-[528px] grid-cols-[60px_minmax(80px,1fr)_104px_80px_88px_76px] gap-x-2 text-[12.5px]">
              <div className="th">Date</div>
              <div className="th">Dealer</div>
              <div className="th">SIM Type</div>
              <div className="th text-right">Paid (RM)</div>
              <div className="th">Shipping</div>
              <div className="th">Status</div>
              {pagedOrders.map((o, i) => {
                const dealerRel = Array.isArray(o.dealers) ? o.dealers[0] : o.dealers
                const dealerName = dealerRel?.company_name ?? dealerNameById.get(o.dealer_id) ?? '—'
                const paid = o.quantity * Number(o.unit_price_rm)
                const margin = isFinance ? o.quantity * (Number(o.unit_price_rm) - Number(o.unit_cost_rm ?? 0)) : 0
                const border = i === pagedOrders.length - 1 ? '' : 'border-b border-ink-800'
                return (
                  <Fragment key={o.id}>
                    <div className={`py-2.5 text-paper-dim ${border}`}>{o.order_date}</div>
                    <div className={`py-2.5 font-semibold text-paper ${border}`}>{dealerName}</div>
                    <div className={`py-2.5 ${border}`}>
                      <span className={`tag ${SIM_TYPE_PILL_CLASS[o.sim_type]}`}>{SIM_TYPE_LABEL[o.sim_type]}</span>
                      <span className="mt-1 block text-paper-dim">Qty {o.quantity.toLocaleString()}</span>
                    </div>
                    <div className={`py-2.5 text-right ${border}`}>
                      <div className="figure-money font-semibold text-paper">RM {paid.toLocaleString()}</div>
                      {isFinance && <div className="mt-0.5 text-paper-dim">+RM {margin.toLocaleString()}</div>}
                    </div>
                    <div className={`py-2.5 text-paper-dim ${border}`}>
                      <div>{o.shipping_fee_rm != null ? `RM ${Number(o.shipping_fee_rm).toLocaleString()}` : '—'}</div>
                      <div className="mt-0.5">
                        {isPhysicalSimType(o.sim_type) ? (
                          o.shipping_invoice_path ? (
                            <a
                              href={`/api/sim-stock/invoice?path=${encodeURIComponent(o.shipping_invoice_path)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-primary hover:underline"
                            >
                              Invoice
                            </a>
                          ) : (
                            <span className="text-paper-dim/50">No invoice</span>
                          )
                        ) : o.esim_codes ? (
                          <span className="block max-w-[100px] truncate" title={o.esim_codes}>
                            {o.esim_codes}
                          </span>
                        ) : (
                          <span className="text-paper-dim/50">No codes</span>
                        )}
                      </div>
                    </div>
                    <div className={`py-2.5 ${border}`}>
                      {o.delivery_status === 'sent' ? <span className="pill pill-jade">Sent</span> : <span className="pill pill-brass">Pending</span>}
                      {o.delivery_status === 'pending' && (
                        <form action={markSimOrderSent} className="mt-1.5">
                          <input type="hidden" name="id" value={o.id} />
                          <ConfirmSubmitButton className="btn-jade w-full py-1 text-[11px]" confirmMessage="Mark this order as shipped? This cannot be undone.">
                            Mark Sent
                          </ConfirmSubmitButton>
                        </form>
                      )}
                    </div>
                  </Fragment>
                )
              })}
            </div>
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

        <div className="app-card min-w-0">
          <h3 className="mb-3.5 text-sm font-bold text-paper">Place Order</h3>
          <OrderForm
            dealers={dealerList.map((d) => ({ id: d.id, company_name: d.company_name, address: d.address }))}
            availableByType={availableByType}
          />
        </div>
      </div>

      {/* Same minmax(0, …) fix as the grid above, and for the same reason —
          this grid's own content (Log Stock Intake) differs from the other
          grid's (Place Order), so without it the two would independently
          drift to different pixel splits despite the identical 1.4fr/1fr. */}
      {isFinance && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="app-card min-w-0" id="stock-intake-history">
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-paper">Stock Intake History</h3>
              <span className="pill pill-neutral">{intakes.length} intake{intakes.length === 1 ? '' : 's'}</span>
            </div>
            {intakes.length ? (
              <div className="overflow-x-auto">
              <div className="grid min-w-[440px] grid-cols-[60px_104px_80px_84px_minmax(80px,1fr)] gap-x-2 text-[12.5px]">
                <div className="th">Date</div>
                <div className="th">SIM Type</div>
                <div className="th text-right">Total Cost</div>
                <div className="th">Recorded By</div>
                <div className="th">Note</div>
                {pagedIntakes.map((r, i) => {
                  const border = i === pagedIntakes.length - 1 ? '' : 'border-b border-ink-800'
                  return (
                    <Fragment key={r.id}>
                      <div className={`py-2.5 text-paper-dim ${border}`}>{r.intake_date}</div>
                      <div className={`py-2.5 ${border}`}>
                        <span className={`tag ${SIM_TYPE_PILL_CLASS[r.sim_type]}`}>{SIM_TYPE_LABEL[r.sim_type]}</span>
                        <span className="mt-1 block text-paper-dim">Qty {r.quantity.toLocaleString()}</span>
                      </div>
                      <div className={`py-2.5 text-right ${border}`}>
                        <div className="figure-money font-semibold text-paper">RM {(r.quantity * Number(r.cost_per_unit_rm)).toLocaleString()}</div>
                        <div className="mt-0.5 text-paper-dim">RM {Number(r.cost_per_unit_rm).toFixed(2)}/unit</div>
                      </div>
                      <div className={`py-2.5 text-paper-dim ${border}`}>{nameById.get(r.recorded_by) ?? '—'}</div>
                      <div className={`py-2.5 text-paper-dim ${border}`}>
                        {r.note ? (
                          <span className="block truncate" title={r.note}>
                            {r.note}
                          </span>
                        ) : (
                          <span className="text-paper-dim/50">—</span>
                        )}
                      </div>
                    </Fragment>
                  )
                })}
              </div>
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

          <div className="app-card min-w-0">
            <h3 className="mb-3.5 text-sm font-bold text-paper">Log Stock Intake</h3>
            <IntakeForm />
          </div>
        </div>
      )}
    </div>
  )
}
