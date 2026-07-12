import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

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
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        Your role ({user.role}) does not have permission to view the audit log.
      </div>
    )
  }

  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('transactions')
    .select(
      'id, tx_date, created_at, type, package, points, money_rm, status, recorded_by, verified_by, dealers(company_name)'
    )
    .order('created_at', { ascending: false })
    .limit(100)

  const txRows = (rows ?? []) as unknown as TxRow[]

  // recorded_by / verified_by are bare uuid columns with no FK to profiles
  // (transactions predates the profiles table — see 0001_profiles_and_rls.sql),
  // so PostgREST nested-select can't join them. Resolve names ourselves.
  const staffIds = new Set<string>()
  for (const tx of txRows) {
    if (tx.recorded_by) staffIds.add(tx.recorded_by)
    if (tx.verified_by) staffIds.add(tx.verified_by)
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold text-zinc-50">Audit Log</h1>
        <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
          Last {txRows.length} transactions
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2.5">Time</th>
              <th className="px-3 py-2.5">Dealer</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">In (RM)</th>
              <th className="px-3 py-2.5">Out (pts)</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Activity</th>
            </tr>
          </thead>
          <tbody>
            {txRows.map((tx) => {
              const dealerName = Array.isArray(tx.dealers) ? tx.dealers[0]?.company_name : tx.dealers?.company_name
              return (
                <tr key={tx.id} className="border-b border-zinc-800 last:border-none hover:bg-zinc-800/50">
                  <td className="px-3 py-2.5 text-zinc-400">{formatDateTime(tx.created_at)}</td>
                  <td className="px-3 py-2.5 font-semibold text-zinc-100">{dealerName ?? '—'}</td>
                  <td className="px-3 py-2.5 text-zinc-300">
                    {tx.type === 'package' ? `Package ${tx.package}` : 'Top-up'}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-300">RM{tx.money_rm.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-zinc-300">{tx.points.toLocaleString()}</td>
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
                    <div className="flex flex-col gap-0.5 text-xs text-zinc-400">
                      <span>
                        Recorded by <span className="font-semibold text-zinc-200">{displayName(tx.recorded_by)}</span>
                      </span>
                      {tx.status === 'verified' && (
                        <span className="text-emerald-400">
                          Verified by <span className="font-semibold">{displayName(tx.verified_by)}</span>
                        </span>
                      )}
                      {tx.status === 'flagged' && (
                        <span className="text-red-400">
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
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  No transactions recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
