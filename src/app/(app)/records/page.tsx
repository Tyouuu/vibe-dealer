import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { monthRange, todayInMalaysia, formatMonthLabel, formatDateLabel } from '@/lib/month'
import { sanitizeSearchTerm } from '@/lib/search'
import { daysSince, DELIVERY_WARN_DAYS_THRESHOLD, PENDING_REVIEW_STALE_DAYS } from '@/lib/dealer-activity'
import { COUPON_DENOMINATION_RM } from '@/lib/packages'
import { VerifyButton } from './verify-button'
import { FlagButton } from './flag-button'
import { AdjustButton } from './adjust-button'
import { IconPaperclip, IconSearch } from '../icons'
import { Avatar } from '../avatar'
import { StatusDot } from '../status-dot'
import { Listbox } from '../listbox'
import { MonthPicker } from '../month-picker'
import { ScrollFade } from '../scroll-fade'
import { PageHeader } from '../page-header'
import { HeroCard } from '../hero-card'
import { EmptyState } from '../empty-state'
import { FilterChips } from '../filter-chips'
import { formatMYR } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Transactions — DealerHub',
}

const PAGE_SIZE = 50

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
  receipt_url: string | null
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
      'id, dealer_id, tx_date, type, package, points, money_rm, rate, commission_rm, coupon_rm, sim_type, delivery_status, status, flag_reason, receipt_url, recorded_by, dealers(company_name)',
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

  const hasFilter = status !== 'all' || !!month || !!q
  const clearFiltersParams = new URLSearchParams()
  if (dealerId) clearFiltersParams.set('dealer', dealerId)
  if (sort !== 'desc') clearFiltersParams.set('sort', sort)
  const clearFiltersHref = `/records${clearFiltersParams.toString() ? `?${clearFiltersParams.toString()}` : ''}`

  // One chip per active filter, each linking to the same URL minus itself.
  // The dealer filter previously had its own bespoke pill with a ✕ glyph; it
  // is now the same component as the rest, so there is one way to see and
  // remove a filter rather than two.
  function withoutFilter(drop: 'status' | 'month' | 'q' | 'dealer') {
    const params = new URLSearchParams()
    if (status !== 'all' && drop !== 'status') params.set('status', status)
    if (month && drop !== 'month') params.set('month', month)
    if (q && drop !== 'q') params.set('q', q)
    if (dealerId && drop !== 'dealer') params.set('dealer', dealerId)
    if (sort !== 'desc') params.set('sort', sort)
    const qs = params.toString()
    return `/records${qs ? `?${qs}` : ''}`
  }

  const STATUS_LABEL: Record<string, string> = { pending: 'Pending', verified: 'Verified', flagged: 'Flagged' }
  const filterChips = [
    ...(status !== 'all' ? [{ label: 'Status', value: STATUS_LABEL[status] ?? status, removeHref: withoutFilter('status') }] : []),
    ...(month ? [{ label: 'Month', value: formatMonthLabel(month), removeHref: withoutFilter('month') }] : []),
    ...(q ? [{ label: 'Search', value: q, removeHref: withoutFilter('q') }] : []),
    ...(dealerId ? [{ label: 'Dealer', value: dealerFilterName ?? 'Unknown dealer', removeHref: withoutFilter('dealer') }] : []),
  ]
  const clearAllHref = sort !== 'desc' ? `/records?sort=${sort}` : '/records'

  return (
    <>
      {/* Header on the page surface, card holds only the data — see PageHeader. */}
      {/* The ledger's answer is not "how many rows exist" — it's "what is
          waiting on me". Pending review was already computed here and spent
          on a fragment of grey subtitle text. It leads now, because a pending
          transaction counts toward nothing until someone verifies it: not
          reconciliation, not the monthly report, not the 2%. */}
      <PageHeader
        title="Transactions"
        subtitle="Every top-up, package and adjustment. Append-only — corrections post as new linked entries, nothing is edited or deleted."
        action={{ href: '/entry', label: 'New transaction' }}
      />

      <HeroCard
        label={pendingCount ? 'Waiting for review' : 'Nothing waiting for review'}
        value={String(pendingCount ?? 0)}
        chgSuffix={
          pendingCount
            ? 'a pending entry counts toward nothing until it is verified'
            : 'every transaction on record has been checked'
        }
        href="/records?status=pending"
        stats={[
          {
            label: 'Verified',
            value: (verifiedCount ?? 0).toLocaleString(),
            href: '/records?status=verified',
            sub: 'counts toward reports and the 2%',
          },
          {
            label: 'Flagged',
            value: (flaggedCount ?? 0).toLocaleString(),
            href: '/records?status=flagged',
            tone: flaggedCount ? 'warn' : 'normal',
            sub: 'needs a correction posting',
          },
          {
            label: 'Matching this filter',
            value: totalCount.toLocaleString(),
            href: '/records',
            sub: totalCount > PAGE_SIZE ? `showing ${rangeStart}–${rangeEnd}` : 'all shown',
          },
        ]}
      />

      {submitted && (
        <div className="alert alert-ok">Recorded! Status = pending — counts toward reconciliation/reports once verified.</div>
      )}
      {adjusted && (
        <div className="alert alert-ok">Correction posted as a new pending transaction — the original is untouched. Verify it to apply.</div>
      )}
      {error && <div className="alert alert-bad">{error}</div>}

      {/* The ledger is the page — no card. Same two-row toolbar as /dealers,
          so the two biggest lists in the app are operated identically: view
          controls and page actions on the first row, filters on the second,
          one hairline closing them and opening the table. Every control that
          was here is still here. */}
      <div className="index-surface">

      <FilterChips chips={filterChips} clearAllHref={clearAllHref} />

      <div className="index-toolbar">
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
        <a href={exportHref} className="btn-ghost ml-auto">
          ⤓ Export
        </a>
      </div>

      <form className="index-filterbar" action="/records" method="GET">
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

      {/* Pending / verified / flagged used to repeat here, a few hundred pixels
          below the header that already states all three. Only the page-scoped
          commission is unique to this strip — it's the one figure that changes
          as you page through, which the header's filter-wide totals can't say. */}
      <div className="txn-summary">
        <span className="txn-summary-item accent">
          Your 2% on this page <b>{formatMYR(pageCommission)}</b>
        </span>
      </div>

      {pageRows.length ? (
        <ScrollFade label="Transactions">
          {/* table-fixed with percentage widths. This table had no colgroup
              at all, so auto layout sized every column from whatever its
              longest cell happened to be — the columns shifted as you paged
              and the dealer name wrapped to two and three lines, which is
              what gave the table three different row heights (61/59/74,
              measured). Ten columns, percentages summing to 100. */}
          <table className="w-full min-w-[1040px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[19%]" />
              <col className="w-[13%]" />
              <col className="w-[11%]" />
              <col className="w-[8%]" />
              <col className="w-[5%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
            </colgroup>
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
                  <tr key={tx.id} className="tr-row relative h-16">
                    <td className="td whitespace-nowrap text-paper-dim">{formatDateLabel(tx.tx_date)}</td>
                    <td className="td">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={dealerName ?? '?'} size={24} />
                        <a
                          href={`/dealers/${tx.dealer_id}`}
                          className="truncate font-semibold text-paper after:absolute after:inset-0 after:content-[''] hover:text-jade-bright"
                        >
                          {dealerName ?? '—'}
                        </a>
                      </div>
                    </td>
                    <td className="td text-paper-dim">
                      <span className="whitespace-nowrap">
                        {tx.type === 'package' ? `Package ${tx.package}` : tx.type === 'adjustment' ? 'Adjustment' : 'Top-up'}
                      </span>
                      {tx.type === 'topup' && tx.coupon_rm > 0 && (
                        <div className="truncate text-[12px] text-paper-dim">
                          {formatMYR(tx.coupon_rm)} as coupon ({tx.coupon_rm / COUPON_DENOMINATION_RM}×)
                        </div>
                      )}
                      {/* The evidence behind the row, and the reason to keep a
                          receipt at all: when a dealer queries a transaction,
                          this is what settles it. Uploading one has worked
                          since day one — nothing had ever read it back.

                          relative z-10 because the dealer link above spans the
                          whole row via after:inset-0; without it this sits
                          under that overlay and opens the dealer instead. */}
                      {tx.receipt_url && (
                        <a
                          href={`/api/receipts/view?path=${encodeURIComponent(tx.receipt_url)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative z-10 mt-0.5 inline-flex items-center gap-1 text-[12px] font-medium text-paper-dim hover:text-jade-bright"
                        >
                          <IconPaperclip className="h-3 w-3" />
                          Receipt
                        </a>
                      )}
                    </td>
                    <td className="td figure-money text-right">{formatMYR(tx.money_rm)}</td>
                    <td className="td figure-points text-right">{tx.points.toLocaleString()}</td>
                    <td className="td figure text-right text-paper-dim">{tx.rate != null ? `${tx.rate}%` : '—'}</td>
                    <td className="td figure-money text-right">{formatMYR(tx.commission_rm)}</td>
                    <td className="td">
                      {tx.delivery_status === 'sent' ? (
                        <StatusDot color="jade-bright" label="Sent" />
                      ) : tx.delivery_status === 'pending' ? (
                        <StatusDot color="brass-bright" label={deliveryWarn ? `Pending · ${deliveryDays}d` : 'Pending'} pulse />
                      ) : (
                        <span className="text-paper-dim/50">—</span>
                      )}
                    </td>
                    <td className="td">
                      <StatusDot color={statusColor} label={statusLabel} pulse={tx.status === 'pending'} />
                      {tx.status === 'flagged' && tx.flag_reason && (
                        <div className="mt-0.5 max-w-[140px] truncate text-[12px] text-paper-dim" title={tx.flag_reason}>
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
            </tbody>
          </table>
        </ScrollFade>
      ) : hasFilter ? (
        <EmptyState
          variant="filtered"
          icon={<IconSearch className="h-5 w-5" />}
          title="No transactions match your filters"
          description="Nothing matches these filters. Clear them to see the full ledger."
          action={{ href: clearFiltersHref, label: 'Clear filters' }}
        />
      ) : (
        <EmptyState
          variant="empty"
          icon={<IconSearch className="h-5 w-5" />}
          title="No transactions yet"
          description="Record a transaction to start the ledger. Entries here can be corrected by adjustment, never edited or deleted."
          action={{ href: '/entry', label: 'New transaction' }}
        />
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
          <span className="text-[12px] text-paper-dim">
            Page {pageNum} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            {pageNum > 1 ? (
              <Link href={buildHref({ page: pageNum - 1 })} className="btn-ghost py-1.5 text-xs">
                Previous
              </Link>
            ) : (
              <button type="button" disabled className="btn-ghost py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                    Previous
                  </button>
            )}
            {pageNum < totalPages ? (
              <Link href={buildHref({ page: pageNum + 1 })} className="btn-ghost py-1.5 text-xs">
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
      </div>
    </>
  )
}
