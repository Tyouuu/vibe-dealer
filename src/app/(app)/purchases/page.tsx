import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { COMMISSION_RATE } from '@/lib/packages'
import { getAvailablePointsBalance, LOW_BALANCE_THRESHOLD } from '@/lib/credit-balance'
import { IconCoin, IconTrendUp, IconDocument, IconCheckCircle } from '../icons'
import { todayInMalaysia } from '@/lib/month'
import { PurchaseForm } from './purchase-form'

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
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="app-card">
        <h1 className="mb-1 text-[26px] font-extrabold tracking-tight text-paper">Credit Purchases</h1>
        <p className="mb-4 text-[12.5px] text-paper-dim">
          What we pay Vibe Mobile for points/credit, before any of it is resold to dealers.
        </p>

        {saved && <div className="alert alert-ok">Purchase recorded.</div>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="app-tile">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">Balance</div>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <IconCoin className="h-3.5 w-3.5" />
              </span>
            </div>
            <div
              className={`figure-points mt-1.5 text-xl font-semibold ${
                balance <= 0 ? 'text-clay-bright' : balance < LOW_BALANCE_THRESHOLD ? 'text-brass-bright' : ''
              }`}
            >
              {balance.toLocaleString()} pts
            </div>
            {balance > 0 && balance < LOW_BALANCE_THRESHOLD && (
              <div className="mt-0.5 text-[11px] text-brass-bright">Running low — log a purchase soon</div>
            )}
          </div>
          <div className="app-tile">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">Total Bought</div>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <IconTrendUp className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="figure-points mt-1.5 text-xl font-semibold">{totalPurchasedPoints.toLocaleString()} pts</div>
          </div>
          <div className="app-tile">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">Total Cost Paid</div>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <IconDocument className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="figure-money mt-1.5 text-xl font-semibold">RM {totalPurchasedCost.toLocaleString()}</div>
          </div>
          <div className="app-tile">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">Cash Margin vs 2%</div>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <IconCheckCircle className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="figure-money mt-1.5 text-xl font-semibold">RM {actualCashMargin.toLocaleString()}</div>
            <div className="mt-0.5 text-[11px] text-paper-dim">Expected RM {expectedCommission.toLocaleString()}</div>
          </div>
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
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
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
                        <td className="td text-paper-dim">{p.purchase_date}</td>
                        <td className="td figure-money text-right">RM {Number(p.money_rm).toLocaleString()}</td>
                        <td className="td figure-points text-right">{Number(p.points).toLocaleString()}</td>
                        <td className="td text-paper-dim">{p.note ?? '—'}</td>
                        <td className="td text-paper-dim">{nameById.get(p.recorded_by) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
                  <span className="text-[11.5px] text-paper-dim">
                    Page {pageNum} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    {pageNum > 1 ? (
                      <Link href={pageHref(pageNum - 1)} className="btn-ghost py-1.5 text-xs">
                        ← Prev
                      </Link>
                    ) : (
                      <span className="btn-ghost cursor-not-allowed py-1.5 text-xs opacity-40">← Prev</span>
                    )}
                    {pageNum < totalPages ? (
                      <Link href={pageHref(pageNum + 1)} className="btn-ghost py-1.5 text-xs">
                        Next →
                      </Link>
                    ) : (
                      <span className="btn-ghost cursor-not-allowed py-1.5 text-xs opacity-40">Next →</span>
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
        <h3 className="mb-3.5 text-sm font-bold text-paper">Log a Purchase</h3>
        {error && <div className="alert alert-bad">{error}</div>}
        <PurchaseForm today={today} />
        <p className="note-strip">
          Each entry adds to the points balance. Verified dealer transactions subtract from it — the Balance tile
          shows what&apos;s left to sell.
        </p>
      </div>
    </div>
  )
}
