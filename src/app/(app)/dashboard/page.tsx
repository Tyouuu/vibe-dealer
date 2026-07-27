import type { Metadata } from 'next'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { todayInMalaysia } from '@/lib/month'
import {
  daysSince,
  getDealerActivityMap,
  DELIVERY_WARN_DAYS_THRESHOLD,
  DELIVERY_STALLED_DAYS_THRESHOLD,
  PENDING_REVIEW_STALE_DAYS,
} from '@/lib/dealer-activity'
import { getAvailablePointsBalance, LOW_BALANCE_THRESHOLD } from '@/lib/credit-balance'
import { MonthlyTrendChart, type TrendRow } from './monthly-trend-chart'
import { RecentTransactionsTable, type RecentTxRow } from './recent-transactions-table'
import { RegionGrowthCard } from './growth-map'
import { DeliveryTable, type DeliveryRow } from '../delivery/delivery-table'
import { IconTrendUp, IconCoin, IconUsers, IconCheckCircle, IconAlertCircle, IconTruck, ReconciledStamp } from '../icons'

// null means "no meaningful baseline" (previous period was 0) — callers must
// skip rendering the chg badge rather than show a divide-by-zero NaN/Infinity.
function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null
  return ((curr - prev) / prev) * 100
}

export const metadata: Metadata = {
  title: 'Dashboard — DealerHub',
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

type DealerRegionRel = { region: string | null } | { region: string | null }[] | null

function regionOf(rel: DealerRegionRel): string {
  return (Array.isArray(rel) ? rel[0]?.region : rel?.region) ?? '(No Region)'
}

// Shared by master + accountant (both chart the same 6-month top-up trend,
// split by dealer region) so the bucketing logic lives in one place.
function buildTrendRows(
  trendTx: { tx_date: string; points: number | string; dealers: DealerRegionRel }[],
  trendMonths: { key: string; label: string }[],
  regions: string[]
): TrendRow[] {
  const map = new Map<string, number>()
  for (const t of trendTx) {
    const monthKey = t.tx_date.slice(0, 7)
    const k = `${monthKey}|${regionOf(t.dealers)}`
    map.set(k, (map.get(k) ?? 0) + Number(t.points))
  }
  const rows: TrendRow[] = []
  for (const { key: monthKey, label } of trendMonths) {
    for (const region of regions) {
      rows.push({ month: monthKey, label, region, points: map.get(`${monthKey}|${region}`) ?? 0 })
    }
  }
  return rows
}

// Shared by master + cs — both show "Growth by Region" as this month's
// verified top-up points, top 4 regions, each with its own categorical color.
const REGION_GROWTH_COLORS = ['var(--color-info)', 'var(--color-jade)', 'var(--color-clay)', 'var(--color-brass)']

function buildRegionGrowth(monthTx: { points: number | string; dealers: DealerRegionRel }[], totalPoints: number) {
  const map = new Map<string, number>()
  for (const t of monthTx) {
    const region = regionOf(t.dealers)
    map.set(region, (map.get(region) ?? 0) + Number(t.points))
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([region, points], i) => ({
      region,
      points,
      pct: totalPoints ? Math.round((points / totalPoints) * 100) : 0,
      color: REGION_GROWTH_COLORS[i],
    }))
}

export default async function DashboardPage() {
  const user = await requireUser()
  const supabase = await createClient()

  if (user.role === 'accountant') return <AccountantDashboard supabase={supabase} />
  if (user.role === 'cs') return <CsDashboard supabase={supabase} />

  const today = todayInMalaysia()
  const monthStart = `${today.slice(0, 7)}-01`
  const currentMonthStr = today.slice(0, 7)
  const trendMonths = monthsBack(6)
  const trendStart = `${trendMonths[0].key}-01`

  const [
    { count: dealerCount },
    { count: dealerCountLastMonth },
    { data: dealerRows },
    { data: trendTx },
    { data: currentStatement },
    { data: recentTxRows },
  ] = await Promise.all([
    supabase.from('dealers_directory').select('id', { count: 'exact', head: true }),
    // "last month end" baseline for the Total Dealers chg badge — dealers
    // created before this month started, i.e. how many existed as of last
    // month's close.
    supabase.from('dealers_directory').select('id', { count: 'exact', head: true }).lt('created_at', monthStart),
    supabase.from('dealers_directory').select('id, company_name, package, region'),
    supabase
      .from('transactions')
      .select('dealer_id, tx_date, points, commission_rm, dealers(company_name, region)')
      .eq('status', 'verified')
      .gte('tx_date', trendStart)
      .lte('tx_date', today),
    supabase.from('company_statements').select('reconciled').eq('month', monthStart).maybeSingle(),
    supabase
      .from('transactions')
      .select('id, dealer_id, tx_date, type, package, points, money_rm, status, dealers(company_name)')
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

  const regions = Array.from(new Set((dealerRows ?? []).map((d) => d.region).filter((r): r is string => r != null))).sort()
  const trendRows = buildTrendRows(trendTx ?? [], trendMonths, regions)
  const regionGrowth = buildRegionGrowth(monthTx, totalPoints)

  // Recent Transactions — last 10 by created_at, any status. The dealer-name
  // filter below is client-side (see recent-transactions-table.tsx) since
  // it's just narrowing this already-fetched small batch, not a new query.
  const recentTransactions: RecentTxRow[] = (recentTxRows ?? []).map((t) => {
    const rel = t.dealers as { company_name: string } | { company_name: string }[] | null
    const dealerRel = Array.isArray(rel) ? rel[0] : rel
    return {
      id: t.id,
      tx_date: t.tx_date,
      type: t.type as 'package' | 'topup' | 'adjustment',
      package: t.package as string | null,
      points: Number(t.points),
      money_rm: Number(t.money_rm),
      status: t.status as 'pending' | 'verified' | 'flagged',
      dealerName: dealerRel?.company_name ?? '—',
      dealerId: t.dealer_id as string | null,
    }
  })

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[26px] font-extrabold tracking-tight text-paper">Dashboard</h1>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<IconTrendUp className="h-4 w-4" />}
          label="Top-up This Month"
          value={`${totalPoints.toLocaleString()} pts`}
          chg={pointsChg}
          footer={`Last month: ${prevMonthPoints.toLocaleString()} pts`}
          href={`/records?status=verified&month=${currentMonthStr}`}
        />
        <KpiCard
          icon={<IconCoin className="h-4 w-4" />}
          label="Your Commission (2%)"
          value={`RM ${totalCommission.toLocaleString()}`}
          chg={commissionChg}
          footer={`Last month: RM ${prevMonthCommission.toLocaleString()}`}
          href={`/records?status=verified&month=${currentMonthStr}`}
        />
        <KpiCard
          icon={<IconUsers className="h-4 w-4" />}
          label="Total Dealers"
          value={String(dealerCount ?? 0)}
          chg={dealerChg}
          footer={`Last month: ${dealerCountLastMonth ?? 0}`}
          href="/dealers"
        />
        <KpiCard
          icon={<IconCheckCircle className="h-4 w-4" />}
          label="Reconciliation"
          value={currentStatement?.reconciled ? 'Reconciled' : 'Not yet'}
          statusPill={currentStatement?.reconciled ? undefined : 'Action needed'}
          footer={`For ${currentMonthStr}`}
          href="/reconcile"
          stamp={currentStatement?.reconciled ? <ReconciledStamp sub={currentMonthStr} /> : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="app-card">
          <h3 className="mb-3.5 text-sm font-bold text-paper">Monthly Top-up Trend</h3>
          <MonthlyTrendChart rows={trendRows} regions={regions} />
        </div>

        <RegionGrowthCard regions={regionGrowth} />
      </div>

      <div className="app-card">
        <h3 className="mb-3.5 text-sm font-bold text-paper">Recent Transactions</h3>
        <RecentTransactionsTable rows={recentTransactions} />
      </div>
    </div>
  )
}

// Same shape as master's dashboard (KPI row + trend chart / region map +
// table) — an accountant enters and reviews the same transactions master
// oversees, so the same overview is relevant, just re-pointed at the cards
// an accountant actually acts on (Pending Review, Credit Balance) instead of
// the ones that are master's business-owner concern (Total Dealers,
// Commission earned).
async function AccountantDashboard({ supabase }: { supabase: SupabaseClient }) {
  const today = todayInMalaysia()
  const monthStart = `${today.slice(0, 7)}-01`
  const currentMonthStr = today.slice(0, 7)
  const trendMonths = monthsBack(6)
  const trendStart = `${trendMonths[0].key}-01`

  const [{ data: pendingRows }, creditBalance, { data: statement }, { data: dealerRows }, { data: trendTx }, { data: recentTxRows }] =
    await Promise.all([
      supabase.from('transactions').select('id, tx_date').eq('status', 'pending'),
      getAvailablePointsBalance(supabase),
      supabase.from('company_statements').select('reconciled').eq('month', monthStart).maybeSingle(),
      supabase.from('dealers_directory').select('id, region'),
      supabase
        .from('transactions')
        .select('tx_date, points, dealers(region)')
        .eq('status', 'verified')
        .gte('tx_date', trendStart)
        .lte('tx_date', today),
      supabase
        .from('transactions')
        .select('id, dealer_id, tx_date, type, package, points, money_rm, status, dealers(company_name)')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

  const pendingCount = pendingRows?.length ?? 0
  const oldestPendingDays = pendingCount ? Math.max(...pendingRows!.map((t) => daysSince(t.tx_date))) : 0

  const monthTx = (trendTx ?? []).filter((t) => t.tx_date >= monthStart)
  const totalPoints = monthTx.reduce((sum, t) => sum + Number(t.points), 0)
  const prevMonthKey = trendMonths[trendMonths.length - 2].key
  const prevMonthPoints = (trendTx ?? []).filter((t) => t.tx_date.slice(0, 7) === prevMonthKey).reduce((sum, t) => sum + Number(t.points), 0)
  const pointsChg = pctChange(totalPoints, prevMonthPoints)

  const regions = Array.from(new Set((dealerRows ?? []).map((d) => d.region).filter((r): r is string => r != null))).sort()
  const trendRows = buildTrendRows(trendTx ?? [], trendMonths, regions)
  const regionGrowth = buildRegionGrowth(monthTx, totalPoints)

  const recentTransactions: RecentTxRow[] = (recentTxRows ?? []).map((t) => {
    const rel = t.dealers as { company_name: string } | { company_name: string }[] | null
    const dealerRel = Array.isArray(rel) ? rel[0] : rel
    return {
      id: t.id,
      tx_date: t.tx_date,
      type: t.type as 'package' | 'topup' | 'adjustment',
      package: t.package as string | null,
      points: Number(t.points),
      money_rm: Number(t.money_rm),
      status: t.status as 'pending' | 'verified' | 'flagged',
      dealerName: dealerRel?.company_name ?? '—',
      dealerId: t.dealer_id as string | null,
    }
  })

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[26px] font-extrabold tracking-tight text-paper">Dashboard</h1>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<IconAlertCircle className="h-4 w-4" />}
          label="Pending Review"
          value={String(pendingCount)}
          footer={
            pendingCount
              ? oldestPendingDays >= PENDING_REVIEW_STALE_DAYS
                ? `Oldest is ${oldestPendingDays}d old`
                : 'All recently recorded'
              : 'Nothing waiting on you'
          }
          href="/records?status=pending"
        />
        <KpiCard
          icon={<IconCoin className="h-4 w-4" />}
          label="Credit Balance"
          value={`${creditBalance.available.toLocaleString()} pts`}
          statusPill={
            creditBalance.available <= 0 ? 'Out of credit' : creditBalance.available < LOW_BALANCE_THRESHOLD ? 'Running low' : undefined
          }
          footer="Points bought from Vibe Mobile"
          href="/purchases"
        />
        <KpiCard
          icon={<IconTrendUp className="h-4 w-4" />}
          label="Top-up This Month"
          value={`${totalPoints.toLocaleString()} pts`}
          chg={pointsChg}
          footer={`Last month: ${prevMonthPoints.toLocaleString()} pts`}
          href={`/records?status=verified&month=${currentMonthStr}`}
        />
        <KpiCard
          icon={<IconCheckCircle className="h-4 w-4" />}
          label="Reconciliation"
          value={statement?.reconciled ? 'Reconciled' : 'Not yet'}
          statusPill={statement?.reconciled ? undefined : 'Action needed'}
          footer={`For ${currentMonthStr}`}
          href="/reconcile"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="app-card">
          <h3 className="mb-3.5 text-sm font-bold text-paper">Monthly Top-up Trend</h3>
          <MonthlyTrendChart rows={trendRows} regions={regions} />
        </div>

        <RegionGrowthCard regions={regionGrowth} />
      </div>

      <div className="app-card">
        <h3 className="mb-3.5 text-sm font-bold text-paper">Recent Transactions</h3>
        <RecentTransactionsTable rows={recentTransactions} />
      </div>
    </div>
  )
}

const DELIVERY_TABLE_LIMIT = 8

// Same overall shape as master's dashboard, re-pointed at CS's actual job:
// the pending-delivery queue (with the real Mark as Sent action, not a
// read-only count) and the regional dealer-network map, instead of the
// finance-facing trend chart.
async function CsDashboard({ supabase }: { supabase: SupabaseClient }) {
  const today = todayInMalaysia()
  const monthStart = `${today.slice(0, 7)}-01`

  const [
    { data: deliveryListRows, count: pendingDeliveryCount },
    { count: dealerCount },
    { count: dealerCountLastMonth },
    activityMap,
    { data: monthTx },
    { data: dealerRegionRows },
  ] = await Promise.all([
    supabase
      .from('delivery_queue')
      .select('id, tx_date, company_name, address, package, sim_type, delivery_status', { count: 'exact' })
      .eq('delivery_status', 'pending')
      .order('tx_date', { ascending: true })
      .limit(DELIVERY_TABLE_LIMIT),
    supabase.from('dealers_directory').select('id', { count: 'exact', head: true }),
    supabase.from('dealers_directory').select('id', { count: 'exact', head: true }).lt('created_at', monthStart),
    getDealerActivityMap(supabase),
    // dealer_id only, not an embedded dealers(region) join — cs has no SELECT
    // on the dealers base table (0015), so that embed would silently come
    // back null for every row. Region is joined in JS below instead, off
    // dealers_directory, which cs can read.
    supabase.from('transactions').select('dealer_id, points').eq('status', 'verified').gte('tx_date', monthStart).lte('tx_date', today),
    supabase.from('dealers_directory').select('id, region'),
  ])

  const oldestDeliveryDays = deliveryListRows?.length ? daysSince(deliveryListRows[0].tx_date) : 0
  const inactiveCount = [...activityMap.values()].filter((a) => a.isInactive).length
  const dealerChg = pctChange(dealerCount ?? 0, dealerCountLastMonth ?? 0)

  const deliveryRows: DeliveryRow[] = (deliveryListRows ?? []).map((row) => {
    const days = daysSince(row.tx_date)
    return {
      id: row.id,
      tx_date: row.tx_date,
      company_name: row.company_name,
      address: row.address,
      package: row.package,
      sim_type: row.sim_type as 'physical' | 'esim' | null,
      delivery_status: row.delivery_status as 'na' | 'pending' | 'sent',
      days,
      warn: days >= DELIVERY_WARN_DAYS_THRESHOLD,
      urgent: days >= DELIVERY_STALLED_DAYS_THRESHOLD,
    }
  })

  const regionByDealerId = new Map((dealerRegionRows ?? []).map((d) => [d.id, d.region]))
  const monthTxWithRegion = (monthTx ?? []).map((t) => ({ points: t.points, dealers: { region: regionByDealerId.get(t.dealer_id) ?? null } }))
  const totalPoints = monthTxWithRegion.reduce((sum, t) => sum + Number(t.points), 0)
  const regionGrowth = buildRegionGrowth(monthTxWithRegion, totalPoints)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[26px] font-extrabold tracking-tight text-paper">Dashboard</h1>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <KpiCard
          icon={<IconTruck className="h-4 w-4" />}
          label="Pending Deliveries"
          value={String(pendingDeliveryCount ?? 0)}
          footer={
            pendingDeliveryCount
              ? oldestDeliveryDays >= DELIVERY_WARN_DAYS_THRESHOLD
                ? `Oldest is ${oldestDeliveryDays}d old`
                : 'All recently queued'
              : 'Nothing waiting on you'
          }
          href="/delivery"
        />
        <KpiCard
          icon={<IconUsers className="h-4 w-4" />}
          label="Needs Follow-up"
          value={String(inactiveCount)}
          footer={inactiveCount ? 'No verified top-up in 30+ days' : 'Nothing to follow up on'}
          href="/dealers?view=inactive"
        />
        <KpiCard
          icon={<IconUsers className="h-4 w-4" />}
          label="Total Dealers"
          value={String(dealerCount ?? 0)}
          chg={dealerChg}
          footer={`Last month: ${dealerCountLastMonth ?? 0}`}
          href="/dealers"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="app-card">
          <div className="mb-3.5 flex items-center justify-between">
            <h3 className="text-sm font-bold text-paper">Pending Deliveries</h3>
            {(pendingDeliveryCount ?? 0) > DELIVERY_TABLE_LIMIT && (
              <a href="/delivery" className="text-xs font-semibold text-primary hover:underline">
                View all {pendingDeliveryCount}
              </a>
            )}
          </div>
          {deliveryRows.length ? (
            <DeliveryTable rows={deliveryRows} />
          ) : (
            <p className="text-sm text-paper-dim">No pending SIM deliveries right now.</p>
          )}
        </div>

        <RegionGrowthCard regions={regionGrowth} />
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

// Uniform KPI card — all four dashboard headline metrics share this exact
// treatment (icon tile, label, big number, chg/status pill, footer) rather
// than each getting its own visual weight, per design review: no single
// metric should read as more "important" than the others at a glance.
function KpiCard({
  label,
  value,
  href,
  icon,
  chg,
  statusPill,
  footer,
  stamp,
}: {
  label: string
  value: string
  href: string
  icon: React.ReactNode
  chg?: number | null
  statusPill?: string
  footer: string
  stamp?: React.ReactNode
}) {
  return (
    <a href={href} className="app-tile relative flex flex-col gap-3 overflow-visible transition-colors hover:border-jade/50">
      <div className="flex items-start justify-between">
        <span className="text-[13px] font-semibold text-paper-dim">{label}</span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary">{icon}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[26px] font-extrabold tracking-tight text-paper tabular-nums">{value}</span>
        {chg !== undefined && <ChgBadge pct={chg ?? null} />}
        {statusPill && <span className="chg chg-down w-fit">{statusPill}</span>}
      </div>
      <div className="text-[12.5px] text-paper-dim">{footer}</div>
      {stamp && <div className="pointer-events-none absolute -right-3 -top-4">{stamp}</div>}
    </a>
  )
}
