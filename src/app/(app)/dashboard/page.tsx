import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getYesterdaySummary } from '@/lib/reports/daily-summary'
import { todayInMalaysia } from '@/lib/month'
import { getDealerActivityMap, INACTIVE_DAYS_THRESHOLD } from '@/lib/dealer-activity'

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
        Your role ({user.role}) does not have permission to view the dashboard.
      </div>
    )
  }

  const supabase = await createClient()

  const today = todayInMalaysia()
  const monthStart = `${today.slice(0, 7)}-01`
  const currentMonthStr = today.slice(0, 7)

  const [
    { count: dealerCount },
    { count: pendingCount },
    { data: monthTx },
    { data: dealerRows },
    yesterdaySummary,
    activityMap,
  ] = await Promise.all([
    supabase.from('dealers').select('id', { count: 'exact', head: true }),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('transactions')
      .select('dealer_id, points, commission_rm, dealers(company_name)')
      .eq('status', 'verified')
      .gte('tx_date', monthStart)
      .lte('tx_date', today),
    supabase.from('dealers').select('id, company_name, package'),
    getYesterdaySummary(supabase),
    getDealerActivityMap(supabase),
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
  for (const row of dealerRows ?? []) {
    const pkg = row.package as 'A' | 'B' | 'C' | null
    if (pkg === 'A' || pkg === 'B' || pkg === 'C') pkgCounts[pkg]++
    else pkgCounts.none++
  }

  const inactiveDealers = (dealerRows ?? [])
    .map((d) => {
      const activity = activityMap.get(d.id)
      return activity?.isInactive
        ? { id: d.id, name: d.company_name, daysSinceLastActivity: activity.daysSinceLastActivity }
        : null
    })
    .filter((d): d is { id: string; name: string; daysSinceLastActivity: number } => d !== null)
    .sort((a, b) => b.daysSinceLastActivity - a.daysSinceLastActivity)
    .slice(0, 10)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi
          label="🎟️ This Month's Total Top-up"
          value={`${totalPoints.toLocaleString()} pts`}
          href={`/records?status=verified&month=${currentMonthStr}`}
        />
        <Kpi
          label="⭐ Your Commission (2%)"
          value={`RM${totalCommission.toLocaleString()}`}
          gold
          href={`/records?status=verified&month=${currentMonthStr}`}
        />
        <Kpi label="👥 Total Dealers" value={String(dealerCount ?? 0)} href="/dealers" />
        <Kpi label="📋 Pending Review" value={String(pendingCount ?? 0)} amber href="/records?status=pending" />
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-3.5 text-sm font-bold text-zinc-50">🌅 Yesterday&apos;s Summary ({yesterdaySummary.date})</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-zinc-500">Yesterday&apos;s Total</div>
            <div className="mt-1 text-lg font-bold text-zinc-100">{yesterdaySummary.points.toLocaleString()} pts</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Your 2%</div>
            <div className="mt-1 text-lg font-bold text-amber-300">RM{yesterdaySummary.commission.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Most Active Dealer</div>
            <div className="mt-1 text-lg font-bold text-zinc-100">
              {yesterdaySummary.mostActiveDealer ? yesterdaySummary.mostActiveDealer.name : '—'}
            </div>
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-zinc-800/60 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-400">
          This same summary is emailed to all masters every morning at 8am (Malaysia time).
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="mb-3.5 text-sm font-bold text-zinc-50">🏆 Dealer Ranking (This Month&apos;s Top-up)</h3>
          {ranking.length ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Dealer</th>
                  <th className="px-3 py-2">This Month&apos;s Top-up</th>
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
            <p className="text-sm text-zinc-500">No verified transactions this month yet.</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="mb-3.5 text-sm font-bold text-zinc-50">📦 Package Distribution</h3>
          <div className="flex flex-col gap-2.5 text-sm">
            <PkgRow label="Package A" count={pkgCounts.A} style={PACKAGE_STYLE.A} />
            <PkgRow label="Package B" count={pkgCounts.B} style={PACKAGE_STYLE.B} />
            <PkgRow label="Package C" count={pkgCounts.C} style={PACKAGE_STYLE.C} />
            <PkgRow label="Not Set" count={pkgCounts.none} style="text-zinc-600" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-3.5 text-sm font-bold text-zinc-50">
          ⚠️ Inactive Dealers ({INACTIVE_DAYS_THRESHOLD}+ days)
        </h3>
        {inactiveDealers.length ? (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2">Dealer</th>
                <th className="px-3 py-2">Days Since Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {inactiveDealers.map((d) => (
                <tr key={d.id} className="border-b border-zinc-800 last:border-none hover:bg-zinc-800/50">
                  <td className="px-3 py-2">
                    <a href={`/dealers/${d.id}`} className="font-semibold text-zinc-100 hover:text-violet-400">
                      {d.name}
                    </a>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-bold text-red-400">
                      {d.daysSinceLastActivity} days
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500">No inactive dealers right now — everyone&apos;s been active recently.</p>
        )}
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  gold,
  amber,
  href,
}: {
  label: string
  value: string
  gold?: boolean
  amber?: boolean
  href?: string
}) {
  const content = (
    <>
      <div className="text-xs font-semibold text-zinc-400">{label}</div>
      <div
        className={`mt-1.5 text-2xl font-extrabold tracking-tight ${
          gold ? 'text-amber-300' : amber ? 'text-amber-300' : 'text-zinc-50'
        }`}
      >
        {value}
      </div>
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        className="block rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-4 transition-colors hover:border-violet-500"
      >
        {content}
      </a>
    )
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-4">
      {content}
    </div>
  )
}

function PkgRow({ label, count, style }: { label: string; count: number; style: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-zinc-800 pb-2.5 last:border-none">
      <span className={style}>{label}</span>
      <b className="text-zinc-100">{count} dealers</b>
    </div>
  )
}
