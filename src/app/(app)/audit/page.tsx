import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { formatMonthLabel } from '@/lib/month'

export const metadata: Metadata = {
  title: 'Audit Log — DealerHub',
}

type TxRow = {
  id: string
  tx_date: string
  created_at: string
  type: 'package' | 'topup'
  package: string | null
  points: number
  money_rm: number
  status: 'pending' | 'verified' | 'flagged'
  recorded_by: string | null
  verified_by: string | null
  dealers: { company_name: string } | { company_name: string }[] | null
}

type RevisionRow = {
  id: string
  month: string
  company_total_points: number | null
  company_profit_rm: number | null
  note: string | null
  recorded_by: string | null
  created_at: string
}

type RateHistoryRow = {
  id: string
  old_package: string | null
  old_rate: number | null
  new_package: string | null
  new_rate: number | null
  changed_by: string | null
  created_at: string
  dealers: { company_name: string } | { company_name: string }[] | null
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AuditPage() {
  const user = await requireUser()

  if (user.role !== 'master') {
    return <div className="app-card text-sm text-paper-dim">Your role ({user.role}) does not have permission to view the audit log.</div>
  }

  const supabase = await createClient()

  const [{ data: rows }, { data: revisionRows }, { data: rateHistoryRows }] = await Promise.all([
    supabase
      .from('transactions')
      .select(
        'id, tx_date, created_at, type, package, points, money_rm, status, recorded_by, verified_by, dealers(company_name)'
      )
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('company_statement_revisions')
      .select('id, month, company_total_points, company_profit_rm, note, recorded_by, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('dealer_rate_history')
      .select('id, old_package, old_rate, new_package, new_rate, changed_by, created_at, dealers(company_name)')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const txRows = (rows ?? []) as unknown as TxRow[]
  const revisions = (revisionRows ?? []) as RevisionRow[]
  const rateHistory = (rateHistoryRows ?? []) as unknown as RateHistoryRow[]

  // recorded_by / verified_by / changed_by are bare uuid columns with no FK
  // to profiles (predates the profiles table — see 0001_profiles_and_rls.sql),
  // so PostgREST nested-select can't join them. Resolve names ourselves.
  // (dealer_id on dealer_rate_history IS a real FK, so that one nests fine.)
  const staffIds = new Set<string>()
  for (const tx of txRows) {
    if (tx.recorded_by) staffIds.add(tx.recorded_by)
    if (tx.verified_by) staffIds.add(tx.verified_by)
  }
  for (const rev of revisions) {
    if (rev.recorded_by) staffIds.add(rev.recorded_by)
  }
  for (const rh of rateHistory) {
    if (rh.changed_by) staffIds.add(rh.changed_by)
  }

  const { data: profiles } = staffIds.size
    ? await supabase.from('profiles').select('id, name, email').in('id', [...staffIds])
    : { data: [] }

  const nameById = new Map<string, string>()
  for (const p of profiles ?? []) {
    nameById.set(p.id, p.name ?? p.email ?? '—')
  }
  const displayName = (id: string | null) => (id ? (nameById.get(id) ?? '—') : '—')

  return (
    <div className="flex flex-col gap-5">
      <div className="app-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-base font-bold text-paper">Audit Log</h1>
          <span className="pill pill-neutral">Last {txRows.length} transactions</span>
        </div>
        <p className="note-strip">A read-only history of who did what — every transaction, reconciliation, and rate change, with who and when.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="th">Time</th>
                <th className="th">Dealer</th>
                <th className="th">Type</th>
                <th className="th text-right">In (RM)</th>
                <th className="th text-right">Out (pts)</th>
                <th className="th">Status</th>
                <th className="th">Activity</th>
              </tr>
            </thead>
            <tbody>
              {txRows.map((tx) => {
                const dealerName = Array.isArray(tx.dealers) ? tx.dealers[0]?.company_name : tx.dealers?.company_name
                return (
                  <tr key={tx.id} className="tr-row">
                    <td className="td text-paper-dim">{formatDateTime(tx.created_at)}</td>
                    <td className="td font-semibold text-paper">{dealerName ?? '—'}</td>
                    <td className="td text-paper-dim">{tx.type === 'package' ? `Buy Package ${tx.package}` : 'Regular Top-up'}</td>
                    <td className="td figure-money text-right">RM {tx.money_rm.toLocaleString()}</td>
                    <td className="td figure-points text-right">{tx.points.toLocaleString()}</td>
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
                      <div className="flex flex-col gap-0.5 text-xs text-paper-dim">
                        <span>
                          Recorded by <span className="font-semibold text-paper">{displayName(tx.recorded_by)}</span>
                        </span>
                        {tx.status === 'verified' && (
                          <span className="text-jade-bright">
                            Verified by <span className="font-semibold">{displayName(tx.verified_by)}</span>
                          </span>
                        )}
                        {tx.status === 'flagged' && (
                          <span className="text-clay-bright">
                            Flagged by <span className="font-semibold">{displayName(tx.verified_by)}</span>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!txRows.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-paper-dim">
                    No transactions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="app-card">
        <h2 className="mb-4 text-base font-bold text-paper">Reconciliation Activity</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="th">Time</th>
                <th className="th">Month</th>
                <th className="th text-right">Vibe Top-up (pts)</th>
                <th className="th text-right">Vibe Profit (RM)</th>
                <th className="th">Saved by</th>
                <th className="th">Note</th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((rev) => (
                <tr key={rev.id} className="tr-row">
                  <td className="td text-paper-dim">{formatDateTime(rev.created_at)}</td>
                  <td className="td font-semibold text-paper">{formatMonthLabel(rev.month)}</td>
                  <td className="td figure-points text-right">
                    {rev.company_total_points != null ? rev.company_total_points.toLocaleString() : '—'}
                  </td>
                  <td className="td figure-money text-right">
                    {rev.company_profit_rm != null ? `RM ${rev.company_profit_rm.toLocaleString()}` : '—'}
                  </td>
                  <td className="td text-paper">{displayName(rev.recorded_by)}</td>
                  <td className="td text-paper-dim">{rev.note ?? '—'}</td>
                </tr>
              ))}
              {!revisions.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-paper-dim">
                    No reconciliation saves logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="app-card">
        <h2 className="mb-4 text-base font-bold text-paper">Dealer Rate Changes</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="th">Time</th>
                <th className="th">Dealer</th>
                <th className="th">Before</th>
                <th className="th">After</th>
                <th className="th">Changed by</th>
              </tr>
            </thead>
            <tbody>
              {rateHistory.map((rh) => {
                const dealerName = Array.isArray(rh.dealers) ? rh.dealers[0]?.company_name : rh.dealers?.company_name
                const before = rh.old_package ? `${rh.old_package} · ${rh.old_rate}%` : 'Not Set'
                const after = rh.new_package ? `${rh.new_package} · ${rh.new_rate}%` : '—'
                return (
                  <tr key={rh.id} className="tr-row">
                    <td className="td text-paper-dim">{formatDateTime(rh.created_at)}</td>
                    <td className="td font-semibold text-paper">{dealerName ?? '—'}</td>
                    <td className="td text-paper-dim">{before}</td>
                    <td className="td text-paper">{after}</td>
                    <td className="td text-paper-dim">{displayName(rh.changed_by)}</td>
                  </tr>
                )
              })}
              {!rateHistory.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-paper-dim">
                    No rate changes logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
