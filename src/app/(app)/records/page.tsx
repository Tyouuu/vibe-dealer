import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { monthRange, todayInMalaysia } from '@/lib/month'
import { sanitizeSearchTerm } from '@/lib/search'
import { daysSince, DELIVERY_WARN_DAYS_THRESHOLD, PENDING_REVIEW_STALE_DAYS } from '@/lib/dealer-activity'
import { COUPON_DENOMINATION_RM } from '@/lib/packages'
import { VerifyButton } from './verify-button'
import { FlagButton } from './flag-button'
import { AdjustButton } from './adjust-button'
import { IconSearch } from '../icons'
import { Avatar } from '../avatar'
import { StatusDot } from '../status-dot'
import { Listbox } from '../listbox'
import { MonthPicker } from '../month-picker'

export const metadata: Metadata = {
  title: 'Transactions — DealerHub',
}

const PAGE_SIZE = 200

type TxRow = {
  id: string
  dealer_id: string
  tx_date: string
  type: 'package' | 'topup' | 'adjustment'
  package: string | null
  points: number
  money_rm: number
  rate: number | null
  commission_rm: number
  coupon_rm: number
  sim_type: string | null
  delivery_status: 'na' | 'pending' | 'sent'
  status: 'pending' | 'verified' | 'flagged'
  flag_reason: string | null
  recorded_by: string | null
  dealers: { company_name: string } | { company_name: string }[] | null
}

type PageProps = {
  searchParams: Promise<{
    status?: string
    submitted?: string
    adjusted?: string
    error?: string
    month?: string
    q?: string
    sort?: string
    dealer?: string
    page?: string
  }>
}

