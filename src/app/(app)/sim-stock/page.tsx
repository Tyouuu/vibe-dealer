import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { SIM_BOX_SIZE, SIM_MARGIN_RM, SIM_SELL_PRICE_RM, SIM_UNIT_COST_RM, SIM_STOCK_TYPES, SIM_TYPE_LABEL, SIM_TYPE_PILL_CLASS, isPhysicalSimType, type SimStockType } from '@/lib/sim-stock'
import { ConfirmSubmitButton } from '../confirm-submit-button'
import { markSimOrderSent } from './actions'
import { OrderForm } from './order-form'
import { IntakeForm } from './intake-form'

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

type PageProps = {
  searchParams: Promise<{ error?: string; intake_saved?: string; order_saved?: string }>
}

export default async function SimStockPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error, intake_saved, order_saved } = await searchParams
  const isFinance = user.role === 'accountant' || user.role === 'master'

  if (user.role !== 'cs' && !isFinance) {
    return <div className="app-card text-sm text-paper-dim">Your role ({user.role}) does not have permission to view SIM stock.</div>
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

  return (
    <div className="flex flex-col gap-5">
      <div className="app-card">
        <h1 className="mb-1 text-[26px] font-extrabold tracking-tight text-paper">SIM Card Stock</h1>
        <p className="mb-4 text-[12.5px] text-paper-dim">
          SIM cards — physical, eSIM, or eSIM with no number — bought from Vibe Mobile in bulk (a box is {SIM_BOX_SIZE}),
          resold to dealers in batches. Same system across all three, each its own stock pool; only physical has a
          real shipment. Kept separate from the points/topup ledger — this is a flat per-card margin, not a %-rate
          commission.
        </p>

        {error && <div className="alert alert-bad">{error}</div>}
        {intake_saved && <div className="alert alert-ok">Stock intake recorded.</div>}
        {order_saved && <div className="alert alert-ok">Order recorded.</div>}

        <div className="grid gap-3 sm:grid-cols-3">
          {balances.map((b) => (
            <div key={b.sim_type} className="rounded-2xl border border-ink-800 p-4">
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-paper-dim">{SIM_TYPE_LABEL[b.sim_type]}</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10.5px] font-semibold text-paper-dim">Available</div>
                  <div className={`mt-1 text-lg font-semibold ${b.available <= 0 ? 'text-clay-bright' : ''}`}>{b.available.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-semibold text-paper-dim">Bought In</div>
                  <div className="mt-1 text-lg font-semibold text-paper">{b.total_intake.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-semibold text-paper-dim">Sold Out</div>
                  <div className="mt-1 text-lg font-semibold text-paper">{b.total_sold.toLocaleString()}</div>
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
        <div className="app-card">
          <h3 className="mb-3.5 text-sm font-bold text-paper">Dealer Orders</h3>
          {orders.length ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Dealer</th>
                    <th className="th">Type</th>
                    <th className="th text-right">Qty</th>
                    <th className="th text-right">Paid (RM)</th>
                    {isFinance && <th className="th text-right">Margin (RM)</th>}
                    <th className="th text-right">Shipping</th>
                    <th className="th">Invoice / Codes</th>
                    <th className="th">Status</th>
                    <th className="th">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const dealerRel = Array.isArray(o.dealers) ? o.dealers[0] : o.dealers
                    const dealerName = dealerRel?.company_name ?? dealerNameById.get(o.dealer_id) ?? '—'
                    const paid = o.quantity * Number(o.unit_price_rm)
                    const margin = isFinance ? o.quantity * (Number(o.unit_price_rm) - Number(o.unit_cost_rm ?? 0)) : 0
                    return (
                      <tr key={o.id} className="tr-row">
                        <td className="td text-paper-dim">{o.order_date}</td>
                        <td className="td font-semibold text-paper">{dealerName}</td>
                        <td className="td">
                          <span className={`pill ${SIM_TYPE_PILL_CLASS[o.sim_type]}`}>{SIM_TYPE_LABEL[o.sim_type]}</span>
                        </td>
                        <td className="td text-right">{o.quantity.toLocaleString()}</td>
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
                            <span className="max-w-[160px] truncate text-paper-dim" title={o.esim_codes}>
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
        </div>

        <div className="app-card">
          <h3 className="mb-3.5 text-sm font-bold text-paper">New Order</h3>
          <OrderForm
            dealers={dealerList.map((d) => ({ id: d.id, company_name: d.company_name, address: d.address }))}
            availableByType={availableByType}
          />
        </div>
      </div>

      {isFinance && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="app-card">
            <h3 className="mb-3.5 text-sm font-bold text-paper">Stock Intake History</h3>
            {intakes.length ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Type</th>
                      <th className="th text-right">Qty</th>
                      <th className="th text-right">Cost/Unit</th>
                      <th className="th text-right">Total Cost</th>
                      <th className="th">Note</th>
                      <th className="th">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intakes.map((r) => (
                      <tr key={r.id} className="tr-row">
                        <td className="td text-paper-dim">{r.intake_date}</td>
                        <td className="td">
                          <span className={`pill ${SIM_TYPE_PILL_CLASS[r.sim_type]}`}>{SIM_TYPE_LABEL[r.sim_type]}</span>
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
