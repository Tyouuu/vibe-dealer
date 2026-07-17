import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange } from '@/lib/month'
import { daysSince, DELIVERY_WARN_DAYS_THRESHOLD } from '@/lib/dealer-activity'
import { verifyTransaction } from './actions'
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
  sim_type: string | null
  delivery_status: 'na' | 'pending' | 'sent'
  status: 'pending' | 'verified' | 'flagged'
  dealers:
    | { company_name: string; package: string | null }
    | { company_name: string; package: string | null }[]
    | null
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
  }>
}

export default async function RecordsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { status = 'all', submitted, adjusted, error, month, q = '', sort = 'desc' } = await searchParams
  const sortAscending = sort === 'asc'

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <div className="app-card text-sm text-paper-dim">Your role ({user.role}) does not have permission to view transactions.</div>
  }

  const supabase = await createClient()
  let query = supabase
    .from('transactions')
    .select(
      'id, dealer_id, tx_date, type, package, points, money_rm, rate, commission_rm, sim_type, delivery_status, status, dealers(company_name, package)',
      { count: 'exact' }
    )
    .order('tx_date', { ascending: sortAscending })
    .order('created_at', { ascending: sortAscending })
    .limit(200)

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  if (month) {
    const { start, end } = monthRange(month)
    query = query.gte('tx_date', start).lte('tx_date', end)
  }

  const safeQ = q.replace(/[,()%]/g, '').trim()
  if (safeQ) {
    // Filter on the joined dealers table by resolving matching dealer ids first,
    // then narrowing transactions with .in() — a real server-side query, not a
    // client-side filter over the fetched page.
    const { data: matchingDealers } = await supabase.from('dealers').select('id').ilike('company_name', `%${safeQ}%`)
    const dealerIds = (matchingDealers ?? []).map((d) => d.id)
    query = query.in('dealer_id', dealerIds.length ? dealerIds : ['00000000-0000-0000-0000-000000000000'])
  }

  const { data: rows, count } = await query
  const pageRows = (rows as unknown as TxRow[] | null) ?? []
  const pendingCount = pageRows.filter((r) => r.status === 'pending').length
  const verifiedCount = pageRows.filter((r) => r.status === 'verified').length
  const flaggedCount = pageRows.filter((r) => r.status === 'flagged').length
  const pageCommission = pageRows.reduce((s, r) => s + Number(r.commission_rm), 0)

  function buildHref(overrides: { sort?: string }) {
    const params = new URLSearchParams()
    if (status !== 'all') params.set('status', status)
    if (month) params.set('month', month)
    if (q) params.set('q', q)
    const nextSort = overrides.sort ?? sort
    if (nextSort !== 'desc') params.set('sort', nextSort)
    const qs = params.toString()
    return `/records${qs ? `?${qs}` : ''}`
  }

  const exportParams = new URLSearchParams()
  if (status !== 'all') exportParams.set('status', status)
  if (month) exportParams.set('month', month)
  if (q) exportParams.set('q', q)
  if (sort !== 'desc') exportParams.set('sort', sort)
  const exportHref = `/api/records/export${exportParams.toString() ? `?${exportParams.toString()}` : ''}`

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
          {count != null && count > 200
            ? `Showing 200 of ${count} transactions — narrow with a filter to see more`
            : `${count ?? 0} transactions`}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-wrap items-center gap-3" action="/records" method="GET">
          <label className="mini-search w-64 max-w-full">
            <IconSearch className="h-4 w-4 shrink-0 text-paper-dim" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search by dealer company name"
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
            <MonthPicker name="month" defaultValue={month ?? ''} placeholder="All months" allowClear />
          </div>
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
          Pending <b>{pendingCount}</b>
        </span>
        <span className="txn-summary-item">
          <span className="status-dot" style={{ background: 'var(--color-jade-bright)' }} />
          Verified <b>{verifiedCount}</b>
        </span>
        <span className="txn-summary-item">
          <span className="status-dot" style={{ background: 'var(--color-clay-bright)' }} />
          Flagged <b>{flaggedCount}</b>
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
              const dealerPackage = dealerRel?.package ?? null
              const statusColor =
                tx.status === 'verified' ? 'jade-bright' : tx.status === 'flagged' ? 'clay-bright' : 'brass-bright'
              const statusLabel = tx.status === 'verified' ? 'Verified' : tx.status === 'flagged' ? 'Flagged' : 'Pending'
              const deliveryDays = tx.delivery_status === 'pending' ? daysSince(tx.tx_date) : 0
              const deliveryWarn = tx.delivery_status === 'pending' && deliveryDays >= DELIVERY_WARN_DAYS_THRESHOLD
              return (
                <tr key={tx.id} className="tr-row relative">
                  <td className="td text-paper-dim">{tx.tx_date}</td>
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={dealerName ?? '?'} size={24} package={dealerPackage} />
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
                  </td>
                  <td className="td">
                    {tx.status === 'pending' ? (
                      <div className="flex items-center gap-1.5">
                        <form action={verifyTransaction}>
                          <input type="hidden" name="id" value={tx.id} />
                          <button type="submit" className="btn-jade">
                            Verify ✓
                          </button>
                        </form>
                        <FlagButton transactionId={tx.id} />
                      </div>
                    ) : tx.status === 'verified' && tx.type !== 'adjustment' ? (
                      <AdjustButton transactionId={tx.id} currentPoints={tx.points} currentMoneyRm={tx.money_rm} />
                    ) : (
                      <span className="text-paper-dim/50">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {!rows?.length && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-paper-dim">
                  No matching transactions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
