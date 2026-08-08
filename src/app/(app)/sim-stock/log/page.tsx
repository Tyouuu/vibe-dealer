import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { todayInMalaysia } from '@/lib/month'
import { PageHeader } from '../../page-header'
import { IntakeForm } from '../intake-form'
import { OrderForm } from '../order-form'
import { SIM_BOX_SIZE, SIM_MIN_ORDER_QTY, SIM_SELL_PRICE_RM, SIM_STOCK_TYPES, SIM_UNIT_COST_RM, type SimStockType } from '@/lib/sim-stock'
import { formatMYR } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Log SIM Stock — Vibe456',
}

type BalanceRow = { sim_type: SimStockType; available: number }

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

// Both SIM movements on one page, in one card, built the way Onboard Dealer
// is: sections separated by a rule, each with a heading, one line saying what
// it does, its fields on the 12-column grid, and its action on the rule that
// closes it.
//
// One page rather than two. They are the same job seen from two directions —
// stock coming in from Vibe, stock going out to a dealer — and the parent
// page already names them exactly that way in its two bands. Two routes for
// that would have put two entries in the sidebar for one idea.
//
// Two <form> elements inside one card, not one form with two submits: they
// post to different server actions and either can be used without the other.
// Sibling forms are fine; nesting them would not be.
//
// The two movements have different owners, and this page has to say so. Stock
// in is a finance act (it books what was paid to Vibe); stock out is an ops
// act (it draws down a pool and joins the delivery queue) — recordSimIntake
// and createSimOrder have always disagreed about who may call them. When both
// forms lived on /sim-stock that was invisible, because that page admits all
// three roles. Moving them here behind one accountant/master gate broke it in
// both directions: cs lost the only place a SIM order could be placed, and
// accountant got a Place order form that always answered "you do not have
// permission". So the gate is now the union, and each block renders only for
// the role that can actually submit it.
export default async function LogSimStockPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error } = await searchParams

  const canLogIntake = user.role === 'accountant' || user.role === 'master'
  const canPlaceOrder = user.role === 'cs' || user.role === 'master'

  if (!canLogIntake && !canPlaceOrder) {
    return <PermissionDenied role={user.role} action="log SIM stock" />
  }

  const supabase = await createClient()
  const [{ data: balanceRows }, { data: dealers }] = await Promise.all([
    supabase.from('sim_stock_balance').select('sim_type, available'),
    supabase.from('dealers_directory').select('id, company_name, address').order('company_name', { ascending: true }),
  ])

  const byType = new Map(((balanceRows as BalanceRow[] | null) ?? []).map((b) => [b.sim_type, b.available]))
  const availableByType = Object.fromEntries(SIM_STOCK_TYPES.map((t) => [t, byType.get(t) ?? 0])) as Record<SimStockType, number>
  const dealerList = (dealers ?? []) as { id: string; company_name: string; address: string | null }[]

  // Says what this page holds for whoever opened it, rather than naming a
  // movement they will not find below.
  const subtitle =
    canLogIntake && canPlaceOrder
      ? 'A box arriving from Vibe Mobile, or an order going out to a dealer. Both land on SIM Card Stock.'
      : canLogIntake
        ? 'A box arriving from Vibe Mobile. It lands on SIM Card Stock.'
        : 'An order going out to a dealer. It lands on SIM Card Stock.'

  return (
    <div className="w-full">
      <PageHeader title="Log SIM Stock" subtitle={subtitle} />

      {error && <div className="alert alert-bad">{error}</div>}

      <div className="app-card mt-6 flex flex-col gap-6">
        {canLogIntake && (
          <div className="form-block">
            <h2 className="form-block-title">Stock in — bought from Vibe Mobile</h2>
            <p className="form-block-desc">
              A box of {SIM_BOX_SIZE} at {formatMYR(SIM_UNIT_COST_RM)} a card. It adds to whichever pool you pick — the three cannot borrow
              from each other.
            </p>
            <IntakeForm today={todayInMalaysia()} />
          </div>
        )}

        {canPlaceOrder && (
          <div className="form-block">
            <h2 className="form-block-title">Stock out — sold to a dealer</h2>
            <p className="form-block-desc">
              {formatMYR(SIM_SELL_PRICE_RM)} a card, minimum {SIM_MIN_ORDER_QTY}, drawn from the pool you pick. A physical order also joins
              the SIM Delivery queue; an eSIM order does not.
            </p>
            <OrderForm
              today={todayInMalaysia()}
              dealers={dealerList.map((d) => ({ id: d.id, company_name: d.company_name, address: d.address }))}
              availableByType={availableByType}
            />
          </div>
        )}
      </div>
    </div>
  )
}
