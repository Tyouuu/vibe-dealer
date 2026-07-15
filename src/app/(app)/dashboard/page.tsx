import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { todayInMalaysia } from '@/lib/month'
import { DELIVERY_STALLED_DAYS_THRESHOLD, PENDING_REVIEW_STALE_DAYS, daysSince } from '@/lib/dealer-activity'
import { MonthlyTrendChart, type TrendRow } from './monthly-trend-chart'
import { RecentTransactionsTable, type RecentTxRow } from './recent-transactions-table'
import { IconTrendUp, IconCoin, IconUsers, IconAlertCircle, IconTruck, IconCheckCircle, ReconciledStamp } from '../icons'

// null means "no meaningful baseline" (previous period was 0) — callers must
// skip rendering the chg badge rather than show a divide-by-zero NaN/Infinity.
function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null
  return ((curr - prev) / prev) * 100
}

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
    { count: dealerCountLastMonth },
    { data: pendingRows },
    { data: dealerRows },
    { data: trendTx },
    { data: deliveryPendingRows },
    { data: currentStatement },
    { data: recentTxRows },
  ] = await Promise.all([
    supabase.from('dealers').select('id', { count: 'exact', head: true }),
    // "last month end" baseline for the Total Dealers chg badge — dealers
    // created before this month started, i.e. how many existed as of last
    // month's close.
    supabase.from('dealers').select('id', { count: 'exact', head: true }).lt('created_at', monthStart),
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
    supabase
      .from('transactions')
      .select('id, tx_date, type, package, points, money_rm, status, dealers(company_name)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  // trendTx already covers the whole 6-month window (which fully contains the
  // current month), so this month's totals/ranking are derived from it
  // instead of firing a second, overlapping query.
  const monthTx = (trendTx ?? []).filter((t) => t.tx_date >= monthStart)

  const totalPoints = monthTx.reduce((sum, t) => sum + Number(t.points), 0)
  const totalCommission = monthTx.reduce((sum, t) => sum + Number(t.commission_rm), 0)

  // "vs last month" chg badges — trendTx already spans the trailing 6 months
  // (see comment below), so last month's totals come from the same fetch
  // rather than a second query.
  const prevMonthKey = trendMonths[trendMonths.length - 2].key
  const prevMonthTx = (trendTx ?? []).filter((t) => t.tx_date.slice(0, 7) === prevMonthKey)
  const prevMonthPoints = prevMonthTx.reduce((sum, t) => sum + Number(t.points), 0)
  const prevMonthCommission = prevMonthTx.reduce((sum, t) => sum + Number(t.commission_rm), 0)

  const pointsChg = pctChange(totalPoints, prevMonthPoints)
  const commissionChg = pctChange(totalCommission, prevMonthCommission)
  const dealerChg = pctChange(dealerCount ?? 0, dealerCountLastMonth ?? 0)

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

  // Growth by Region — this month's verified points, grouped by dealer
  // region, as a share of the month total. Reuses monthTx (already fetched
  // above) instead of firing another query. Top 4 by points, each ranked
  // slot gets its own categorical (not status) color.
  const REGION_GROWTH_COLORS = ['var(--color-info)', 'var(--color-jade)', 'var(--color-clay)', 'var(--color-brass)']
  const regionPointsMap = new Map<string, number>()
  for (const t of monthTx) {
    const rel = t.dealers as { company_name: string; region: string | null } | { company_name: string; region: string | null }[] | null
    const region = (Array.isArray(rel) ? rel[0]?.region : rel?.region) ?? '(No Region)'
    regionPointsMap.set(region, (regionPointsMap.get(region) ?? 0) + Number(t.points))
  }
  const regionGrowth = [...regionPointsMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([region, points], i) => ({
      region,
      points,
      pct: totalPoints ? Math.round((points / totalPoints) * 100) : 0,
      color: REGION_GROWTH_COLORS[i],
    }))

  // Recent Transactions — last 10 by created_at, any status. The dealer-name
  // filter below is client-side (see recent-transactions-table.tsx) since
  // it's just narrowing this already-fetched small batch, not a new query.
  const recentTransactions: RecentTxRow[] = (recentTxRows ?? []).map((t) => {
    const rel = t.dealers as { company_name: string } | { company_name: string }[] | null
    const dealerName = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    return {
      id: t.id,
      tx_date: t.tx_date,
      type: t.type as 'package' | 'topup',
      package: t.package as string | null,
      points: Number(t.points),
      money_rm: Number(t.money_rm),
      status: t.status as 'pending' | 'verified' | 'flagged',
      dealerName,
    }
  })

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
          <ChgBadge pct={pointsChg} className="mt-2.5" />
        </a>
        <div className="docket-perforation" aria-hidden="true" />
        <a href={`/records?status=verified&month=${currentMonthStr}`} className="docket-half group hover:bg-brass/[0.03]">
          <div className="docket-half-label">
            <span className="icon-badge icon-badge-brass h-7 w-7">
              <IconCoin className="h-4 w-4" />
            </span>
            Your Commission (2%)
          </div>
          <div className="figure-money mt-2.5 text-5xl font-semibold">RM {totalCommission.toLocaleString()}</div>
          <ChgBadge pct={commissionChg} className="mt-2.5" />
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatChip
          icon={<IconUsers />}
          iconColor="slate"
          label="Total Dealers"
          value={String(dealerCount ?? 0)}
          href="/dealers"
          chg={<ChgBadge pct={dealerChg} />}
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
        <h3 className="mb-3.5 text-sm font-bold text-paper">Recent Transactions</h3>
        <RecentTransactionsTable rows={recentTransactions} />
      </div>

      <div className="app-card">
        <h3 className="mb-3.5 text-sm font-bold text-paper">Monthly Top-up Trend</h3>
        <MonthlyTrendChart rows={trendRows} regions={regions} />
      </div>

      <div className="app-card">
        <h3 className="mb-1 text-sm font-bold text-paper">Growth by Region</h3>
        <p className="mb-3.5 text-xs text-paper-dim">Share of this month&apos;s verified top-up points, top {regionGrowth.length || 0} region{regionGrowth.length === 1 ? '' : 's'}.</p>
        {regionGrowth.length ? (
          <div className="flex flex-wrap gap-2.5">
            {regionGrowth.map((r) => (
              <span key={r.region} className="region-chip">
                <span className="swatch" style={{ background: r.color }} />
                {r.region} {r.pct}%
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-paper-dim">No verified transactions this month yet.</p>
        )}
      </div>

    </div>
  )
}

// Renders nothing when pct is null — the caller (page-level pctChange) uses
// null to mean "no meaningful last-period baseline," which must stay silent
// rather than render 0%/NaN/Infinity.
function ChgBadge({ pct, className = '' }: { pct: number | null; className?: string }) {
  if (pct === null) return null
  const rounded = Math.round(pct * 10) / 10
  if (rounded === 0) {
    return (
      <span className={`chg chg-warn w-fit ${className}`} title="vs last month">
        → 0.0%
      </span>
    )
  }
  return (
    <span className={`chg ${rounded > 0 ? 'chg-up' : 'chg-down'} w-fit ${className}`} title="vs last month">
      {rounded > 0 ? '↑' : '↓'} {Math.abs(rounded).toFixed(1)}%
    </span>
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
  chg,
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
  chg?: React.ReactNode
}) {
  return (
    <a href={href} className="app-tile relative flex items-center gap-3 overflow-visible transition-colors hover:border-jade/50">
      <span className={`icon-badge icon-badge-${iconColor}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-paper-dim">{label}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className={`mt-0.5 text-lg font-bold ${valueColor === 'clay' ? 'text-clay-bright' : 'text-paper'}`}>{value}</div>
          {chg}
        </div>
        {sub && <div className={`text-[11px] font-semibold ${subEmphasis ? 'text-clay-bright' : 'text-paper-dim'}`}>{sub}</div>}
      </div>
      {pill}
      {stamp && <div className="pointer-events-none absolute -right-3 -top-4">{stamp}</div>}
    </a>
  )
}
