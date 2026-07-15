import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange, currentMonth, todayInMalaysia, formatMonthLabel, formatDateLabel } from '@/lib/month'
import { IconTrendUp, IconCoin, IconUsers, IconCheckCircle } from '../icons'

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
  const totalMoney = breakdown.reduce((s, d) => s + d.money, 0)
  const totalCommission = breakdown.reduce((s, d) => s + d.commission, 0)
  const maxMoney = Math.max(...breakdown.map((d) => d.money), 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="app-card border-t-[3px] border-t-primary">
        <h1 className="text-2xl font-bold text-paper">Monthly Report</h1>
        <p className="mt-1 text-[11.5px] font-bold uppercase tracking-wide text-paper-dim">
          Generated {formatDateLabel(todayInMalaysia())} · Period: {formatMonthLabel(month)}
        </p>

        <div className="mb-4 mt-4 flex flex-wrap items-center justify-between gap-3">
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

        <div className="grid grid-cols-2 divide-x divide-y divide-ink-800 overflow-hidden rounded-2xl border border-ink-800 bg-ink-900 shadow-sm sm:grid-cols-4 sm:divide-y-0">
          <div className="p-4 sm:p-5">
            <div className="docket-half-label">
              <span className="icon-badge icon-badge-jade h-7 w-7">
                <IconTrendUp className="h-4 w-4" />
              </span>
              Total Top-up
            </div>
            <div className="figure-points mt-2 text-2xl font-semibold">
              {totalPoints.toLocaleString()} <span className="text-xs font-semibold text-paper-dim">pts</span>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="docket-half-label">
              <span className="icon-badge icon-badge-brass h-7 w-7">
                <IconCoin className="h-4 w-4" />
              </span>
              Your 2%
            </div>
            <div className="figure-money mt-2 text-2xl font-semibold">RM {totalCommission.toLocaleString()}</div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="docket-half-label">
              <span className="icon-badge icon-badge-slate h-7 w-7">
                <IconCheckCircle className="h-4 w-4" />
              </span>
              Transactions
            </div>
            <div className="mt-2 text-2xl font-semibold text-paper">{rows?.length ?? 0}</div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="docket-half-label">
              <span className="icon-badge icon-badge-slate h-7 w-7">
                <IconUsers className="h-4 w-4" />
              </span>
              Active Dealers
            </div>
            <div className="mt-2 text-2xl font-semibold text-paper">{breakdown.length}</div>
          </div>
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
              {breakdown.map((d, i) => {
                const pct = maxMoney > 0 ? Math.round((d.money / maxMoney) * 100) : 0
                return (
                  <tr key={d.name + i} className="tr-row">
                    <td className="td text-paper-dim">{i + 1}</td>
                    <td className="td font-semibold text-paper">{d.name}</td>
                    <td className="td figure-points text-right">{d.points.toLocaleString()} pts</td>
                    <td className="td figure relative text-right text-paper-dim">
                      <span className="absolute -left-1.5 bottom-[3px] top-[3px] rounded-md bg-primary-soft" style={{ width: `${pct}%` }} />
                      <span className="relative">RM {d.money.toLocaleString()}</span>
                    </td>
                    <td className="td figure-money text-right">RM {d.commission.toLocaleString()}</td>
                  </tr>
                )
              })}
              {breakdown.length > 0 && (
                <tr className="border-t-2 border-paper bg-ink-850/60 font-extrabold">
                  <td className="td" />
                  <td className="td text-paper">Total</td>
                  <td className="td figure-points text-right">{totalPoints.toLocaleString()} pts</td>
                  <td className="td figure text-right text-paper">RM {totalMoney.toLocaleString()}</td>
                  <td className="td figure-money text-right">RM {totalCommission.toLocaleString()}</td>
                </tr>
              )}
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
