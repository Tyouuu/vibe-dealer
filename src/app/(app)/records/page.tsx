import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange } from '@/lib/month'
import { verifyTransaction, flagTransaction } from './actions'

export const metadata: Metadata = {
  title: 'Transactions — DealerHub',
}

type TxRow = {
  id: string
  tx_date: string
  type: 'package' | 'topup'
  package: string | null
  points: number
  money_rm: number
  rate: number | null
  commission_rm: number
  sim_type: string | null
  delivery_status: string
  status: 'pending' | 'verified' | 'flagged'
  dealers: { company_name: string } | { company_name: string }[] | null
}

const DELIVERY_LABEL: Record<string, string> = {
  na: '—',
  pending: 'Pending',
  sent: 'Sent',
}

type PageProps = {
  searchParams: Promise<{ status?: string; submitted?: string; month?: string }>
}

export default async function RecordsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { status = 'all', submitted, month } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        Your role ({user.role}) does not have permission to view transactions.
      </div>
    )
  }

  const supabase = await createClient()
  let query = supabase
    .from('transactions')
    .select(
      'id, tx_date, type, package, points, money_rm, rate, commission_rm, sim_type, delivery_status, status, dealers(company_name)',
      { count: 'exact' }
    )
    .order('tx_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  if (month) {
    const { start, end } = monthRange(month)
    query = query.gte('tx_date', start).lte('tx_date', end)
  }

  const { data: rows, count } = await query

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      {submitted && (
        <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/50 px-3.5 py-2.5 text-sm text-emerald-300">
          Recorded! Status = pending — counts toward reconciliation/reports once verified.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold text-zinc-50">Transactions</h1>
        <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
          {count ?? 0} transactions
        </span>
      </div>

      <form className="mb-4 flex gap-3" action="/records" method="GET">
        <select
          name="status"
          defaultValue={status}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="flagged">Flagged</option>
        </select>
        <input
          type="month"
          name="month"
          defaultValue={month ?? ''}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Dealer</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">In (RM)</th>
              <th className="px-3 py-2.5">Out (pts)</th>
              <th className="px-3 py-2.5">Rate</th>
              <th className="px-3 py-2.5">Your 2%</th>
              <th className="px-3 py-2.5">Delivery</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {(rows as unknown as TxRow[] | null)?.map((tx) => {
              const dealerName = Array.isArray(tx.dealers) ? tx.dealers[0]?.company_name : tx.dealers?.company_name
              return (
                <tr key={tx.id} className="border-b border-zinc-800 last:border-none hover:bg-zinc-800/50">
                  <td className="px-3 py-2.5 text-zinc-400">{tx.tx_date}</td>
                  <td className="px-3 py-2.5 font-semibold text-zinc-100">{dealerName ?? '—'}</td>
                  <td className="px-3 py-2.5 text-zinc-300">
                    {tx.type === 'package' ? `Package ${tx.package}` : 'Top-up'}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-300">RM{tx.money_rm.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-zinc-300">{tx.points.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-zinc-300">{tx.rate != null ? `${tx.rate}%` : '—'}</td>
                  <td className="px-3 py-2.5 font-semibold text-amber-300">RM{tx.commission_rm.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-zinc-400">{DELIVERY_LABEL[tx.delivery_status] ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={
                        tx.status === 'verified'
                          ? 'rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400'
                          : tx.status === 'flagged'
                            ? 'rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-bold text-red-400'
                            : 'rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-300'
                      }
                    >
                      {tx.status === 'verified' ? 'Verified' : tx.status === 'flagged' ? 'Flagged' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {tx.status === 'pending' ? (
                      <div className="flex items-center gap-1.5">
                        <form action={verifyTransaction}>
                          <input type="hidden" name="id" value={tx.id} />
                          <button
                            type="submit"
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                          >
                            Verify ✓
                          </button>
                        </form>
                        <form action={flagTransaction}>
                          <input type="hidden" name="id" value={tx.id} />
                          <button
                            type="submit"
                            className="rounded-lg bg-red-600/80 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600"
                          >
                            Flag ✕
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {!rows?.length && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-zinc-500">
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
