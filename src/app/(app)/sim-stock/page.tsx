import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import {
  SIM_BOX_SIZE,
  SIM_SELL_PRICE_RM,
  SIM_STOCK_TYPES,
  SIM_TYPE_LABEL,
  SIM_UNIT_COST_RM,
  cardsOwedByDealer,
  type SimStockType,
} from '@/lib/sim-stock'
import { DealerOrdersTable } from './dealer-orders-table'
import { StockIntakeTable } from './stock-intake-table'
import { PageHeader } from '../page-header'
import { Pagination } from '../pagination'
import { allRows } from '@/lib/fetch-all'
import { ScrollFade } from '../scroll-fade'
import { BandHeading } from './elements'
import { formatMYR } from '@/lib/money'

export const metadata: Metadata = {
  title: 'SIM Card Stock — Vibe456',
}

type IntakeRow = {
  id: string
  intake_date: string
  sim_type: SimStockType
  quantity: number
  cost_per_unit_rm: number
  note: string | null
  recorded_by: string
  adjusts_id: string | null
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
  delivery_status: 'pending' | 'sent' | 'na'
  adjusts_id: string | null
  note: string | null
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
    // Every order, paged: the totals and the shelf reckoning below are added up from these rows,
    // and one request stops at 1,000 without an error. Newest first, id as the tiebreaker so the
    // pages cannot repeat or skip a row.
    isFinance
      ? allRows((from, to) =>
          supabase
            .from('sim_orders')
            .select(
              'id, dealer_id, order_date, sim_type, quantity, unit_price_rm, unit_cost_rm, shipping_fee_rm, shipping_invoice_path, esim_codes, delivery_status, adjusts_id, note, recorded_by, delivered_by, dealers(company_name)'
            )
            .order('order_date', { ascending: false })
            .order('id')
            .range(from, to),
        )
      : allRows((from, to) =>
          supabase
            .from('sim_orders_directory')
            .select('id, dealer_id, order_date, sim_type, quantity, unit_price_rm, shipping_fee_rm, shipping_invoice_path, esim_codes, delivery_status, adjusts_id, note, recorded_by, delivered_by')
            .order('order_date', { ascending: false })
            .order('id')
            .range(from, to),
        ),
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
    const { data } = await allRows((from, to) =>
      supabase
        .from('sim_stock_intakes')
        .select('id, intake_date, sim_type, quantity, cost_per_unit_rm, note, recorded_by, adjusts_id')
        .order('intake_date', { ascending: false })
        .order('id')
        .range(from, to),
    )
    intakes = (data as IntakeRow[] | null) ?? []
  }

  // Package sales carry a card entitlement (20/40/100 by package). Read only
  // for finance — cs has no SELECT on `transactions` at all, so asking as cs
  // would return an empty list and produce a confident "nothing owed".
  let packageSales: { dealer_id: string; package: string | null; quantity: number | null }[] = []
  if (isFinance) {
    // All-time package sales, paged (see the orders read above).
    const { data } = await allRows((from, to) =>
      supabase.from('transactions').select('dealer_id, package, quantity').eq('type', 'package').neq('status', 'flagged').order('id').range(from, to),
    )
    packageSales = data ?? []
  }
  const cardsOwed = cardsOwedByDealer(packageSales, orders)
  const owedDealerCount = [...cardsOwed.byDealer.values()].filter((r) => r.owed > 0).length

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

  // What is genuinely sellable, which is not what this page used to print.
  //
  // `available` is already net of every order raised — see the note above. The
  // commitment it does NOT know about is the card entitlement inside a package
  // a dealer has already paid for and never collected: 2,275 cards against 805
  // on the shelf on the seeded month. The page called that 805 "Available to
  // sell" and put the debt three lines below in small brass text, so the
  // headline and the warning contradicted each other and the headline won.
  //
  // Shopify's definitions are the ones this now follows: "Available" is
  // "inventory that you can sell. Available inventory isn't committed to any
  // orders", and on hand is the sum of committed and available. By that rule
  // 805 was on hand, not available.
  //
  // Finance only, and deliberately: cs has no SELECT on `transactions`, so
  // packageSales is empty for them and the shortfall would silently compute as
  // a comfortable surplus. A figure that lies to one role is worse than one
  // they never see — so cs keeps the plain shelf count.
  const cardsShort = totalAvailable - cardsOwed.totalOwed
  const showShortfall = isFinance && cardsOwed.totalOwed > 0

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

  // Each pager keeps the other list's page, so turning one never resets the other.
  function listHref(orders: number, intake: number, hash: string) {
    const params = new URLSearchParams()
    if (orders > 1) params.set('orders_page', String(orders))
    if (intake > 1) params.set('intake_page', String(intake))
    const qs = params.toString()
    return `/sim-stock${qs ? `?${qs}` : ''}#${hash}`
  }
  const ordersPageHref = (p: number) => listHref(p, intakesPage, 'dealer-orders')
  const intakePageHref = (p: number) => listHref(ordersPage, p, 'stock-intake-history')

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
        action={{ href: '/sim-stock/log', label: 'Log SIM Stock' }}
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
        <div>
          <p className="text-[12px] text-paper-dim">
            {showShortfall ? (cardsShort < 0 ? 'Short by' : 'Available to sell') : 'On the shelf'}
          </p>
          {/* One figure. It used to be four: this one at 38px and the three
              pools at 22px directly beneath a rule — and 625 + 0 + 180 is
              exactly this number, so the card stated the same fact twice at
              two sizes and neither read as the answer. The pools moved into
              the table below, where they are a decomposition rather than
              three rivals. */}
          <p
            className={`tnum mt-1.5 text-[38px] font-semibold leading-none tracking-[-.03em] ${
              showShortfall && cardsShort < 0 ? 'text-clay-bright' : 'text-paper'
            }`}
          >
            {showShortfall ? Math.abs(cardsShort).toLocaleString() : totalAvailable.toLocaleString()}
            <span className="ml-2 text-[20px] font-semibold">cards</span>
          </p>
          {showShortfall ? (
            <p className="mt-2.5 text-[13px] text-paper-dim">
              <b className="figure font-semibold text-paper">{totalAvailable.toLocaleString()}</b> on the shelf{' '}
              {cardsShort < 0 ? '−' : 'against'}{' '}
              <b className="figure font-semibold text-paper">{cardsOwed.totalOwed.toLocaleString()}</b> owed to {owedDealerCount} dealer
              {owedDealerCount === 1 ? '' : 's'} on packages they have already paid for.
            </p>
          ) : (
            <p className="mt-2.5 text-[13px] text-paper-dim">
              of {totalBought.toLocaleString()} bought from Vibe Mobile · {sentQty.toLocaleString()} sent ·{' '}
              {pendingQty.toLocaleString()} sold and still to send
            </p>
          )}
        </div>

        {/* The next action, beside the reason for it. It was a red sentence
            with nothing to press, four hundred pixels above the button that
            answers it. */}
        {emptyPool && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 pt-4">
            <p className="text-[13px] text-clay-bright">
              {balances
                .filter((b) => b.available <= 0)
                .map((b) => SIM_TYPE_LABEL[b.sim_type])
                .join(' and ')}{' '}
              {balances.filter((b) => b.available <= 0).length === 1 ? 'has' : 'have'} none left — an order for that type cannot be taken.
            </p>
            {isFinance && (
              <Link href="/sim-stock/log" className="btn-ghost shrink-0 px-3 py-1.5 text-xs">
                Log a stock intake
              </Link>
            )}
          </div>
        )}
      </section>

      {/* The pools, as rows. Three columns of big figures could hold three
          pools and no more — a fourth SIM type would have forced the row to
          re-wrap. Rows grow downward, so it takes a fourth type without the
          layout changing at all, and it can carry the sent/to-send split that
          previously needed a separate legend and a bar beside the headline. */}
      <section className="page-band">
        <BandHeading
          title="On the shelf, by pool"
          sub="an order can only draw from its own type"
          facts={
            showShortfall
              ? [`the ${cardsOwed.totalOwed.toLocaleString()} owed on packages are not split by type — a package says how many cards, not which kind`]
              : undefined
          }
        />
        {/* ScrollFade, not a bare overflow-x-auto div. axe caught the first
            version at 390px: scrollable-region-focusable — a scroller with no
            tabIndex cannot be reached or moved by keyboard. This component
            already solves it the way every other table on the page does, and
            only applies role/tabIndex when the content genuinely overflows. */}
        {/* 51px rows, not the h-12 this started as. The two logs further
            down are CSS grids built on lib/log-columns.ts and measure 51px a
            row; a 48px table above them put three row heights on one page,
            which is the same "tables on one page must align" rule that was
            already applied to Stock in and Stock out. An arbitrary value
            rather than a scale step because it is matching a measurement,
            not choosing one. */}
        <ScrollFade label="SIM card stock by pool" className="band-log min-w-0">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="th">Pool</th>
                <th className="th text-right">Bought</th>
                <th className="th text-right">Sold</th>
                <th className="th text-right">Sent</th>
                <th className="th text-right">To send</th>
                <th className="th text-right">On shelf</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.sim_type} className="tr-row h-[51px]">
                  <td className="td font-semibold text-paper">{SIM_TYPE_LABEL[b.sim_type]}</td>
                  <td className="td figure text-right text-paper-dim">{b.total_intake.toLocaleString()}</td>
                  <td className="td figure text-right text-paper-dim">{b.total_sold.toLocaleString()}</td>
                  <td className="td figure text-right text-paper-dim">{qtyBy(b.sim_type, 'sent').toLocaleString()}</td>
                  <td className="td figure text-right text-paper-dim">{qtyBy(b.sim_type, 'pending').toLocaleString()}</td>
                  <td
                    className={`td figure text-right font-semibold ${
                      b.available <= 0 ? 'text-clay-bright' : b.available < SIM_BOX_SIZE ? 'text-brass-bright' : 'text-paper'
                    }`}
                  >
                    {b.available.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="h-[51px] border-t border-ink-800">
                <td className="td font-semibold text-paper">All pools</td>
                <td className="td figure text-right font-semibold text-paper">{totalBought.toLocaleString()}</td>
                <td className="td figure text-right font-semibold text-paper">{totalSold.toLocaleString()}</td>
                <td className="td figure text-right font-semibold text-paper">{sentQty.toLocaleString()}</td>
                <td className="td figure text-right font-semibold text-paper">{pendingQty.toLocaleString()}</td>
                <td className="td figure text-right font-semibold text-paper">{totalAvailable.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </ScrollFade>
      </section>

      {/* Stock in — money out, stock up. */}
      {isFinance && (
        <section className="page-band" id="stock-intake-history">
          <BandHeading
            arrow="in"
            title="Stock in"
            sub="bought from Vibe Mobile"
            /* The unit economics used to run along the summary card as one
               sentence carrying six money figures — in price, out price,
               margin each, total spent, still unsold, margin after shipping.
               Three of the six were already on this heading and the other
               three on Stock out's. They now sit with the side they belong
               to: what was spent is a buying fact, what was made is a
               selling one. */
            facts={[
              `${intakes.length} intake${intakes.length === 1 ? '' : 's'}`,
              `${totalBought.toLocaleString()} cards at ${formatMYR(SIM_UNIT_COST_RM)} each`,
              `${formatMYR(totalIntakeCost)} spent`,
              `${formatMYR(totalIntakeCost - soldAtCost)} of it still on the shelf`,
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
                    isCorrection: r.adjusts_id != null,
                  }))}
                />
              ) : (
                <p className="text-sm text-paper-dim">No stock intake recorded yet.</p>
              )}
              <Pagination page={intakesPage} totalPages={intakesTotalPages} hrefFor={intakePageHref} param="intake_page" />
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
                    isCorrection: o.adjusts_id != null,
                    note: o.note,
                  }
                })}
                isFinance={isFinance}
                canMarkSent={user.role === 'cs' || user.role === 'master'}
                canAdjust={isFinance}
              />
            ) : (
              <p className="text-sm text-paper-dim">No orders recorded yet.</p>
            )}
            <Pagination page={ordersPage} totalPages={ordersTotalPages} hrefFor={ordersPageHref} param="orders_page" />
        </div>
      </section>
    </div>
  )
}
