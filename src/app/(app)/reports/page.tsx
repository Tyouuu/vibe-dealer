import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange, currentMonth } from '@/lib/month'

export const metadata: Metadata = {
  title: 'Monthly Report — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ month?: string }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { month = currentMonth() } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <div className="app-card text-sm text-paper-dim">Your role ({user.role}) does not have permission to view monthly reports.</div>
  }

  const { start, end } = monthRange(month)
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('transactions')
    .select('dealer_id, points, money_rm, commission_rm, dealers(company_name)')
    .eq('status', 'verified')
    .gte('tx_date', start)
    .lte('tx_date', end)

  const byDealer = new Map<string, { name: string; points: number; money: number; commission: number }>()
  for (const t of rows ?? []) {
    const rel = t.dealers as { company_name: string } | { company_name: string }[] | null
    const name = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    const prev = byDealer.get(t.dealer_id) ?? { name, points: 0, money: 0, commission: 0 }
    prev.points += Number(t.points)
    prev.money += Number(t.money_rm)
    prev.commission += Number(t.commission_rm)
    byDealer.set(t.dealer_id, prev)
  }

  const breakdown = [...byDealer.values()].sort((a, b) => b.points - a.points)
  const totalPoints = breakdown.reduce((s, d) => s + d.points, 0)
  const totalCommission = breakdown.reduce((s, d) => s + d.commission, 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="app-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <form className="flex items-center gap-3" action="/reports" method="GET">
            <input type="month" name="month" defaultValue={month} className="field-input w-auto" />
            <button type="submit" className="btn-primary">
              View
            </button>
          </form>
          <a href={`/api/reports/export?month=${month}`} className="btn-ghost">
            ⤓ Export Excel (CSV)
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <Kpi label="This Month's Total Top-up" value={`${totalPoints.toLocaleString()} pts`} unit="points" />
          <Kpi label="Your 2%" value={`RM ${totalCommission.toLocaleString()}`} unit="money" />
          <Kpi label="Transactions" value={String(rows?.length ?? 0)} />
          <Kpi label="Active Dealers" value={String(breakdown.length)} />
        </div>
      </div>

      <div className="app-card">
        <h3 className="mb-3.5 text-sm font-bold text-paper">By Dealer</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="th">#</th>
                <th className="th">Dealer</th>
                <th className="th text-right">This Month&apos;s Top-up</th>
                <th className="th text-right">Money Collected (RM)</th>
                <th className="th text-right">Your 2%</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((d, i) => (
                <tr key={d.name + i} className="tr-row">
                  <td className="td text-paper-dim">{i + 1}</td>
                  <td className="td font-semibold text-paper">{d.name}</td>
                  <td className="td figure-points text-right">{d.points.toLocaleString()} pts</td>
                  <td className="td figure text-right text-paper-dim">RM {d.money.toLocaleString()}</td>
                  <td className="td figure-money text-right">RM {d.commission.toLocaleString()}</td>
                </tr>
              ))}
              {!breakdown.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-paper-dim">
                    No verified transactions this month yet.
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

function Kpi({ label, value, unit }: { label: string; value: string; unit?: 'money' | 'points' }) {
  const valueStyle = unit === 'money' ? 'figure-money' : unit === 'points' ? 'figure-points' : 'text-paper'
  return (
    <div className="app-tile ticket-tile">
      <div className="text-xs font-semibold text-paper-dim">{label}</div>
      <div className={`mt-1.5 text-2xl font-extrabold tracking-tight ${valueStyle}`}>{value}</div>
    </div>
  )
}