export default async function RecordsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { status = 'all', submitted, adjusted, error, month, q = '', sort = 'desc', dealer: dealerId, page } = await searchParams
  const sortAscending = sort === 'asc'
  const pageNum = Math.max(1, Math.trunc(Number(page)) || 1)

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="view transactions" />
  }

  const supabase = await createClient()

  let dealerFilterName: string | null = null
  if (dealerId) {
    const { data: d } = await supabase.from('dealers').select('company_name').eq('id', dealerId).maybeSingle()
    dealerFilterName = d?.company_name ?? null
  }

  // Resolved once, up front, so both the main page query and the 3 status-
  // breakdown count queries below apply the exact same month/dealer/search
  // scope without re-querying dealers 3 extra times or risking the two
  // drifting apart. Plain values (a date range + an .or() string), not a
  // shared query-builder function — Supabase's builder type doesn't narrow
  // cleanly through a generic helper without reaching for `any`.
  const monthWindow = month ? monthRange(month) : null
  const safeQ = sanitizeSearchTerm(q)
  let searchOrFilter: string | null = null
  if (safeQ) {
    // Matches dealer name (resolved to ids first, since it's a joined table)
    // OR the transaction's own note/flag_reason text — previously name-only,
    // which meant the only way to find "that flagged transaction about X" was
    // to already know which dealer it was under. sanitizeSearchTerm already
    // strips ,()% so safeQ can't break out of the .or() filter string.
    const { data: matchingDealers } = await supabase.from('dealers').select('id').ilike('company_name', `%${safeQ}%`)
    const dealerIds = (matchingDealers ?? []).map((d) => d.id)
    const orParts = [`note.ilike.%${safeQ}%`, `flag_reason.ilike.%${safeQ}%`]
    if (dealerIds.length) orParts.push(`dealer_id.in.(${dealerIds.join(',')})`)
    searchOrFilter = orParts.join(',')
  }

  let query = supabase
    .from('transactions')
    .select(
      'id, dealer_id, tx_date, type, package, points, money_rm, rate, commission_rm, coupon_rm, sim_type, delivery_status, status, flag_reason, recorded_by, dealers(company_name)',
      { count: 'exact' }
    )
  if (monthWindow) query = query.gte('tx_date', monthWindow.start).lte('tx_date', monthWindow.end)
  if (dealerId) query = query.eq('dealer_id', dealerId)
  if (searchOrFilter) query = query.or(searchOrFilter)
  if (status !== 'all') query = query.eq('status', status)
  const pagedQuery = query
    .order('tx_date', { ascending: sortAscending })
    .order('created_at', { ascending: sortAscending })
    .range((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE - 1)

  // True counts across every matching row (month/dealer/search — not the
  // status dropdown, and not just the current page) — previously computed
  // via pageRows.filter(), which silently became "counts on this page only"
  // once real pagination replaced the old flat 200-row cap. "Your 2% on
  // this page" below is the only figure that's *meant* to be page-scoped,
  // and already says so.
  function statusCountQuery(statusValue: 'pending' | 'verified' | 'flagged') {
    let q = supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', statusValue)
    if (monthWindow) q = q.gte('tx_date', monthWindow.start).lte('tx_date', monthWindow.end)
    if (dealerId) q = q.eq('dealer_id', dealerId)
    if (searchOrFilter) q = q.or(searchOrFilter)
    return q
  }

  const [{ data: rows, count }, { count: pendingCount }, { count: verifiedCount }, { count: flaggedCount }] = await Promise.all([
    pagedQuery,
    statusCountQuery('pending'),
    statusCountQuery('verified'),
    statusCountQuery('flagged'),
  ])
  const pageRows = (rows as unknown as TxRow[] | null) ?? []
  const pageCommission = pageRows.reduce((s, r) => s + Number(r.commission_rm), 0)

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rangeStart = totalCount === 0 ? 0 : (pageNum - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(pageNum * PAGE_SIZE, totalCount)

  function buildHref(overrides: { sort?: string; page?: number }) {
    const params = new URLSearchParams()
    if (status !== 'all') params.set('status', status)
    if (month) params.set('month', month)
    if (q) params.set('q', q)
    if (dealerId) params.set('dealer', dealerId)
    const nextSort = overrides.sort ?? sort
    if (nextSort !== 'desc') params.set('sort', nextSort)
    // Changing sort/filters always drops back to page 1 unless a page
    // override is explicitly given (Prev/Next) — staying on "page 3" after
    // the result set changes underneath it would just be confusing.
    if (overrides.page && overrides.page > 1) params.set('page', String(overrides.page))
    const qs = params.toString()
    return `/records${qs ? `?${qs}` : ''}`
  }

  const exportParams = new URLSearchParams()
  if (status !== 'all') exportParams.set('status', status)
  if (month) exportParams.set('month', month)
  if (q) exportParams.set('q', q)
  if (dealerId) exportParams.set('dealer', dealerId)
  if (sort !== 'desc') exportParams.set('sort', sort)
  const exportHref = `/api/records/export${exportParams.toString() ? `?${exportParams.toString()}` : ''}`

  const clearDealerParams = new URLSearchParams()
  if (status !== 'all') clearDealerParams.set('status', status)
  if (month) clearDealerParams.set('month', month)
  if (q) clearDealerParams.set('q', q)
  if (sort !== 'desc') clearDealerParams.set('sort', sort)
  const clearDealerHref = `/records${clearDealerParams.toString() ? `?${clearDealerParams.toString()}` : ''}`

  const hasFilter = status !== 'all' || !!month || !!q
  const clearFiltersParams = new URLSearchParams()
  if (dealerId) clearFiltersParams.set('dealer', dealerId)
  if (sort !== 'desc') clearFiltersParams.set('sort', sort)
  const clearFiltersHref = `/records${clearFiltersParams.toString() ? `?${clearFiltersParams.toString()}` : ''}`

  return (
    <div className="app-card">
      {submitted && (
        <div className="alert alert-ok">Recorded! Status = pending — counts toward reconciliation/reports once verified.</div>
      )}
      {adjusted && (
        <div className="alert alert-ok">Correction posted as a new pending transaction — the original is untouched. Verify it to apply.</div>
      )}
      {error && <div className="alert alert-bad">{error}</div>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight text-paper">Transactions</h1>
        <span className="pill pill-neutral">
          {totalCount > PAGE_SIZE ? `Showing ${rangeStart}–${rangeEnd} of ${totalCount} transactions` : `${totalCount} transactions`}
        </span>
      </div>

      {dealerId && (
        <div className="mb-4 flex items-center gap-2">
          <span className="pill pill-info">
            Dealer: {dealerFilterName ?? 'Unknown dealer'}
            <a href={clearDealerHref} className="ml-1.5 font-bold hover:text-paper" title="Clear dealer filter" aria-label="Clear dealer filter">
              ✕
            </a>
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-wrap items-center gap-3" action="/records" method="GET">
          <label className="mini-search w-64 max-w-full">
            <IconSearch className="h-4 w-4 shrink-0 text-paper-dim" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search dealer, note, or flag reason"
              className="w-full bg-transparent text-sm text-paper outline-none placeholder:text-paper-dim/70"
            />
          </label>
          <div className="w-44">
            <Listbox
              name="status"
              defaultValue={status}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'pending', label: 'Pending', dotColor: 'var(--color-brass-bright)' },
                { value: 'verified', label: 'Verified', dotColor: 'var(--color-jade-bright)' },
                { value: 'flagged', label: 'Flagged', dotColor: 'var(--color-clay-bright)' },
              ]}
            />
          </div>
          <div className="w-44">
            <MonthPicker name="month" defaultValue={month ?? ''} placeholder="All months" allowClear today={todayInMalaysia().slice(0, 7)} />
          </div>
          {dealerId && <input type="hidden" name="dealer" value={dealerId} />}
          <input type="hidden" name="sort" value={sort} />
          <button type="submit" className="btn-primary">
            Filter
          </button>
        </form>

        <div className="flex items-center gap-2.5">
          <div className="segmented" role="group" aria-label="Sort transactions by date">
            <Link
              href={buildHref({ sort: 'desc' })}
              className={`segmented-btn ${!sortAscending ? 'active' : ''}`}
              aria-label="Sort by date, newest first"
            >
              Newest first
            </Link>
            <Link
              href={buildHref({ sort: 'asc' })}
              className={`segmented-btn ${sortAscending ? 'active' : ''}`}
              aria-label="Sort by date, oldest first"
            >
              Oldest first
            </Link>
          </div>
          <a href={exportHref} className="btn-ghost">
            ⤓ Export
          </a>
        </div>
      </div>

      <div className="txn-summary">
        <span className="txn-summary-item">
          <span className="status-dot" style={{ background: 'var(--color-brass-bright)' }} />
          Pending <b>{pendingCount ?? 0}</b>
        </span>
        <span className="txn-summary-item">
          <span className="status-dot" style={{ background: 'var(--color-jade-bright)' }} />
          Verified <b>{verifiedCount ?? 0}</b>
        </span>
        <span className="txn-summary-item">
          <span className="status-dot" style={{ background: 'var(--color-clay-bright)' }} />
          Flagged <b>{flaggedCount ?? 0}</b>
        </span>
        <span className="txn-summary-item accent">
          Your 2% on this page <b>RM {pageCommission.toLocaleString()}</b>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="th">Date</th>
              <th className="th">Dealer</th>
              <th className="th">Type</th>
              <th className="th text-right">In (RM)</th>
              <th className="th text-right">Out (pts)</th>
              <th className="th text-right">Rate</th>
              <th className="th text-right">Your 2%</th>
              <th className="th">Delivery</th>
              <th className="th">Status</th>
              <th className="th">Action</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((tx) => {
              const dealerRel = Array.isArray(tx.dealers) ? tx.dealers[0] : tx.dealers
              const dealerName = dealerRel?.company_name
              const statusColor =
                tx.status === 'verified' ? 'jade-bright' : tx.status === 'flagged' ? 'clay-bright' : 'brass-bright'
              const pendingDays = tx.status === 'pending' ? daysSince(tx.tx_date) : 0
              const pendingStale = tx.status === 'pending' && pendingDays >= PENDING_REVIEW_STALE_DAYS
              const statusLabel =
                tx.status === 'verified' ? 'Verified' : tx.status === 'flagged' ? 'Flagged' : pendingStale ? `Pending·${pendingDays}d` : 'Pending'
              const deliveryDays = tx.delivery_status === 'pending' ? daysSince(tx.tx_date) : 0
              const deliveryWarn = tx.delivery_status === 'pending' && deliveryDays >= DELIVERY_WARN_DAYS_THRESHOLD
              return (
                <tr key={tx.id} className="tr-row relative">
                  <td className="td text-paper-dim">{tx.tx_date}</td>
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={dealerName ?? '?'} size={24} />
                      <a
                        href={`/dealers/${tx.dealer_id}`}
                        className="font-semibold text-paper after:absolute after:inset-0 after:content-[''] hover:text-jade-bright"
                      >
                        {dealerName ?? '—'}
                      </a>
                    </div>
                  </td>
                  <td className="td text-paper-dim">
                    {tx.type === 'package' ? `Buy Package ${tx.package}` : tx.type === 'adjustment' ? 'Adjustment' : 'Regular Top-up'}
                    {tx.type === 'topup' && tx.coupon_rm > 0 && (
                      <div className="mt-0.5 text-[10.5px] text-paper-dim">
                        RM {tx.coupon_rm.toLocaleString()} as coupon ({tx.coupon_rm / COUPON_DENOMINATION_RM}×)
                      </div>
                    )}
                  </td>
                  <td className="td figure-money text-right">RM {tx.money_rm.toLocaleString()}</td>
                  <td className="td figure-points text-right">{tx.points.toLocaleString()}</td>
                  <td className="td figure text-right text-paper-dim">{tx.rate != null ? `${tx.rate}%` : '—'}</td>
                  <td className="td figure-money text-right">RM {tx.commission_rm.toLocaleString()}</td>
                  <td className="td">
                    {tx.delivery_status === 'sent' ? (
                      <span className="pill pill-jade">Sent</span>
                    ) : tx.delivery_status === 'pending' ? (
                      <span className="pill pill-brass">{deliveryWarn ? `Pending·${deliveryDays}d` : 'Pending'}</span>
                    ) : (
                      <span className="text-paper-dim/50">—</span>
                    )}
                  </td>
                  <td className="td">
                    <StatusDot color={statusColor} label={statusLabel} pulse={tx.status === 'pending'} />
                    {tx.status === 'flagged' && tx.flag_reason && (
                      <div className="mt-0.5 max-w-[140px] truncate text-[10.5px] text-paper-dim" title={tx.flag_reason}>
                        {tx.flag_reason}
                      </div>
                    )}
                  </td>
                  {/* relative z-10 — the dealer-name link's stretched ::after
                      (after:absolute after:inset-0) covers the whole row for
                      click-to-open-dealer, and without their own stacking
                      context these buttons sit underneath it: a click aimed
                      at Verify/Flag/Adjust would hit the overlay instead and
                      navigate to the dealer page rather than firing the
                      button, since plain static-positioned elements paint
                      below an absolutely-positioned sibling by default. */}
                  <td className="td relative z-10">
                    {tx.status === 'pending' ? (
                      <div className="flex items-center gap-1.5">
                        <VerifyButton transactionId={tx.id} isSelfRecorded={tx.recorded_by === user.id} isAdjustment={tx.type === 'adjustment'} />
                        <FlagButton transactionId={tx.id} />
                      </div>
                    ) : tx.status === 'verified' && tx.type !== 'adjustment' ? (
                      <AdjustButton transactionId={tx.id} currentPoints={tx.points} currentMoneyRm={tx.money_rm} rate={tx.rate} />
                    ) : (
                      <span className="text-paper-dim/50">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {!rows?.length && (
              <tr>
                <td colSpan={10} className="p-0">
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-850 text-paper-dim">
                      <IconSearch className="h-5 w-5" />
                    </span>
                    <p className="text-sm text-paper-dim">{hasFilter ? 'No transactions match those filters.' : 'No transactions yet.'}</p>
                    {hasFilter && (
                      <Link href={clearFiltersHref} className="btn-ghost text-xs">
                        Clear filters
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            )}
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
              <Link href={buildHref({ page: pageNum - 1 })} className="btn-ghost py-1.5 text-xs">
                ← Prev
              </Link>
            ) : (
              <span className="btn-ghost cursor-not-allowed py-1.5 text-xs opacity-40">← Prev</span>
            )}
            {pageNum < totalPages ? (
              <Link href={buildHref({ page: pageNum + 1 })} className="btn-ghost py-1.5 text-xs">
                Next →
              </Link>
            ) : (
              <span className="btn-ghost cursor-not-allowed py-1.5 text-xs opacity-40">Next →</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
