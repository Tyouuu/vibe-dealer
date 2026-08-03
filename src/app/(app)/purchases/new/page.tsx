import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../../permission-denied'
import { todayInMalaysia } from '@/lib/month'
import { createClient } from '@/lib/supabase/server'
import { getAvailablePointsBalance } from '@/lib/credit-balance'
import { CREDIT_PURCHASE_RATE } from '@/lib/packages'
import { PageHeader } from '../../page-header'
import { ScrollFade } from '../../scroll-fade'
import { PurchaseForm } from '../purchase-form'
import { formatMYR } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Log purchase — DealerHub',
}

type PurchaseRow = {
  id: string
  purchase_date: string
  money_rm: number | string
  points: number | string
  note: string | null
  recorded_by: string
}

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

// Logging a purchase gets its own page and its own sidebar entry, the way
// onboarding a dealer and logging SIM stock already do.
//
// The purchases themselves are listed here rather than on Credit Purchases.
// That page now shows a full credit ledger — every movement in and out — and
// purchases are a handful of rows among dozens of sales in it, so "when did
// I buy, and what did I pay" became hard to find at exactly the moment the
// ledger made everything else easier. Here they are the only thing in the
// list, next to the form that creates them.
export default async function NewPurchasePage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="log credit purchases" />
  }

  const supabase = await createClient()
  const [creditBalance, { data: purchaseRows }, { data: profiles }] = await Promise.all([
    // The form prints where this purchase lands the balance, so it needs the
    // one it is landing on — the same aggregate the sale hard-block uses.
    getAvailablePointsBalance(supabase),
    supabase.from('credit_purchases').select('id, purchase_date, money_rm, points, note, recorded_by').order('purchase_date', { ascending: false }),
    supabase.from('profiles').select('id, name, email'),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name ?? p.email ?? '—']))
  const rows = (purchaseRows ?? []) as PurchaseRow[]
  const totalPaid = rows.reduce((s, p) => s + Number(p.money_rm), 0)
  const totalPoints = rows.reduce((s, p) => s + Number(p.points), 0)
  // What a point should cost: face value less the 8% Vibe gives master.
  const usualRate = 1 - CREDIT_PURCHASE_RATE

  return (
    <div className="flex w-full flex-col">
      <PageHeader
        title="Log purchase"
        subtitle="A batch of credit bought from Vibe Mobile. It adds to the balance every dealer sale is checked against."
      />

      {error && <div className="alert alert-bad">{error}</div>}

      <div className="app-card mt-6">
        <PurchaseForm today={todayInMalaysia()} balance={creditBalance.available} />
      </div>

      {/* The list is the page's second half — no card. See .index-surface.
          Cost a point is computed per row rather than stored: it is the check
          that catches a batch entered at the dealer price (RM 0.94) instead
          of what Vibe charges (RM 0.92), which is exactly what happened to
          the seeded row. */}
      <div className="index-surface">
        <div className="index-filterbar">
          <div>
            <h2 className="text-sm font-semibold text-paper">Purchases so far</h2>
            <p className="mt-0.5 text-[12px] text-paper-dim">
              {rows.length
                ? `${rows.length} batch${rows.length === 1 ? '' : 'es'} · ${totalPoints.toLocaleString()} pts for ${formatMYR(totalPaid)}`
                : 'Nothing logged yet.'}
            </p>
          </div>
        </div>
        {rows.length ? (
          <ScrollFade label="Credit purchases">
            <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
                <col className="w-[22%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th text-right">Paid (RM)</th>
                  <th className="th text-right">Points</th>
                  <th className="th text-right">Cost a point</th>
                  <th className="th">Note</th>
                  <th className="th">Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const points = Number(p.points)
                  const rate = points > 0 ? Number(p.money_rm) / points : 0
                  const offRate = points > 0 && Math.abs(rate - usualRate) > 0.005
                  return (
                    <tr key={p.id} className="tr-row h-14">
                      <td className="td whitespace-nowrap text-paper-dim">{p.purchase_date}</td>
                      <td className="td figure-money whitespace-nowrap text-right">{formatMYR(Number(p.money_rm))}</td>
                      <td className="td figure-points whitespace-nowrap text-right">{points.toLocaleString()}</td>
                      <td className="td figure-money whitespace-nowrap text-right" style={offRate ? { color: 'var(--color-brass-bright)' } : undefined}>
                        {formatMYR(rate)}
                        {offRate && <span className="ml-1.5 text-[11px] font-semibold">not {formatMYR(usualRate)}</span>}
                      </td>
                      <td className="td truncate text-paper-dim" title={p.note ?? undefined}>
                        {p.note ?? '—'}
                      </td>
                      <td className="td truncate text-paper-dim">{nameById.get(p.recorded_by) ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollFade>
        ) : (
          <p className="py-8 text-center text-sm text-paper-dim">
            Log your past batches with their real dates so the running balance on Credit Purchases is accurate.
          </p>
        )}
      </div>
    </div>
  )
}
