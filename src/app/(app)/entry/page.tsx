import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { getAvailablePointsBalance } from '@/lib/credit-balance'
import { todayInMalaysia } from '@/lib/month'
import { EntryForm } from './entry-form'
import { buildLastSales } from '@/lib/last-sale'
import { PageHeader } from '../page-header'

export const metadata: Metadata = {
  title: 'New Transaction — Vibe456',
}

type PageProps = {
  searchParams: Promise<{ error?: string; dealer?: string }>
}

export default async function EntryPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error, dealer } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="enter transactions" />
  }

  const supabase = await createClient()
  const [{ data: dealers }, { data: recentTxRows }, balance] = await Promise.all([
    // Active only. dealers.status has existed since the first migration with a
    // check constraint allowing 'inactive', and nothing has ever honoured it:
    // an inactive dealer was offered in this picker like any other, and the
    // action behind it did not look either. The column read as a switch that
    // turned nothing off — the same shape as the hole 0038 closed, waiting for
    // the first shop to close.
    supabase.from('dealers').select('id, company_name, package, rate').eq('status', 'active').order('company_name', { ascending: true }),
    supabase.from('transactions').select('dealer_id, type, package, points, money_rm').neq('type', 'adjustment').order('created_at', { ascending: false }).limit(500),
    getAvailablePointsBalance(supabase),
  ])

  // Staff record for the same handful of dealers day to day — surface the
  // ones they most recently sold to (any accountant/master, not just this
  // user) as one-click shortcuts instead of scrolling the full list.
  //
  // Sold to, not transacted with. This loop used to keep the first row of any
  // type per dealer, which let a correction be remembered as the last sale —
  // see lib/last-sale.ts for what that did to the form.
  const dealerNameById = new Map((dealers ?? []).map((d) => [d.id, d.company_name]))
  const { byDealer: lastTxByDealer, recentIds: recentDealerIds } = buildLastSales(recentTxRows ?? [])
  const recentDealers = recentDealerIds
    .slice(0, 6)
    .map((id) => ({ id, company_name: dealerNameById.get(id) ?? '—' }))
    .filter((d) => d.company_name !== '—')

  return (
    <>
      {/* The title lived inside the form's card as a bare <h1>, so this page
          had no header on the page surface the way every other one does.
          The subtitle carries the two rules that actually govern this form:
          nothing counts until it's verified, and the credit balance is a hard
          stop rather than a warning — the insert is refused outright if it
          would oversell. */}
      <PageHeader
        title="New Transaction"
        subtitle={`Saves as pending until someone verifies it. ${balance.available.toLocaleString()} pts of credit available — a sale that would go past it is refused, not warned about.`}
      />
      {error && <div className="alert alert-bad">{error}</div>}
      <EntryForm
        dealers={dealers ?? []}
        initialDealerId={dealer}
        recentDealers={recentDealers}
        lastTxByDealer={lastTxByDealer}
        availableBalance={balance.available}
        today={todayInMalaysia()}
      />
    </>
  )
}
