import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { COMMISSION_RATE } from '@/lib/packages'
import { getAvailablePointsBalance, LOW_BALANCE_THRESHOLD } from '@/lib/credit-balance'
import { todayInMalaysia } from '@/lib/month'
import { PurchaseForm } from './purchase-form'
import { ScrollFade } from '../scroll-fade'
import { PageHeader } from '../page-header'
import { HeroCard } from '../hero-card'
import { formatMYR, formatPoints } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Credit Purchases — DealerHub',
}

const PAGE_SIZE = 50

type PurchaseRow = {
  id: string
  purchase_date: string
  money_rm: number
  points: number
  note: string | null
  recorded_by: string
}

type PageProps = {
  searchParams: Promise<{ error?: string; saved?: string; page?: string }>
}

export default async function PurchasesPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error, saved, page } = await searchParams
  const pageNum = Math.max(1, Math.trunc(Number(page)) || 1)

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="view credit purchases" />
  }

  const today = todayInMalaysia()
  const supabase = await createClient()
  const [{ data: allPurchases }, { data: pagedPurchases, count }, { data: verifiedRows }, { data: profiles }, creditBalance] = await Promise.all([
    // Separate from the paged query below — Total Bought/Total Cost Paid/
    // Cash Margin are real sums over every row ever logged, not just
    // whichever page happens to be showing (same split Records/Dealers use
    // between their own page-scoped rows and page-independent counts).
    supabase.from('credit_purchases').select('money_rm, points'),
    supabase
      .from('credit_purchases')
      .select('id, purchase_date, money_rm, points, note, recorded_by', { count: 'exact' })
      .order('purchase_date', { ascending: false })
      .range((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE - 1),
    // Cash Margin below is a settled-accounting comparison (same "only
    // verified counts as real money" convention as Reports/Dashboard/
    // Reconcile) — deliberately different scope from the Balance tile, which
    // uses getAvailablePointsBalance (pending+verified) to match the New
    // Transaction hard-block's stock-reservation logic.
    supabase.from('transactions').select('points, money_rm').eq('status', 'verified'),
    supabase.from('profiles').select('id, name, email'),
    getAvailablePointsBalance(supabase),
  ])

  const rows = (pagedPurchases as PurchaseRow[] | null) ?? []
  const totalPurchasedPoints = (allPurchases ?? []).reduce((s, p) => s + Number(p.points), 0)
  const totalPurchasedCost = (allPurchases ?? []).reduce((s, p) => s + Number(p.money_rm), 0)

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const totalSoldPoints = (verifiedRows ?? []).reduce((s, t) => s + Number(t.points), 0)
  const totalDealerRevenue = (verifiedRows ?? []).reduce((s, t) => s + Number(t.money_rm), 0)

  const balance = creditBalance.available
  const expectedCommission = Math.round(totalSoldPoints * COMMISSION_RATE * 100) / 100
  const actualCashMargin = Math.round((totalDealerRevenue - totalPurchasedCost) * 100) / 100

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name ?? p.email ?? '—']))

  function pageHref(p: number) {
    return `/purchases${p > 1 ? `?page=${p}` : ''}`
  }

  return (
    <>
      {/* Header on the page surface, not nested inside the left card. A page
          title inside a box reads as a section heading — the same thing SIM
          Card Stock was doing. */}
      <PageHeader
        title="Credit Purchases"
        subtitle="What we pay Vibe Mobile for points, before any of it is resold to dealers."
      />
      <div className="mt-5 grid grid-cols-1 gap-5 lg:items-start lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="app-card">

        {saved && <div className="alert alert-ok">Purchase recorded.</div>}

        {/* Was four equal tiles. Only two of them are decisions — "how much
            can I still sell" (Balance) and "am I ahead or behind" (Cash
            margin). Total Bought and Total Cost Paid are reference figures:
            useful for context, never the reason anyone opens this page. They
            keep their place but not their weight.

            Balance leads because it is the one that stops work: the New
            Transaction form hard-blocks a sale that would oversell it. */}
        <div className="mt-4">
          <HeroCard
            label="Credit balance"
            value={`${balance.toLocaleString()} pts`}
            chgSuffix={
              balance <= 0
                ? 'out of credit — log a purchase before the next sale'
                : balance < LOW_BALANCE_THRESHOLD
                  ? 'running low — log a purchase soon'
                  : 'points bought from Vibe Mobile, still to sell'
            }
            href="/purchases"
            stats={[
              {
                label: 'Cash margin vs 2%',
                value: formatMYR(actualCashMargin),
                href: '/reports',
                // brass, not red: negative here is the normal state while stock
                // is unsold, and red would cry error every month.
                tone: actualCashMargin < 0 ? 'caution' : 'normal',
              },
              { label: 'Total bought', value: `${totalPurchasedPoints.toLocaleString()} pts`, href: '/purchases' },
              { label: 'Total cost paid', value: formatMYR(totalPurchasedCost), href: '/purchases' },
            ]}
            footnote={
              /* A large negative number with no explanation reads as a bug.
                 It isn't one: points are paid for up front and earn their
                 margin only as they're resold, so this sits negative until
                 the batch is sold through. Saying that is the difference
                 between "something is broken" and "this is how it works". */
              actualCashMargin < 0
                ? `Cash margin is negative while stock is unsold — ${formatPoints(balance)} pts still to sell. It settles toward ${formatMYR(expectedCommission)}.`
                : `Cash margin against the ${formatMYR(expectedCommission)} expected at 2%.`
            }
          />
        </div>

        {totalPurchasedPoints === 0 && (
          <p className="note-strip mt-3.5">
            No purchases logged yet, so Balance and Cash Margin are just 0 minus everything sold. Log your past
            batches below with their real dates for an accurate running balance and true cash-margin comparison.
          </p>
        )}

        <div className="mt-5 border-t border-ink-800 pt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-paper">Purchase History</h2>
            <span className="pill pill-neutral">{totalCount} purchase{totalCount === 1 ? '' : 's'}</span>
          </div>
          {rows.length ? (
            <>
              <ScrollFade label="Credit purchase history">
                <table className="w-full min-w-[620px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th text-right">Paid (RM)</th>
                      <th className="th text-right">Points</th>
                      <th className="th">Note</th>
                      <th className="th">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} className="tr-row">
                        <td className="td whitespace-nowrap text-paper-dim">{p.purchase_date}</td>
                        <td className="td figure-money text-right">{formatMYR(Number(p.money_rm))}</td>
                        <td className="td figure-points text-right">{Number(p.points).toLocaleString()}</td>
                        <td className="td text-paper-dim">{p.note ?? '—'}</td>
                        <td className="td text-paper-dim">{nameById.get(p.recorded_by) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollFade>
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
                  <span className="text-[11.5px] text-paper-dim">
                    Page {pageNum} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    {pageNum > 1 ? (
                      <Link href={pageHref(pageNum - 1)} className="btn-ghost py-1.5 text-xs">
                        Previous
                      </Link>
                    ) : (
                      <button type="button" disabled className="btn-ghost py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                    Previous
                  </button>
                    )}
                    {pageNum < totalPages ? (
                      <Link href={pageHref(pageNum + 1)} className="btn-ghost py-1.5 text-xs">
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
            </>
          ) : (
            <p className="text-sm text-paper-dim">No purchases recorded yet.</p>
          )}
        </div>
      </div>

      <div className="app-card">
        <h3 className="mb-3.5 text-sm font-bold text-paper">Log a purchase</h3>
        {error && <div className="alert alert-bad">{error}</div>}
        <PurchaseForm today={today} />
        <p className="note-strip">
          Each entry adds to the points balance. Verified dealer transactions subtract from it — the Balance tile
          shows what&apos;s left to sell.
        </p>
      </div>
    </div>
    </>
  )
}
