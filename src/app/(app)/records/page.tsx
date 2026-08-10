import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { monthRange, todayInMalaysia, formatMonthLabel, formatDateLabel } from '@/lib/month'
import { sanitizeSearchTerm } from '@/lib/search'
import { daysSince, DELIVERY_WARN_DAYS_THRESHOLD, PENDING_REVIEW_STALE_DAYS } from '@/lib/dealer-activity'
import { COUPON_DENOMINATION_RM } from '@/lib/packages'
import { RowActions } from './row-actions'
import { BulkVerifyBar, RowSelect } from './bulk-verify'
import { UnsignedCorrections } from './unsigned-corrections'
import { IconPaperclip, IconSearch, IconChevronDown } from '../icons'
import { DatePicker } from '../date-picker'
import { FilterForm } from './filter-form'
import { Avatar } from '../avatar'
import { StatusDot } from '../status-dot'
import { Listbox } from '../listbox'
import { MonthPicker } from '../month-picker'
import { DataGrid } from '../data-grid'
import { ColumnsMenu } from '../columns-menu'
import { TABLE_COLUMNS, columnCookieName, parseHiddenColumns } from '@/lib/table-columns'
import { PageHeader } from '../page-header'
import { HeroCard } from '../hero-card'
import { EmptyState } from '../empty-state'
import { FilterChips } from '../filter-chips'
import { formatMYR } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Transactions — Vibe456',
}

const PAGE_SIZE = 50

const TX_TYPES = ['all', 'package', 'topup', 'adjustment'] as const
type TxType = (typeof TX_TYPES)[number]
const TX_TYPE_LABEL: Record<Exclude<TxType, 'all'>, string> = {
  package: 'Package',
  topup: 'Top-up',
  adjustment: 'Correction',
}

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

type AwaitingRow = {
  id: string
  points: number
  money_rm: number
  note: string | null
  recorded_by: string | null
  created_at: string
  dealers: { company_name: string } | { company_name: string }[] | null
}

type PageProps = {
  searchParams: Promise<{
    status?: string
    submitted?: string
    // The dealer that was just recorded against. Separate from `dealer`, which
    // filters this page — this one only decides who the success banner offers
    // to record for next.
    just?: string
    verified?: string
    locked?: string
    adjusted?: string
    error?: string
    month?: string
    q?: string
    sort?: string
    dealer?: string
    page?: string
    type?: string
    min?: string
    max?: string
    from?: string
    to?: string
    by?: string
  }>
}

