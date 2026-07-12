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
    return <div className="app-card text-sm text-paper-dim">Your role ({user.role}) does not have permission to view transactions.</div>
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
    <div className="app-card">
      {submitted && (
        <div className="alert alert-ok">Recorded! Status = pending — counts toward reconciliation/reports once verified.</div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold text-paper">Transactions</h1>
        <span className="pill pill-neutral">{count ?? 0} transactions</span>
      </div>

      <form className="mb-4 flex gap-3" action="/records" method="GET">
        <select name="status" defaultValue={status} className="field-input w-auto">
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="flagged">Flagged</option>
        </select>
        <input type="month" name="month" defaultValue={month ?? ''} className="field-input w-auto" />
        <button type="submit" className="btn-primary">
          Filter
        </button>
      </form>

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
            {(rows as unknown as TxRow[] | null)?.map((tx) => {
              const dealerName = Array.isArray(tx.dealers) ? tx.dealers[0]?.company_name : tx.dealers?.company_name
              return (
                <tr key={tx.id} className="tr-row">
                  <td className="td text-paper-dim">{tx.tx_date}</td>
                  <td className="td font-semibold text-paper">{dealerName ?? '—'}</td>
                  <td className="td text-paper-dim">{tx.type === 'package' ? `Package ${tx.package}` : 'Top-up'}</td>
                  <td className="td figure-money text-right">RM {tx.money_rm.toLocaleString()}</td>
                  <td className="td figure-points text-right">{tx.points.toLocaleString()}</td>
                  <td className="td figure text-right text-paper-dim">{tx.rate != null ? `${tx.rate}%` : '—'}</td>
                  <td className="td figure-money text-right">RM {tx.commission_rm.toLocaleString()}</td>
                  <td className="td text-paper-dim">{DELIVERY_LABEL[tx.delivery_status] ?? '—'}</td>
                  <td className="td">
                    <span
                      className={
                        tx.status === 'verified' ? 'pill pill-jade' : tx.status === 'flagged' ? 'pill pill-clay' : 'pill pill-brass'
                      }
                    >
                      {tx.status === 'verified' ? 'Verified' : tx.status === 'flagged' ? 'Flagged' : 'Pending'}
                    </span>
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
                        <form action={flagTransaction}>
                          <input type="hidden" name="id" value={tx.id} />
                          <button type="submit" className="btn-clay">
                            Flag ✕
                          </button>
                        </form>
                      </div>
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
