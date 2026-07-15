import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getYesterdaySummary } from '@/lib/reports/daily-summary'
import { todayInMalaysia } from '@/lib/month'
import { getDealerActivityMap, INACTIVE_DAYS_THRESHOLD, DELIVERY_STALLED_DAYS_THRESHOLD, PENDING_REVIEW_STALE_DAYS, daysSince } from '@/lib/dealer-activity'
import { PackageDistributionDonut, type PackageSegment } from './package-distribution-bar'
import { MonthlyTrendChart, type TrendRow } from './monthly-trend-chart'
import { RankingView } from './ranking-view'
import { IconTrendUp, IconCoin, IconUsers, IconAlertCircle, IconTruck, IconCheckCircle, ReconciledStamp } from '../icons'

export const metadata: Metadata = {
  title: 'Master Dashboard — DealerHub',
}

function monthsBack(n: number): { key: string; label: string }[] {
  const today = todayInMalaysia()
  const [y, m] = today.split('-').map(Number)
  const out: { key: string; label: string }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    out.push({ key, label })
  }
  return out
}

export default async function DashboardPage() {
  const user = await requireUser()

  if (user.role !== 'master') {
    return <div className="app-card text-sm text-paper-dim">Your role ({user.role}) does not have permission to view the dashboard.</div>
  }

  const supabase = await createClient()

  const today = todayInMalaysia()
  const monthStart = `${today.slice(0, 7)}-01`
  const currentMonthStr = today.slice(0, 7)
  const trendMonths = monthsBack(6)
  const trendStart = `${trendMonths[0].key}-01`

  const [
    { count: dealerCount },
    { data: pendingRows },
    { data: dealerRows },
    { data: trendTx },
    { data: deliveryPendingRows },
    { data: currentStatement },
    yesterdaySummary,
    activityMap,
  ] = await Promise.all([
    supabase.from('dealers').select('id', { count: 'exact', head: true }),
    supabase.from('transactions').select('id, tx_date').eq('status', 'pending'),
    supabase.from('dealers').select('id, company_name, package, region'),
    supabase
      .from('transactions')
      .select('dealer_id, tx_date, points, commission_rm, dealers(company_name, region)')
      .eq('status', 'verified')
      .gte('tx_date', trendStart)
      .lte('tx_date', today),
    supabase.from('delivery_queue').select('id, tx_date').eq('delivery_status', 'pending'),
    supabase.from('company_statements').select('reconciled').eq('month', monthStart).maybeSingle(),
    getYesterdaySummary(supabase),
    getDealerActivityMap(supabase),
  ])

  // trendTx already covers the whole 6-month window (which fully contains the
  // current month), so this month's totals/ranking are derived from it
  // instead of firing a second, overlapping query.
  const monthTx = (trendTx ?? []).filter((t) => t.tx_date >= monthStart)

  const totalPoints = monthTx.reduce((sum, t) => sum + Number(t.points), 0)
  const totalCommission = monthTx.reduce((sum, t) => sum + Number(t.commission_rm), 0)

  const byDealer = new Map<string, { name: string; points: number }>()
  for (const t of monthTx) {
    const rel = t.dealers as { company_name: string; region: string | null } | { company_name: string; region: string | null }[] | null
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
  // jade-chart/brass-chart/slate (not the -bright text tokens) — validated
  // for use as adjacent chart-mark fills, see globals.css. Each tier gets
  // its own hue (blue/green/gold) rather than sharing gray, so the ring
  // reads as colorful at a glance instead of "mostly neutral, one accent."
  const packageSegments: PackageSegment[] = [
    { key: 'A', label: 'Package A · 7%', count: pkgCounts.A, colorClass: 'bg-slate', stroke: 'var(--color-slate)' },
    { key: 'B', label: 'Package B · 7.5%', count: pkgCounts.B, colorClass: 'bg-jade-chart', stroke: 'var(--color-jade-chart)' },
    { key: 'C', label: 'Package C · 8%', count: pkgCounts.C, colorClass: 'bg-brass-chart', stroke: 'var(--color-brass-chart)' },
    { key: 'none', label: 'Not Set', count: pkgCounts.none, colorClass: 'bg-ink-700', stroke: 'var(--color-ink-700)' },
  ]

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

  // Monthly trend, split by region — bucket every verified tx into its month
  // + dealer region, defaulting every (month, region) pair to 0 so the chart
  // still draws a continuous 6-month axis even where a region had no activity.
  const regions = Array.from(new Set((dealerRows ?? []).map((d) => d.region).filter((r): r is string => r != null))).sort()
  const trendMap = new Map<string, number>() // `${month}|${region}` -> points
  for (const t of trendTx ?? []) {
    const monthKey = t.tx_date.slice(0, 7)
    const rel = t.dealers as { company_name: string; region: string | null } | { company_name: string; region: string | null }[] | null
    const region = (Array.isArray(rel) ? rel[0]?.region : rel?.region) ?? '(No Region)'
    const k = `${monthKey}|${region}`
    trendMap.set(k, (trendMap.get(k) ?? 0) + Number(t.points))
  }
  const trendRows: TrendRow[] = []
  for (const { key: monthKey, label } of trendMonths) {
    for (const region of regions) {
      trendRows.push({ month: monthKey, label, region, points: trendMap.get(`${monthKey}|${region}`) ?? 0 })
    }
  }

  // Delivery + reconciliation snapshots — the two statuses PROJECT_SPEC asked
  // the dashboard to surface, so master doesn't have to visit both pages to
  // know whether anything needs attention.
  const deliveryPending = deliveryPendingRows ?? []
  const deliveryStalled = deliveryPending.filter((r) => daysSince(r.tx_date) >= DELIVERY_STALLED_DAYS_THRESHOLD).length

  const pendingTx = pendingRows ?? []
  const pendingStale = pendingTx.filter((t) => daysSince(t.tx_date) >= PENDING_REVIEW_STALE_DAYS).length

  return (
    <div className="flex flex-col gap-5">
      <div className="docket-hero">
        <a href={`/records?status=verified&month=${currentMonthStr}`} className="docket-half group hover:bg-jade/[0.03]">
          <div className="docket-half-label">
            <span className="icon-badge icon-badge-jade h-7 w-7">
              <IconTrendUp className="h-4 w-4" />
            </span>
            Top-up This Month
          </div>
          <div className="figure-points mt-2.5 text-5xl font-semibold">
            {totalPoints.toLocaleString()} <span className="text-base font-semibold text-paper-dim">pts</span>
          </div>
        </a>
        <div className="docket-perforation" aria-hidden="true" />
        <a href={`/records?status=verified&month=${currentMonthStr}`} className="docket-half group hover:bg-brass/[0.03]">
          <div className="docket-half-label">
            <span className="icon-badge icon-badge-brass h-7 w-7">
              <IconCoin className="h-4 w-4" />
            </span>
            Your Commission (2%)
          </div>
          <div className="money-chip mt-3 text-4xl">RM {totalCommission.toLocaleString()}</div>
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatChip
          icon={<IconUsers />}
          iconColor="slate"
          label="Total Dealers"
          value={String(dealerCount ?? 0)}
          href="/dealers"
        />
        <StatChip
          icon={<IconAlertCircle />}
          iconColor="clay"
          label="Pending Review"
          value={String(pendingTx.length)}
          valueColor={pendingTx.length > 0 ? 'clay' : undefined}
          sub={pendingStale > 0 ? `${pendingStale} older than ${PENDING_REVIEW_STALE_DAYS}d` : undefined}
          subEmphasis
          href="/records?status=pending"
        />
        <StatChip
          icon={<IconTruck />}
          iconColor="slate"
          label="SIM Delivery"
          value={`${deliveryPending.length} pending`}
          href="/delivery"
          pill={
            deliveryStalled > 0 ? (
              <span className="pill pill-clay">{deliveryStalled} stalled</span>
            ) : (
              <span className="pill pill-jade">On track</span>
            )
          }
        />
        <StatChip
          icon={<IconCheckCircle />}
          iconColor={currentStatement?.reconciled ? 'jade' : 'brass'}
          label="Reconciliation"
          sub={currentMonthStr}
          value={currentStatement?.reconciled ? 'Reconciled' : 'Not yet'}
          href="/reconcile"
          stamp={currentStatement?.reconciled ? <ReconciledStamp sub={currentMonthStr} /> : undefined}
          pill={
            currentStatement?.reconciled ? undefined : (
              <span className="pill pill-brass">Action needed</span>
            )
          }
        />
      </div>

      <div className="app-card">
        <h3 className="mb-3.5 text-sm font-bold text-paper">Yesterday&apos;s Summary — {yesterdaySummary.date}</h3>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-paper-dim">
              <span className="timeline-dot timeline-dot-jade" />
              Yesterday&apos;s Total
            </div>
            <div className="figure-points mt-1 text-lg">{yesterdaySummary.points.toLocaleString()} pts</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-paper-dim">
              <span className="timeline-dot timeline-dot-brass" />
              Your 2%
            </div>
            <div className="figure-money mt-1 text-lg">RM {yesterdaySummary.commission.toLocaleString()}</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-paper-dim">
              <span className="timeline-dot timeline-dot-slate" />
              Most Active Dealer
            </div>
            <div className="mt-1 text-lg font-bold text-paper">
              {yesterdaySummary.mostActiveDealer ? yesterdaySummary.mostActiveDealer.name : '—'}
            </div>
          </div>
        </div>
        <p className="note-strip">This same summary is emailed to all masters every morning at 8am (Malaysia time).</p>
      </div>

      <div className="app-card">
        <h3 className="mb-3.5 text-sm font-bold text-paper">Monthly Top-up Trend</h3>
        <MonthlyTrendChart rows={trendRows} regions={regions} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="app-card">
          <h3 className="mb-3.5 text-sm font-bold text-paper">Dealer Ranking — This Month&apos;s Top-up</h3>
          {ranking.length ? (
            <RankingView items={ranking} />
          ) : (
            <p className="text-sm text-paper-dim">No verified transactions this month yet.</p>
          )}
        </div>

        <div className="app-card">
          <h3 className="mb-3.5 text-sm font-bold text-paper">Package Distribution</h3>
          <PackageDistributionDonut segments={packageSegments} total={dealerCount ?? 0} />
        </div>
      </div>

      <div className="app-card">
        <h3 className="mb-3.5 text-sm font-bold text-paper">Inactive Dealers — {INACTIVE_DAYS_THRESHOLD}+ days</h3>
        {inactiveDealers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="th">Dealer</th>
                  <th className="th text-right">Days Since Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {inactiveDealers.map((d) => (
                  <tr key={d.id} className="tr-row">
                    <td className="td">
                      <a href={`/dealers/${d.id}`} className="font-semibold text-paper hover:text-jade-bright">
                        {d.name}
                      </a>
                    </td>
                    <td className="td text-right">
                      <span className="pill pill-clay">{d.daysSinceLastActivity} days</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-paper-dim">No inactive dealers right now — everyone&apos;s been active recently.</p>
        )}
      </div>
    </div>
  )
}

function StatChip({
  label,
  value,
  valueColor,
  href,
  sub,
  subEmphasis,
  icon,
  iconColor = 'jade',
  pill,
  stamp,
}: {
  label: string
  value: string
  valueColor?: 'clay'
  href: string
  sub?: string
  subEmphasis?: boolean
  icon: React.ReactNode
  iconColor?: 'jade' | 'brass' | 'clay' | 'slate'
  pill?: React.ReactNode
  stamp?: React.ReactNode
}) {
  return (
    <a href={href} className="app-tile relative flex items-center gap-3 overflow-visible transition-colors hover:border-jade/50">
      <span className={`icon-badge icon-badge-${iconColor}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-paper-dim">{label}</div>
        <div className={`mt-0.5 text-lg font-bold ${valueColor === 'clay' ? 'text-clay-bright' : 'text-paper'}`}>{value}</div>
        {sub && <div className={`text-[11px] font-semibold ${subEmphasis ? 'text-clay-bright' : 'text-paper-dim'}`}>{sub}</div>}
      </div>
      {pill}
      {stamp && <div className="pointer-events-none absolute -right-3 -top-4">{stamp}</div>}
    </a>
  )
}
