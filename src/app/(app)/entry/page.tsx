import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { getAvailablePointsBalance } from '@/lib/credit-balance'
import { todayInMalaysia } from '@/lib/month'
import { EntryForm, type LastTxInfo } from './entry-form'
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
    supabase.from('dealers').select('id, company_name, package, rate').order('company_name', { ascending: true }),
    supabase.from('transactions').select('dealer_id, type, package, points, money_rm').order('created_at', { ascending: false }).limit(500),
    getAvailablePointsBalance(supabase),
  ])

  // Staff record for the same handful of dealers day to day — surface the
  // ones they most recently transacted with (any accountant/master, not just
  // this user) as one-click shortcuts instead of scrolling the full list.
  const dealerNameById = new Map((dealers ?? []).map((d) => [d.id, d.company_name]))
  const lastTxByDealer: Record<string, LastTxInfo> = {}
  const recentDealerIds: string[] = []
  for (const t of recentTxRows ?? []) {
    if (!lastTxByDealer[t.dealer_id]) {
      lastTxByDealer[t.dealer_id] = { type: t.type, package: t.package, points: Number(t.points), money_rm: Number(t.money_rm) }
      recentDealerIds.push(t.dealer_id)
    }
  }
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
