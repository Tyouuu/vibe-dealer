import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Master Dashboard — DealerHub',
}

const PACKAGE_STYLE: Record<string, string> = {
  A: 'text-zinc-300',
  B: 'text-emerald-400',
  C: 'text-amber-300',
}

export default async function DashboardPage() {
  const user = await requireUser()

  if (user.role !== 'master') {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        你的角色（{user.role}）没有查看 Dashboard 的权限。
      </div>
    )
  }

  const supabase = await createClient()

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [{ count: dealerCount }, { count: pendingCount }, { data: monthTx }, { data: pkgRows }, { data: yesterdayTx }] =
    await Promise.all([
      supabase.from('dealers').select('id', { count: 'exact', head: true }),
      supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase
        .from('transactions')
        .select('dealer_id, points, commission_rm, dealers(company_name)')
        .eq('status', 'verified')
        .gte('tx_date', monthStart)
        .lte('tx_date', today),
      supabase.from('dealers').select('package'),
      supabase
        .from('transactions')
        .select('dealer_id, points, commission_rm, dealers(company_name)')
        .eq('status', 'verified')
        .eq('tx_date', yesterday),
    ])

  const totalPoints = (monthTx ?? []).reduce((sum, t) => sum + Number(t.points), 0)
  const totalCommission = (monthTx ?? []).reduce((sum, t) => sum + Number(t.commission_rm), 0)

  const byDealer = new Map<string, { name: string; points: number }>()
  for (const t of monthTx ?? []) {
    const rel = t.dealers as { company_name: string } | { company_name: string }[] | null
    const name = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    const prev = byDealer.get(t.dealer_id) ?? { name, points: 0 }
    prev.points += Number(t.points)
    byDealer.set(t.dealer_id, prev)
  }
  const ranking = [...byDealer.values()].sort((a, b) => b.points - a.points).slice(0, 10)

  const pkgCounts = { A: 0, B: 0, C: 0, none: 0 }
  for (const row of pkgRows ?? []) {
    const pkg = row.package as 'A' | 'B' | 'C' | null
    if (pkg === 'A' || pkg === 'B' || pkg === 'C') pkgCounts[pkg]++
    else pkgCounts.none++
  }

  const yesterdayPoints = (yesterdayTx ?? []).reduce((s, t) => s + Number(t.points), 0)
  const yesterdayCommission = (yesterdayTx ?? []).reduce((s, t) => s + Number(t.commission_rm), 0)
  const yesterdayByDealer = new Map<string, { name: string; points: number }>()
  for (const t of yesterdayTx ?? []) {
    const rel = t.dealers as { company_name: string } | { company_name: string }[] | null
    const name = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    const prev = yesterdayByDealer.get(t.dealer_id) ?? { name, points: 0 }
    prev.points += Number(t.points)
    yesterdayByDealer.set(t.dealer_id, prev)
  }
  const mostActiveYesterday = [...yesterdayByDealer.values()].sort((a, b) => b.points - a.points)[0] ?? null

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi label="🎟️ 本月 Total Top-up" value={`${totalPoints.toLocaleString()} pts`} />
        <Kpi label="⭐ 你的 Commission (2%)" value={`RM${totalCommission.toLocaleString()}`} gold />
        <Kpi label="👥 Dealer 总数" value={String(dealerCount ?? 0)} />
        <Kpi label="📋 待核对" value={String(pendingCount ?? 0)} amber />
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-3.5 text-sm font-bold text-zinc-50">🌅 昨日摘要（{yesterday}）</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-zinc-500">昨日总额</div>
            <div className="mt-1 text-lg font-bold text-zinc-100">{yesterdayPoints.toLocaleString()} pts</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">你的 2%</div>
            <div className="mt-1 text-lg font-bold text-amber-300">RM{yesterdayCommission.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">最活跃 dealer</div>
            <div className="mt-1 text-lg font-bold text-zinc-100">
              {mostActiveYesterday ? mostActiveYesterday.name : '—'}
            </div>
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-zinc-800/60 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-400">
          这是每日报告的数据部分（页面上看）。要每天早上自动发邮件/通知给你，还需要接一个邮件服务（例如
          Resend）+ 定时任务，这块还没做——需要的话告诉我。
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="mb-3.5 text-sm font-bold text-zinc-50">🏆 Dealer 排行（本月 top-up）</h3>
          {ranking.length ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Dealer</th>
                  <th className="px-3 py-2">本月 top-up</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((d, i) => (
                  <tr key={d.name + i} className="border-b border-zinc-800 last:border-none">
                    <td className="px-3 py-2">
                      <span
                        className={`grid h-6 w-6 place-items-center rounded-md text-xs font-extrabold ${
                          i < 3 ? 'bg-amber-400/20 text-amber-300' : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-semibold text-zinc-100">{d.name}</td>
                    <td className="px-3 py-2 text-zinc-300">{d.points.toLocaleString()} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-zinc-500">本月还没有已核对的交易。</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="mb-3.5 text-sm font-bold text-zinc-50">📦 套餐分布</h3>
          <div className="flex flex-col gap-2.5 text-sm">
            <PkgRow label="Package A" count={pkgCounts.A} style={PACKAGE_STYLE.A} />
            <PkgRow label="Package B" count={pkgCounts.B} style={PACKAGE_STYLE.B} />
            <PkgRow label="Package C" count={pkgCounts.C} style={PACKAGE_STYLE.C} />
            <PkgRow label="未设定" count={pkgCounts.none} style="text-zinc-600" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, gold, amber }: { label: string; value: string; gold?: boolean; amber?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-4">
      <div className="text-xs font-semibold text-zinc-400">{label}</div>
      <div
        className={`mt-1.5 text-2xl font-extrabold tracking-tight ${
          gold ? 'text-amber-300' : amber ? 'text-amber-300' : 'text-zinc-50'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function PkgRow({ label, count, style }: { label: string; count: number; style: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-zinc-800 pb-2.5 last:border-none">
      <span className={style}>{label}</span>
      <b className="text-zinc-100">{count} 家</b>
    </div>
  )
}
