import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import {
  SIM_BOX_SIZE,
  SIM_MARGIN_RM,
  SIM_SELL_PRICE_RM,
  SIM_STOCK_TYPES,
  SIM_UNIT_COST_RM,
  type SimStockType,
} from '@/lib/sim-stock'
import { DealerOrdersTable } from './dealer-orders-table'
import { StockIntakeTable } from './stock-intake-table'
import { PageHeader } from '../page-header'
import { StatusDot } from '../status-dot'
import { BandHeading, Pool, StockBar } from './elements'
import { formatMYR } from '@/lib/money'

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
    supabase.from('staff_directory').select('id, display_name'),
  ])

  const balanceByType = new Map((balanceRows as BalanceRow[] | null ?? []).map((b) => [b.sim_type, b]))
  const emptyBalanceFor = (t: SimStockType): BalanceRow => ({ sim_type: t, total_intake: 0, total_sold: 0, available: 0 })
  const balances = SIM_STOCK_TYPES.map((t) => balanceByType.get(t) ?? emptyBalanceFor(t))
  const totalAvailable = balances.reduce((sum, b) => sum + b.available, 0)

  const dealerList = (dealers ?? []) as { id: string; company_name: string; address: string | null }[]
  const dealerNameById = new Map(dealerList.map((d) => [d.id, d.company_name]))
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? '—']))
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
  // Shipping comes off the margin. The client confirmed the fee recorded on
  // an order is what was paid to send it, not something charged on to the
  // dealer — and until now nothing in this app subtracted it. Every margin
  // figure on this page was therefore overstated by whatever shipping had
  // been paid: RM 82.50 against a true RM 58.50 on the seeded month, 41% high.
  const totalShipping = orders.reduce((s, o) => s + Number(o.shipping_fee_rm ?? 0), 0)
  const totalOrderMargin = isFinance
    ? orders.reduce((s, o) => s + o.quantity * (Number(o.unit_price_rm) - Number(o.unit_cost_rm ?? 0)) - Number(o.shipping_fee_rm ?? 0), 0)
    : 0
  const soldAtCost = isFinance ? orders.reduce((s, o) => s + o.quantity * Number(o.unit_cost_rm ?? 0), 0) : 0

  // What the shelf is doing, in the three states a card can be in. `sold`
  // here means "has an order against it" — sent and pending alike, which is
  // exactly what sim_stock_balance.total_sold counts, so `available` is
  // already net of every order and none of these three overlap.
  const totalBought = balances.reduce((sum, b) => sum + b.total_intake, 0)
  const totalSold = balances.reduce((sum, b) => sum + b.total_sold, 0)
  const qtyBy = (type: SimStockType | null, status: 'pending' | 'sent') =>
    orders.filter((o) => (type === null || o.sim_type === type) && o.delivery_status === status).reduce((s, o) => s + o.quantity, 0)
  const pendingQty = qtyBy(null, 'pending')
  const sentQty = qtyBy(null, 'sent')
  const emptyPool = balances.some((b) => b.available <= 0)

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

  // Two jobs were wearing one page. Buying stock from Vibe (money out, stock
  // up) and selling it to dealers (money in, stock down) are opposite
  // directions, and the page ran the identical "list on the left, form on the
  // right" layout twice in a row with nothing naming either one. That
  // repetition is what read as too much — not the amount of information.
  //
  // So the page is now four sections in the order you meet them: what is on
  // the shelf, which pools it sits in, what came in, what went out. And the
  // card rule applies throughout — a card is something you act on (the two
  // forms), a log is something you only read, so the logs lose theirs.
  return (
    <div className="flex flex-col gap-8">
      {/* Both forms moved to /sim-stock/log and are reached from here and
          from the sidebar, the way Onboard Dealer is reached from /dealers
          and from the sidebar. This page was one of only three in the app
          carrying more than one card, and both extras were forms — a page
          whose job is to show you stock levels and two logs, interrupted
          twice by something to fill in. */}
      <PageHeader
        title="SIM Card Stock"
        /* The unit economics used to be in here too. At 390px that made this
           the tallest header in the app — five lines of subtitle plus two
           buttons pushed the summary card to y=215, which design-audit
           flags. Those figures moved into the card's own facts line below,
           beside the money they explain, which is where you would look for
           them anyway. Nothing was dropped. */
        subtitle={`Bought from Vibe Mobile in boxes of ${SIM_BOX_SIZE} and resold to dealers — separate from the points ledger.`}
        action={isFinance ? { href: '/sim-stock/log', label: 'Log SIM Stock' } : undefined}
      />

      {error && <div className="alert alert-bad">{error}</div>}
      {intake_saved && <div className="alert alert-ok">Stock intake recorded.</div>}
      {order_saved && <div className="alert alert-ok">Order recorded.</div>}

      {/* The shelf, and under one rule the three pools it splits into — one
          card, because this is the page's opening summary.

          It was two flat bands on the bare canvas and that was a mistake.
          Measured across the app: every page the client rates as finished
          paints its first surface at y=104-124, directly under the title;
          the two he rates as unfinished started at y=384 and y=768. Total
          painted area predicts nothing (Dealers is 5% and reads fine,
          SIM Card Stock was 35% and did not) — what predicts it is whether
          the page opens with something to land on. Everything below this
          card stays flat.

          The bar is drawn at true proportions, which at 55 sold out of 3,000
          means two very thin segments. That is the honest shape of this
          business today and the counts beside it carry the exact numbers;
          padding those segments up to something more visible would draw a
          figure that isn't true.

          On what "sold" means here: sim_stock_balance.total_sold counts
          pending and sent orders alike, so `available` is already net of
          every order ever placed. There is no stock on this page that is
          spoken for but not yet deducted — the pending cards are a
          fulfilment fact (sold, still sitting here), not an availability
          one, and the legend says so rather than subtracting them twice. */}
      <section className="app-card">
        <div className="flex flex-wrap items-end gap-x-12 gap-y-6">
          <div>
            <p className="text-[12px] text-paper-dim">Available to sell</p>
            {/* Sans, not .figure's mono, and this is the one place on the
                page that differs. Mono exists so columns of digits line up;
                a single headline figure has no column to line up with, and
                the mono comma takes a full character advance — at 38px
                "2,945" rendered with a visible hole on each side of it.
                Tabular figures are kept so the number doesn't jump width
                when the count changes. */}
            <p className="tnum mt-1.5 text-[38px] font-semibold leading-none tracking-[-.03em] text-paper">
              {totalAvailable.toLocaleString()}
            </p>
            <p className="mt-2 text-[13px] text-paper-dim">of {totalBought.toLocaleString()} bought from Vibe Mobile</p>
          </div>
          {/* Capped, not stretched to the full 1,137px. Left as flex-1 the
              legend and the shelf count sat at opposite ends of the page
              with 700px of nothing between them — the exact "empty here,
              crowded there" the client keeps pointing at. */}
          {/* min-w-0, not min-w-[320px]. A hard 320px floor is wider than the
              content area of a 320px phone once padding is taken, so the whole
              page scrolled sideways by 40px — the one thing a page must never
              do. basis-[320px] keeps the same intent (do not squeeze this
              below a readable width while there is room) without making it a
              floor the viewport cannot honour. */}
          <div className="min-w-0 basis-[320px] max-w-[620px] flex-1">
            <StockBar sent={sentQty} pending={pendingQty} total={totalBought} />
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <StatusDot color="jade-bright" label={`${sentQty.toLocaleString()} sent`} />
              <StatusDot color="brass-bright" label={`${pendingQty.toLocaleString()} sold, still to send`} />
              <span className="text-[13px] text-paper-dim">{totalAvailable.toLocaleString()} still on the shelf</span>
            </div>
            {isFinance && (
              <p className="mt-3.5 text-[12px] text-paper-dim">
                {formatMYR(SIM_UNIT_COST_RM)} a card in, {formatMYR(SIM_SELL_PRICE_RM)} out — a flat {formatMYR(SIM_MARGIN_RM)} each ·{' '}
                {formatMYR(totalIntakeCost)} spent on stock · {formatMYR(totalIntakeCost - soldAtCost)} of it still unsold · margin{' '}
                {formatMYR(totalOrderMargin)} after shipping
              </p>
            )}
          </div>
        </div>

        {/* The three pools sit under the shelf inside the same card, split
            off by one rule — the same anatomy every other summary card in
            this app uses: headline figure, rule, the figures that break it
            down. Same bar as the shelf above, once per pool, because three
            bare numbers cannot show that one pool is draining while the
            other two are not. */}
        <div className="mt-7 border-t border-ink-800 pt-6">
          <BandHeading title="Three pools" sub="an order can only draw from its own type" />
          {emptyPool && (
            <p className="mb-4 text-[13px]" style={{ color: 'var(--color-clay-bright)' }}>
              One pool is empty — log a stock intake before taking that order.
            </p>
          )}
          <div className="grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-3">
            {balances.map((b) => (
              <Pool
                key={b.sim_type}
                simType={b.sim_type}
                available={b.available}
                intake={b.total_intake}
                sold={b.total_sold}
                sent={qtyBy(b.sim_type, 'sent')}
                pending={qtyBy(b.sim_type, 'pending')}
                low={b.available > 0 && b.available < SIM_BOX_SIZE}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Stock in — money out, stock up. */}
      {isFinance && (
        <section className="page-band" id="stock-intake-history">
          <BandHeading
            arrow="in"
            title="Stock in"
            sub="bought from Vibe Mobile"
            facts={[
              `${intakes.length} intake${intakes.length === 1 ? '' : 's'}`,
              `${formatMYR(totalIntakeCost)} spent`,
              `${totalBought.toLocaleString()} cards at ${formatMYR(SIM_UNIT_COST_RM)} each`,
            ]}
          />
          <div className="band-log min-w-0">
              {intakes.length ? (
                <StockIntakeTable
                  intakes={pagedIntakes.map((r) => ({
                    id: r.id,
                    intake_date: r.intake_date,
                    sim_type: r.sim_type,
                    quantity: r.quantity,
                    cost_per_unit_rm: Number(r.cost_per_unit_rm),
                    totalCost: r.quantity * Number(r.cost_per_unit_rm),
                    note: r.note,
                    recordedByName: nameById.get(r.recorded_by) ?? '—',
                  }))}
                />
              ) : (
                <p className="text-sm text-paper-dim">No stock intake recorded yet.</p>
              )}
              {intakesTotalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
                  <span className="text-[12px] text-paper-dim">
                    Page {intakesPage} of {intakesTotalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    {intakesPage > 1 ? (
                      <Link href={intakePageHref(intakesPage - 1)} className="btn-ghost py-1.5 text-xs">
                        Previous
                      </Link>
                    ) : (
                      <button type="button" disabled className="btn-ghost py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                        Previous
                      </button>
                    )}
                    {intakesPage < intakesTotalPages ? (
                      <Link href={intakePageHref(intakesPage + 1)} className="btn-ghost py-1.5 text-xs">
                        Next
                      </Link>
                    ) : (
                      <button type="button" disabled className="btn-ghost py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                        Next
                      </button>
                    )}
                  </div>
                </div>
              )}
          </div>
        </section>
      )}

      {/* Stock out — money in, stock down. */}
      <section className="page-band" id="dealer-orders">
        <BandHeading
          arrow="out"
          title="Stock out"
          sub="sold to dealers"
          facts={
            isFinance
              ? [
                  `${orders.length} order${orders.length === 1 ? '' : 's'}`,
                  `${formatMYR(totalOrderRevenue)} collected`,
                  `${totalSold.toLocaleString()} cards at ${formatMYR(SIM_SELL_PRICE_RM)} each`,
                  `${formatMYR(totalShipping)} paid to ship`,
                  `margin ${formatMYR(totalOrderMargin)} after shipping`,
                ]
              : [`${orders.length} order${orders.length === 1 ? '' : 's'}`, `${totalSold.toLocaleString()} cards`]
          }
        />
        <div className="band-log min-w-0">
            {orders.length ? (
              <DealerOrdersTable
                orders={pagedOrders.map((o) => {
                  const dealerRel = Array.isArray(o.dealers) ? o.dealers[0] : o.dealers
                  const dealerName = dealerRel?.company_name ?? dealerNameById.get(o.dealer_id) ?? '—'
                  const paid = o.quantity * Number(o.unit_price_rm)
                  // Net of what it cost to ship — see totalOrderMargin above.
                  const margin = isFinance
                    ? o.quantity * (Number(o.unit_price_rm) - Number(o.unit_cost_rm ?? 0)) - Number(o.shipping_fee_rm ?? 0)
                    : 0
                  return {
                    id: o.id,
                    order_date: o.order_date,
                    dealerName,
                    sim_type: o.sim_type,
                    quantity: o.quantity,
                    paid,
                    margin,
                    shipping_fee_rm: o.shipping_fee_rm,
                    shipping_invoice_path: o.shipping_invoice_path,
                    esim_codes: o.esim_codes,
                    delivery_status: o.delivery_status,
                  }
                })}
                isFinance={isFinance}
                canMarkSent={user.role === 'cs' || user.role === 'master'}
              />
            ) : (
              <p className="text-sm text-paper-dim">No orders recorded yet.</p>
            )}
            {ordersTotalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
                <span className="text-[12px] text-paper-dim">
                  Page {ordersPage} of {ordersTotalPages}
                </span>
                <div className="flex items-center gap-2">
                  {ordersPage > 1 ? (
                    <Link href={ordersPageHref(ordersPage - 1)} className="btn-ghost py-1.5 text-xs">
                      Previous
                    </Link>
                  ) : (
                    <button type="button" disabled className="btn-ghost py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                      Previous
                    </button>
                  )}
                  {ordersPage < ordersTotalPages ? (
                    <Link href={ordersPageHref(ordersPage + 1)} className="btn-ghost py-1.5 text-xs">
                      Next
                    </Link>
                  ) : (
                    <button type="button" disabled className="btn-ghost py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                      Next
                    </button>
                  )}
                </div>
              </div>
            )}
        </div>
      </section>
    </div>
  )
}
