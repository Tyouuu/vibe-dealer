import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '../../page-header'
import { OrderForm } from '../order-form'
import { SIM_MIN_ORDER_QTY, SIM_SELL_PRICE_RM, SIM_STOCK_TYPES, type SimStockType } from '@/lib/sim-stock'
import { formatMYR } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Place an order — DealerHub',
}

type BalanceRow = { sim_type: SimStockType; available: number }

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

// Selling cards to a dealer gets its own page. See purchases/new for why.
//
// The form carries the pool balances itself — "965 Physical SIM (With Number)
// in stock right now" under the quantity field — so nothing is lost by not
// having the three pools visible above it. That line is what the reader
// actually needs while typing a quantity, and it is more precise than
// glancing up at a summary.
export default async function PlaceOrderPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="place SIM orders" />
  }

  const supabase = await createClient()
  const [{ data: balanceRows }, { data: dealers }] = await Promise.all([
    supabase.from('sim_stock_balance').select('sim_type, available'),
    supabase.from('dealers_directory').select('id, company_name, address').order('company_name', { ascending: true }),
  ])

  const byType = new Map(((balanceRows as BalanceRow[] | null) ?? []).map((b) => [b.sim_type, b.available]))
  const availableByType = Object.fromEntries(SIM_STOCK_TYPES.map((t) => [t, byType.get(t) ?? 0])) as Record<SimStockType, number>
  const dealerList = (dealers ?? []) as { id: string; company_name: string; address: string | null }[]

  return (
    <div className="flex w-full flex-col">
      <PageHeader
        title="Place an order"
        subtitle={`Draws from the pool you pick, at ${formatMYR(SIM_SELL_PRICE_RM)} per card with a minimum of ${SIM_MIN_ORDER_QTY}.`}
        action={
          <Link href="/sim-stock" className="btn-ghost shrink-0">
            Back to SIM Card Stock
          </Link>
        }
      />

      {error && <div className="alert alert-bad">{error}</div>}

      <div className="app-card mt-4">
        <OrderForm
          dealers={dealerList.map((d) => ({ id: d.id, company_name: d.company_name, address: d.address }))}
          availableByType={availableByType}
        />
      </div>
    </div>
  )
}