export default async function RecordsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const {
    status = 'all',
    submitted,
    just: justDealerId,
    adjusted,
    error,
    month,
    q = '',
    sort = 'desc',
    dealer: dealerId,
    page,
    verified: bulkVerified,
    locked: bulkLocked,
    type: typeParam = 'all',
    min: minParam = '',
    max: maxParam = '',
    from: fromParam = '',
    to: toParam = '',
    by: byParam = '',
  } = await searchParams
  const sortAscending = sort === 'asc'
  const pageNum = Math.max(1, Math.trunc(Number(page)) || 1)

  // Read defensively — these arrive straight off the URL, so anything that
  // isn't a value the ledger can actually be narrowed by is treated as absent
  // rather than passed down to Postgres.
  const txType = TX_TYPES.includes(typeParam as TxType) ? (typeParam as TxType) : 'all'
  const minRm = Number.isFinite(Number(minParam)) && minParam.trim() !== '' ? Number(minParam) : null
  const maxRm = Number.isFinite(Number(maxParam)) && maxParam.trim() !== '' ? Number(maxParam) : null
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : ''
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : ''
  const recordedBy = /^[0-9a-f-]{36}$/i.test(byParam) ? byParam : ''

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="view transactions" />
  }

  // Which columns this reader keeps. Read during the render, so the first
  // HTML already has the hidden ones hidden — see lib/table-columns.ts.
  const hiddenColumns = parseHiddenColumns('records', (await cookies()).get(columnCookieName('records'))?.value)

  const supabase = await createClient()

  let dealerFilterName: string | null = null
  if (dealerId) {
    const { data: d } = await supabase.from('dealers').select('company_name').eq('id', dealerId).maybeSingle()
    dealerFilterName = d?.company_name ?? null
  }

  // Resolved once, up front, so both the main page query and the 3 status-
  // breakdown count queries below apply the exact same scope without
  // re-querying dealers 3 extra times or risking the two drifting apart.
  //
  // A list of [operator, column, value] rather than a generic helper that
  // takes a query builder: Supabase's builder type doesn't narrow cleanly
  // through one without reaching for `any`, and with seven filters now
  // instead of two, writing the same chain twice by hand is how the header's
  // "1,204 verified" ends up disagreeing with the table under it. The search
  // term stays out of this — it's an .or(), not a column comparison.
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

  const scope: Array<['eq' | 'gte' | 'lte', string, string | number]> = []
  if (monthWindow) {
    scope.push(['gte', 'tx_date', monthWindow.start], ['lte', 'tx_date', monthWindow.end])
  }
  // Month and an explicit date range compose rather than override. Setting
  // both to periods that don't overlap returns nothing, which looks like a
  // bug until you notice it isn't — so both appear as their own chip above
  // the table, and either can be lifted on its own.
  if (dateFrom) scope.push(['gte', 'tx_date', dateFrom])
  if (dateTo) scope.push(['lte', 'tx_date', dateTo])
  if (dealerId) scope.push(['eq', 'dealer_id', dealerId])
  if (txType !== 'all') scope.push(['eq', 'type', txType])
  if (minRm != null) scope.push(['gte', 'money_rm', minRm])
  if (maxRm != null) scope.push(['lte', 'money_rm', maxRm])
  if (recordedBy) scope.push(['eq', 'recorded_by', recordedBy])

  let query = supabase
    .from('transactions')
    .select(
      'id, dealer_id, tx_date, type, package, points, money_rm, rate, commission_rm, coupon_rm, sim_type, delivery_status, status, flag_reason, receipt_url, recorded_by, dealers(company_name)',
      { count: 'exact' }
    )
  // Dispatched explicitly rather than as query[op](col, val): Supabase types
  // eq/gte/lte as an overloaded union that isn't callable through an indexed
  // access, which is the same wall the original two-filter version hit. The
  // three-way ternary is mechanical and identical in both places; what must
  // not be duplicated is the *list* above, and it isn't.
  for (const [op, col, val] of scope) {
    query = op === 'eq' ? query.eq(col, val) : op === 'gte' ? query.gte(col, val) : query.lte(col, val)
  }
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
    for (const [op, col, val] of scope) {
      q = op === 'eq' ? q.eq(col, val) : op === 'gte' ? q.gte(col, val) : q.lte(col, val)
    }
    if (searchOrFilter) q = q.or(searchOrFilter)
    return q
  }

  const [
    { data: rows, count },
    { count: pendingCount },
    { count: verifiedCount },
    { count: flaggedCount },
    { data: awaitingRows },
    { data: staffProfiles },
    { data: justDealerRow },
  ] = await Promise.all([
    pagedQuery,
    statusCountQuery('pending'),
    statusCountQuery('verified'),
    statusCountQuery('flagged'),
    // Deliberately outside every filter above — see UnsignedCorrections.
    // Oldest first: the one that has been waiting longest is the one the
    // ledger has been wrong about longest.
    supabase
      .from('transactions')
      .select('id, points, money_rm, note, recorded_by, created_at, dealers(company_name)')
      .eq('status', 'pending')
      .eq('type', 'adjustment')
      .order('created_at', { ascending: true }),
    // staff_directory, not profiles: profiles' RLS is own-row-only for
    // anyone who is not the master, so joining it here rendered every
    // colleague's name as a dash for the accountant. See migration 0035.
    supabase.from('staff_directory').select('id, display_name'),
    // Named from the database, not from the URL. The id arrives in a query
    // string anyone can edit, so the banner shows a company the reader is
    // allowed to see or no name at all — never the string that was handed to
    // it. RLS applies, and an unknown id simply yields nothing.
    justDealerId
      ? supabase.from('dealers').select('id, company_name').eq('id', justDealerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const justDealer = (justDealerRow as { id: string; company_name: string } | null) ?? null
  const pageRows = (rows as unknown as TxRow[] | null) ?? []
  const pageCommission = pageRows.reduce((s, r) => s + Number(r.commission_rm), 0)

  const staffNameById = new Map((staffProfiles ?? []).map((p) => [p.id, p.display_name ?? '—']))
  const unsignedCorrections = ((awaitingRows ?? []) as unknown as AwaitingRow[]).map((r) => {
    const rel = Array.isArray(r.dealers) ? r.dealers[0] : r.dealers
    return {
      id: r.id,
      dealerName: rel?.company_name ?? '—',
      points: Number(r.points),
      moneyRm: Number(r.money_rm),
      note: r.note,
      postedByName: r.recorded_by ? (staffNameById.get(r.recorded_by) ?? '—') : '—',
      // daysSince, not Date.now() arithmetic in the render body — same reason
      // as /reconcile: it counts in the Malaysia calendar like every other
      // "N days ago" here, and keeps the clock read out of render.
      daysWaiting: daysSince(String(r.created_at).slice(0, 10)),
      postedByYou: r.recorded_by === user.id,
    }
  })

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rangeStart = totalCount === 0 ? 0 : (pageNum - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(pageNum * PAGE_SIZE, totalCount)

  // Every filter currently narrowing the ledger, described once.
  //
  // Sort links, pagination, the export link, each chip's remove link and
  // clear-all all need to know which filters are on. They used to each list
  // them by hand, which was survivable at three and is not at eight — the
  // first one anybody forgets to update becomes a link that silently drops a
  // filter, and a page that says "3 results" while showing a different three.
  // Chip label and URL params come from the same entry, so a filter cannot be
  // applied but invisible, or visible but unremovable.
  const STATUS_LABEL: Record<string, string> = { pending: 'Pending', verified: 'Verified', flagged: 'Flagged' }
  const amountLabel =
    minRm != null && maxRm != null
      ? `${formatMYR(minRm)}–${formatMYR(maxRm)}`
      : minRm != null
        ? `from ${formatMYR(minRm)}`
        : `up to ${formatMYR(maxRm ?? 0)}`
  const dateLabel =
    dateFrom && dateTo
      ? `${formatDateLabel(dateFrom)} – ${formatDateLabel(dateTo)}`
      : dateFrom
        ? `from ${formatDateLabel(dateFrom)}`
        : `up to ${formatDateLabel(dateTo)}`

  type FilterKey = 'status' | 'month' | 'q' | 'dealer' | 'type' | 'amount' | 'date' | 'by'
  const activeFilters: { key: FilterKey; params: [string, string][]; label: string; value: string }[] = [
    ...(status !== 'all' ? [{ key: 'status' as const, params: [['status', status] as [string, string]], label: 'Status', value: STATUS_LABEL[status] ?? status }] : []),
    ...(txType !== 'all' ? [{ key: 'type' as const, params: [['type', txType] as [string, string]], label: 'Type', value: TX_TYPE_LABEL[txType] }] : []),
    ...(month ? [{ key: 'month' as const, params: [['month', month] as [string, string]], label: 'Month', value: formatMonthLabel(month) }] : []),
    ...(dateFrom || dateTo
      ? [{
          key: 'date' as const,
          params: [...(dateFrom ? [['from', dateFrom] as [string, string]] : []), ...(dateTo ? [['to', dateTo] as [string, string]] : [])],
          label: 'Date',
          value: dateLabel,
        }]
      : []),
    ...(minRm != null || maxRm != null
      ? [{
          key: 'amount' as const,
          params: [...(minRm != null ? [['min', String(minRm)] as [string, string]] : []), ...(maxRm != null ? [['max', String(maxRm)] as [string, string]] : [])],
          label: 'Amount',
          value: amountLabel,
        }]
      : []),
    ...(recordedBy ? [{ key: 'by' as const, params: [['by', recordedBy] as [string, string]], label: 'Recorded by', value: staffNameById.get(recordedBy) ?? '—' }] : []),
    ...(q ? [{ key: 'q' as const, params: [['q', q] as [string, string]], label: 'Search', value: q }] : []),
    ...(dealerId ? [{ key: 'dealer' as const, params: [['dealer', dealerId] as [string, string]], label: 'Dealer', value: dealerFilterName ?? 'Unknown dealer' }] : []),
  ]

  function hrefWith(opts: { base?: string; drop?: FilterKey; only?: FilterKey[]; sort?: string; page?: number } = {}) {
    const params = new URLSearchParams()
    for (const f of activeFilters) {
      if (opts.drop === f.key) continue
      if (opts.only && !opts.only.includes(f.key)) continue
      for (const [n, v] of f.params) params.set(n, v)
    }
    const nextSort = opts.sort ?? sort
    if (nextSort !== 'desc') params.set('sort', nextSort)
    // Changing sort/filters always drops back to page 1 unless a page
    // override is explicitly given (Prev/Next) — staying on "page 3" after
    // the result set changes underneath it would just be confusing.
    if (opts.page && opts.page > 1) params.set('page', String(opts.page))
    const qs = params.toString()
    return `${opts.base ?? '/records'}${qs ? `?${qs}` : ''}`
  }

  const buildHref = (overrides: { sort?: string; page?: number }) => hrefWith(overrides)
  const exportHref = hrefWith({ base: '/api/records/export' })
  // Dealer is not counted: arriving from a dealer's page is context, not a
  // filter the operator set, and "clear filters" should not throw it away.
  const hasFilter = activeFilters.some((f) => f.key !== 'dealer')
  const clearFiltersHref = hrefWith({ only: ['dealer'] })
  const filterChips = activeFilters.map((f) => ({ label: f.label, value: f.value, removeHref: hrefWith({ drop: f.key }) }))
  const clearAllHref = hrefWith({ only: [] })

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
        <div className="alert alert-ok flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <span>Recorded! Status = pending — counts toward reconciliation/reports once verified.</span>
          {/* Sales come in runs against one dealer. The form can already open
              on a dealer with their last amount filled in; this is the only
              thing that was missing — something to press. */}
          {justDealer && (
            <a href={`/entry?dealer=${justDealer.id}`} className="shrink-0 font-semibold underline underline-offset-2">
              Record another for {justDealer.company_name} →
            </a>
          )}
        </div>
      )}
      {adjusted && (
        <div className="alert alert-ok">Correction posted as a new pending transaction — the original is untouched. Verify it to apply.</div>
      )}
      {error && <div className="alert alert-bad">{error}</div>}
      {/* Names what it did *and* what it left. A batch that reports only its
          successes is how work quietly goes missing. */}
      {bulkVerified != null && (
        <div className={`alert ${Number(bulkVerified) > 0 ? 'alert-ok' : 'alert-warn'}`}>
          {Number(bulkVerified).toLocaleString()} transaction{Number(bulkVerified) === 1 ? '' : 's'} verified.
          {bulkLocked && ` Rows dated in ${bulkLocked.split(',').map((m) => formatMonthLabel(m)).join(', ')} were skipped — that month is reconciled.`}
        </div>
      )}

      {/* Above the ledger, not inside it. A correction stuck at pending is the
          most consequential thing this page can be carrying — it means a
          figure in the reports is knowingly wrong — and it must not be
          something you have to filter your way to. Renders nothing when there
          are none. */}
      <UnsignedCorrections items={unsignedCorrections} />

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
        <div className="ml-auto flex items-center gap-2">
          {/* Was a strip of its own directly above the column headers: one
              right-aligned figure on an otherwise empty full-width line, and
              40px of height taken from a grid that is short of room. It is one
              line of text, so it sits on a line that already exists. */}
          <span className="mr-1 hidden text-sm text-paper-dim sm:inline">
            Your 2% on this page <b className="font-semibold text-paper">{formatMYR(pageCommission)}</b>
          </span>
          <ColumnsMenu
            table="records"
            columns={TABLE_COLUMNS.records}
            hidden={[...hiddenColumns]}
            alwaysOn="Dealer, Status and Action"
          />
          <a href={exportHref} className="btn-ghost">
            ⤓ Export
          </a>
        </div>
      </div>

      <FilterForm className="index-filterbar-stacked">
        <div className="flex flex-wrap items-center gap-3">
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
          {/* Beside Status because it is the same kind of question and gets
              asked as often. "Show me every correction" had no answer on this
              page at all: a correction is the one entry type that changes a
              figure already on record, so being unable to list them was the
              largest blind spot in the ledger. */}
          <div className="w-44">
            <Listbox
              name="type"
              defaultValue={txType}
              options={[
                { value: 'all', label: 'All Types' },
                { value: 'package', label: 'Package' },
                { value: 'topup', label: 'Top-up' },
                { value: 'adjustment', label: 'Correction' },
              ]}
            />
          </div>
          <div className="w-44">
            <MonthPicker name="month" defaultValue={month ?? ''} placeholder="All months" allowClear today={todayInMalaysia().slice(0, 7)} />
          </div>
          {dealerId && <input type="hidden" name="dealer" value={dealerId} />}
          <input type="hidden" name="sort" value={sort} />
          {/* Secondary, like the same control on Audit Log and Dealers. Applying a
              filter is reversible; Export writes a file that leaves the system. */}
          <button type="submit" className="btn-ghost">
            Filter
          </button>
        </div>

        {/* Open when any of them is set, so a filtered view never hides the
            thing doing the filtering — arriving on a shared URL with an amount
            range applied would otherwise show a narrowed table and a closed
            panel. The chips above say so too; this puts the control itself
            within reach rather than only the news that it exists. */}
        <details open={minRm != null || maxRm != null || !!dateFrom || !!dateTo || !!recordedBy}>
          <summary className="filter-disclosure">
            <IconChevronDown className="h-3.5 w-3.5 transition-transform" />
            Amount, date range and who recorded it
          </summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {/* Amount, because a dealer disputing a transaction says "I paid
                RM 1,128" — not "it was in July". Both ends optional: one on
                its own is the more common question ("anything over RM5,000"). */}
            <div className="min-w-0 max-w-full">
              <span className="field-label">Amount collected (RM)</span>
              <div className="flex flex-wrap items-center gap-2">
                <input type="number" step="0.01" name="min" defaultValue={minParam} placeholder="Min" className="field-input w-28" aria-label="Minimum amount in RM" />
                <span className="text-[12px] text-paper-dim">to</span>
                <input type="number" step="0.01" name="max" defaultValue={maxParam} placeholder="Max" className="field-input w-28" aria-label="Maximum amount in RM" />
              </div>
            </div>

            {/* A range, not just a month: "last Tuesday" does not line up with
                a month boundary, and paging 50 at a time to find it is not a
                search. DatePicker rather than a bare input[type=date] so these
                read in the app's own date format like every other date on
                screen. */}
            {/* flex-wrap on the inner row, not just the outer one: two 160px
                pickers plus the word between them come to ~356px, which
                overflowed a 320px viewport by 43px with the panel open. The
                outer wrap could not help — the pair was one unbreakable child.
                Caught by re-running the audit after a stale stylesheet was
                fixed; the run before that reported clean against CSS the
                browser never had. */}
            <div className="min-w-0 max-w-full">
              <span className="field-label">Date range</span>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-40 max-w-full">
                  <DatePicker name="from" defaultValue={dateFrom} placeholder="From" allowClear todayIso={todayInMalaysia()} />
                </div>
                <span className="text-[12px] text-paper-dim">to</span>
                <div className="w-40 max-w-full">
                  <DatePicker name="to" defaultValue={dateTo} placeholder="To" allowClear todayIso={todayInMalaysia()} />
                </div>
              </div>
            </div>

            {/* Who keyed it in. Since 0043 nobody is blocked from signing off
                their own work, which makes reviewing it after the fact the
                control that is left — "what did CS enter yesterday" was a
                question the ledger could not answer. */}
            <div className="min-w-0 max-w-full">
              <span className="field-label">Recorded by</span>
              <div className="w-48 max-w-full">
                <Listbox
                  name="by"
                  defaultValue={recordedBy}
                  options={[{ value: '', label: 'Anyone' }, ...(staffProfiles ?? []).map((p) => ({ value: p.id, label: p.display_name ?? '—' }))]}
                />
              </div>
            </div>

            <button type="submit" className="btn-ghost">
              Filter
            </button>
          </div>
        </details>
      </FilterForm>

      {/* One form around the whole table so the row checkboxes post as a single
          selection. It wraps the ScrollFade rather than the table so the
          selection bar sits outside the horizontal scroller and stays reachable
          however far the table has been scrolled. */}
      {pageRows.length ? (
        <>
        <BulkVerifyBar />
        <DataGrid id="records" label="Transactions">
          {/* No colgroup. A <col> does not disappear when its cells are
              hidden, so a hidden column would leave its width behind and every
              column after it would sit one place to the left. table-fixed
              takes the widths off the header cells instead, and hiding a
              header genuinely removes the column. Widths in px, not %,
              because .pin-name has to know exactly where the select column
              ends (44px) to sit flush against it. */}
          <table className="grid-table table-fixed text-sm">
            <thead>
              <tr>
                <th className="th pin-start" style={{ width: 44 }}>
                  <span className="sr-only">Select</span>
                </th>
                {/* Dealer first, ahead of Date. A frozen column has to be at
                    the edge, and the thing you read a row by is who it is
                    for — scrolled right, the old first column left the screen
                    and every figure lost its subject. */}
                <th className="th pin-name pin-after-select" style={{ width: 208 }}>Dealer</th>
                <th className="th" data-c="date" style={{ width: 100 }}>Date</th>
                <th className="th" data-c="type" style={{ width: 132 }}>Type</th>
                <th className="th text-right" data-c="in" style={{ width: 108 }}>In (RM)</th>
                <th className="th text-right" data-c="out" style={{ width: 92 }}>Out (pts)</th>
                <th className="th text-right" data-c="rate" style={{ width: 64 }}>Rate</th>
                <th className="th text-right" data-c="commission" style={{ width: 100 }}>Your 2%</th>
                <th className="th" data-c="delivery" style={{ width: 106 }}>Delivery</th>
                <th className="th" style={{ width: 120 }}>Status</th>
                <th className="th pin-end text-right" style={{ width: 124 }}>Action</th>
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
                    <td className="td pin-start">{tx.status === 'pending' && <RowSelect id={tx.id} />}</td>
                    <td className="td pin-name pin-after-select">
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
                    <td className="td whitespace-nowrap text-paper-dim" data-c="date">{formatDateLabel(tx.tx_date)}</td>
                    <td className="td text-paper-dim" data-c="type">
                      <span className="whitespace-nowrap">
                        {tx.type === 'package' ? `Package ${tx.package}` : tx.type === 'adjustment' ? 'Adjustment' : 'Top-up'}
                      </span>
                      {/* title, not wrapping. Measured with real data: 31% of
                          "RM 50.00 as coupon (5×)" was cut at 1440px and 34%
                          at 390px, with no way to see the rest — and how many
                          coupons went out is exactly the sort of figure a
                          dealer queries later. Letting it wrap instead would
                          make the rows carrying a coupon taller than the rest
                          of this h-16 table, which is the uneven-row-heights
                          complaint this project already fixed once. Same
                          answer the dealer table reached: abbreviated is fine,
                          unrecoverable is not. */}
                      {tx.type === 'topup' && tx.coupon_rm > 0 && (
                        <div
                          className="truncate text-[12px] text-paper-dim"
                          title={`${formatMYR(tx.coupon_rm)} as coupon (${tx.coupon_rm / COUPON_DENOMINATION_RM}×)`}
                        >
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
                    <td className="td figure-money text-right" data-c="in">{formatMYR(tx.money_rm)}</td>
                    <td className="td figure-points text-right" data-c="out">{tx.points.toLocaleString()}</td>
                    <td className="td figure text-right text-paper-dim" data-c="rate">{tx.rate != null ? `${tx.rate}%` : '—'}</td>
                    <td className="td figure-money text-right" data-c="commission">{formatMYR(tx.commission_rm)}</td>
                    {/* Words, no dot. A status dot beside the Status column's
                        own status dot is two identical marks side by side
                        meaning different things, and it is most of what reads
                        as clutter on a pending row. Delivery is not the state
                        you act on from this page — /delivery is — so it drops to
                        plain text and keeps only the overdue count, which is
                        the part of it that is ever urgent. */}
                    <td className="td" data-c="delivery">
                      {tx.delivery_status === 'sent' ? (
                        <span className="text-[12px] text-paper-dim">Sent</span>
                      ) : tx.delivery_status === 'pending' ? (
                        <span className={`text-[12px] ${deliveryWarn ? 'font-semibold text-brass-bright' : 'text-paper-dim'}`}>
                          {deliveryWarn ? `Waiting ${deliveryDays}d` : 'Waiting'}
                        </span>
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
                    {/* .pin-end carries z-[2], which is what lifts these above
                        the dealer-name link's stretched ::after — that overlay
                        covers the whole row for click-to-open-dealer, and a
                        statically-positioned button underneath it would send a
                        click aimed at Verify to the dealer page instead. This
                        cell used to need `relative z-10` for that; being
                        sticky now does the same job. */}
                    <td className="td pin-end">
                      <RowActions
                        transactionId={tx.id}
                        status={tx.status}
                        type={tx.type}
                        isSelfRecorded={tx.recorded_by === user.id}
                        points={tx.points}
                        moneyRm={tx.money_rm}
                        rate={tx.rate}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DataGrid>
        </>
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
