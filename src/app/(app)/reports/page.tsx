import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange, currentMonth } from '@/lib/month'

export const metadata: Metadata = {
  title: '月度报表 — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ month?: string }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { month = currentMonth() } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        你的角色（{user.role}）没有查看月度报表的权限。
      </div>
    )
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
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <form className="flex items-center gap-3" action="/reports" method="GET">
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              查看
            </button>
          </form>
          <a
            href={`/api/reports/export?month=${month}`}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            ⤓ 导出 Excel (CSV)
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <Kpi label="本月 Total Top-up" value={`${totalPoints.toLocaleString()} pts`} />
          <Kpi label="你的 2%" value={`RM${totalCommission.toLocaleString()}`} gold />
          <Kpi label="交易笔数" value={String(rows?.length ?? 0)} />
          <Kpi label="活跃 dealer" value={String(breakdown.length)} />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-3.5 text-sm font-bold text-zinc-50">按 Dealer 汇总</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Dealer</th>
                <th className="px-3 py-2">本月 top-up</th>
                <th className="px-3 py-2">收到的钱 (RM)</th>
                <th className="px-3 py-2">你的 2%</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((d, i) => (
                <tr key={d.name + i} className="border-b border-zinc-800 last:border-none">
                  <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                  <td className="px-3 py-2 font-semibold text-zinc-100">{d.name}</td>
                  <td className="px-3 py-2 text-zinc-300">{d.points.toLocaleString()} pts</td>
                  <td className="px-3 py-2 text-zinc-300">RM{d.money.toLocaleString()}</td>
                  <td className="px-3 py-2 font-semibold text-amber-300">RM{d.commission.toLocaleString()}</td>
                </tr>
              ))}
              {!breakdown.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                    这个月还没有已核对的交易。
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

function Kpi({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-4">
      <div className="text-xs font-semibold text-zinc-400">{label}</div>
      <div className={`mt-1.5 text-2xl font-extrabold tracking-tight ${gold ? 'text-amber-300' : 'text-zinc-50'}`}>
        {value}
      </div>
    </div>
  )
}
