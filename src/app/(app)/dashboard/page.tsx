import type { Metadata } from 'next'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { todayInMalaysia, formatMonthLabel } from '@/lib/month'
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
import { NeedsAttention } from './summary'
import { HeroCard, pctChange } from '../hero-card'
import { getNotifications } from '@/lib/notifications/build'
import { DeliveryTable, type DeliveryRow } from '../delivery/delivery-table'
import { PageHeader } from '../page-header'
import { formatMYR } from '@/lib/money'

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

// company_name is optional because the trend chart's own query doesn't need
// it — only the region breakdown, which drills down to individual dealers,
// does. Keeping it optional lets both share this one type.
type DealerRegionRel =
  | { region: string | null; company_name?: string | null }
  | { region: string | null; company_name?: string | null }[]
  | null

function regionOf(rel: DealerRegionRel): string {
  return (Array.isArray(rel) ? rel[0]?.region : rel?.region) ?? '(No Region)'
}

function dealerNameOf(rel: DealerRegionRel): string {
  return (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '(Unknown dealer)'
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
// One hue, four weights — not four hues.
//
// This used to hand the top four regions info / jade / clay / brass: the
// semantic status palette. The third-best region therefore rendered in the
// colour that means "flagged" everywhere else in the app, and the fourth in
// the colour that means "pending". A region isn't in a bad state because it
// sold third-most.
//
// Colour was also doing no work here. The bars are sorted by value and their
// length already encodes magnitude, so a different hue per row adds nothing a
// reader can act on — it only competes with the status colours that do carry
// meaning. Stepping one accent from full strength down to a quiet tint keeps
// the ranking legible and gives the palette back to states.
const REGION_GROWTH_COLORS = [
  'var(--color-primary)',
  'color-mix(in srgb, var(--color-primary) 72%, transparent)',
  'color-mix(in srgb, var(--color-primary) 48%, transparent)',
  'color-mix(in srgb, var(--color-primary) 30%, transparent)',
]

// Aggregates twice in one pass: by region (the top-level ranking) and, within
// each region, by dealer — the region card drills down to "which dealers are
// in here and what did each one sell", so the per-dealer split has to come
// from the same rows rather than a second query.
function buildRegionGrowth(monthTx: { points: number | string; dealers: DealerRegionRel }[], totalPoints: number) {
  const byRegion = new Map<string, { points: number; dealers: Map<string, number> }>()
  for (const t of monthTx) {
    const region = regionOf(t.dealers)
    let entry = byRegion.get(region)
    if (!entry) {
      entry = { points: 0, dealers: new Map() }
      byRegion.set(region, entry)
    }
    const points = Number(t.points)
    entry.points += points
    const name = dealerNameOf(t.dealers)
    entry.dealers.set(name, (entry.dealers.get(name) ?? 0) + points)
  }
  // Every region that sold anything, not a top-N slice. The card's whole job
  // is "at a glance, all the areas I cover and which sells best" — and there
  // are 44 distinct regions against 6 that the map can plot, so a top-4 cut
  // was hiding most of the business. The list carries the full picture; the
  // map stays a companion for the towns it genuinely knows.
  //
  // Only the leaders get a categorical colour. Handing 44 regions 44 colours
  // would make the palette meaningless — past the top few, colour stops
  // encoding anything and the ranking itself does the work.
  return [...byRegion.entries()]
    .sort((a, b) => b[1].points - a[1].points)
    .map(([region, entry], i) => ({
      region,
      points: entry.points,
      pct: totalPoints ? Math.round((entry.points / totalPoints) * 100) : 0,
      color: i < REGION_GROWTH_COLORS.length ? REGION_GROWTH_COLORS[i] : 'color-mix(in srgb, var(--color-primary) 18%, transparent)',
      dealers: [...entry.dealers.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, points]) => ({ name, points })),
    }))
}

export default async function DashboardPage() {
  const user = await requireUser()
  const supabase = await createClient()

  if (user.role === 'accountant') return <AccountantDashboard supabase={supabase} userId={user.id} />
  if (user.role === 'cs') return <CsDashboard supabase={supabase} userId={user.id} />

  const today = todayInMalaysia()
  const monthStart = `${today.slice(0, 7)}-01`
  const currentMonthStr = today.slice(0, 7)
  const trendMonths = monthsBack(6)
  const trendStart = `${trendMonths[0].key}-01`

  const [
    { count: dealerCount },
    { data: dealerRows },
    { data: trendTx },
    { data: recentTxRows },
    creditBalance,
    alerts,
  ] = await Promise.all([
    supabase.from('dealers_directory').select('id', { count: 'exact', head: true }),
    supabase.from('dealers_directory').select('id, company_name, package, region'),
    supabase
      .from('transactions')
      .select('dealer_id, tx_date, points, commission_rm, dealers(company_name, region)')
      .eq('status', 'verified')
      .gte('tx_date', trendStart)
      .lte('tx_date', today),
    supabase
      .from('transactions')
      .select('id, dealer_id, tx_date, type, package, points, money_rm, status, dealers(company_name)')
      .order('created_at', { ascending: false })
      .limit(10),
    getAvailablePointsBalance(supabase),
    // Same list the bell and /notifications show — getNotifications is
    // request-cached, so this doesn't re-run the layout's queries.
    getNotifications(user.id, 'master'),
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
  const prevMonthCommission = prevMonthTx.reduce((sum, t) => sum + Number(t.commission_rm), 0)

  // A partial month compared against a complete one always reads as a
  // collapse. On 1 August the dashboard showed "RM 0.00, down 100%" — true
  // arithmetic, useless information, and alarming. On the 5th it would say
  // down 80% purely because 26 days hadn't happened yet. The comparison is
  // only honest once the month is over, so it is withheld until then and the
  // reader is told where they are in the month instead.
  //
  // Same rule as Reconciliation's empty state: don't show a verdict that
  // can't exist yet. A month in progress has no verdict against last month.
  const dayOfMonth = Number(today.slice(8, 10))
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate()
  const monthComplete = dayOfMonth >= daysInMonth
  const commissionChg = monthComplete ? pctChange(totalCommission, prevMonthCommission) : null

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
    <div className="flex flex-col gap-8">
      <PageHeader title="Dashboard" subtitle={formatMonthLabel(currentMonthStr)} />

      {/* Ranked by what the reader has to DO, in one column.
          The page used to open with a 550px chart whose headline figure was
          RM 0.00 — the biggest thing on it was an empty month, and history
          is the one thing on a dashboard nobody can act on. Then it put the
          three items that genuinely need action in a third-width card below
          the fold. This is that order reversed: the work, then the money,
          then where the money came from, then the ledger. A single column
          also makes the masonry void structurally impossible — there is no
          short card left beside a tall one. */}
      <NeedsAttention items={alerts} flat />
      {/* Commission is master's headline: it's the money the business actually
          keeps, and every other figure here is an input to it. */}
      {/* Full width, with the real six-month chart inside it. This card and
          the "Monthly Top-up Trend" card below were drawing the SAME series
          twice — a sparkline here, the full chart there. One series, one
          chart, and it now gets 1500px instead of 900px. */}
      <HeroCard
          flat
          label={`Your commission — ${formatMonthLabel(currentMonthStr)}`}
          value={formatMYR(totalCommission)}
          chg={commissionChg}
          chgSuffix={
            monthComplete
              ? `vs ${formatMYR(prevMonthCommission)} last month`
              : totalCommission === 0
                ? `nothing recorded yet — ${formatMonthLabel(prevMonthKey)} closed at ${formatMYR(prevMonthCommission)}`
                : `day ${dayOfMonth} of ${daysInMonth} — ${formatMonthLabel(prevMonthKey)} closed at ${formatMYR(prevMonthCommission)}`
          }
        chart={<MonthlyTrendChart rows={trendRows} regions={regions} />}
          href={`/records?status=verified&month=${currentMonthStr}`}
          stats={[
            {
              label: 'Top-up this month',
              value: `${totalPoints.toLocaleString()} pts`,
              href: `/records?status=verified&month=${currentMonthStr}`,
            },
            { label: 'Dealers', value: String(dealerCount ?? 0), href: '/dealers' },
            {
              label: 'Credit balance',
              value: `${creditBalance.available.toLocaleString()} pts`,
              href: '/purchases',
              tone: creditBalance.available < LOW_BALANCE_THRESHOLD ? 'warn' : 'normal',
            },
          ]}
      />

      <RegionGrowthCard regions={regionGrowth} flat />

      <div className="page-band">
        <h3 className="mb-3.5 text-sm font-semibold text-paper">Recent Transactions</h3>
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
async function AccountantDashboard({ supabase, userId }: { supabase: SupabaseClient; userId: string }) {
  const today = todayInMalaysia()
  const monthStart = `${today.slice(0, 7)}-01`
  const currentMonthStr = today.slice(0, 7)
  const trendMonths = monthsBack(6)
  const trendStart = `${trendMonths[0].key}-01`

  const [{ data: pendingRows }, creditBalance, { data: statement }, { data: dealerRows }, { data: trendTx }, { data: recentTxRows }, alerts] =
    await Promise.all([
      supabase.from('transactions').select('id, tx_date').eq('status', 'pending'),
      getAvailablePointsBalance(supabase),
      supabase.from('company_statements').select('reconciled').eq('month', monthStart).maybeSingle(),
      supabase.from('dealers_directory').select('id, region'),
      supabase
        .from('transactions')
        .select('tx_date, points, dealers(region, company_name)')
        .eq('status', 'verified')
        .gte('tx_date', trendStart)
        .lte('tx_date', today),
      supabase
        .from('transactions')
        .select('id, dealer_id, tx_date, type, package, points, money_rm, status, dealers(company_name)')
        .order('created_at', { ascending: false })
        .limit(10),
      getNotifications(userId, 'accountant'),
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
    <div className="flex flex-col gap-8">
      <PageHeader title="Dashboard" subtitle={formatMonthLabel(currentMonthStr)} />

      {/* Ranked by what the reader has to DO, in one column.
          The page used to open with a 550px chart whose headline figure was
          RM 0.00 — the biggest thing on it was an empty month, and history
          is the one thing on a dashboard nobody can act on. Then it put the
          three items that genuinely need action in a third-width card below
          the fold. This is that order reversed: the work, then the money,
          then where the money came from, then the ledger. A single column
          also makes the masonry void structurally impossible — there is no
          short card left beside a tall one. */}
      <NeedsAttention items={alerts} flat />
      {/* An accountant's headline is the volume they're responsible for
          recording and verifying, not master's commission. */}
      {/* Full width, with the real six-month chart inside it. This card and
          the "Monthly Top-up Trend" card below were drawing the SAME series
          twice — a sparkline here, the full chart there. One series, one
          chart, and it now gets 1500px instead of 900px. */}
      <HeroCard
          flat
          label={`Top-up — ${formatMonthLabel(currentMonthStr)}`}
          value={`${totalPoints.toLocaleString()} pts`}
          chg={pointsChg}
          chgSuffix={`vs ${prevMonthPoints.toLocaleString()} pts last month`}
        chart={<MonthlyTrendChart rows={trendRows} regions={regions} />}
          href={`/records?status=verified&month=${currentMonthStr}`}
          stats={[
            {
              label: 'Pending review',
              value: String(pendingCount),
              href: '/records?status=pending',
              tone: pendingCount && oldestPendingDays >= PENDING_REVIEW_STALE_DAYS ? 'warn' : 'normal',
            },
            {
              label: 'Credit balance',
              value: `${creditBalance.available.toLocaleString()} pts`,
              href: '/purchases',
              tone: creditBalance.available < LOW_BALANCE_THRESHOLD ? 'warn' : 'normal',
            },
            {
              label: `Reconciliation ${currentMonthStr}`,
              value: statement?.reconciled ? 'Closed' : 'Open',
              href: '/reconcile',
              tone: statement?.reconciled ? 'normal' : 'warn',
            },
          ]}
      />

      <RegionGrowthCard regions={regionGrowth} flat />

      <div className="page-band">
        <h3 className="mb-3.5 text-sm font-semibold text-paper">Recent Transactions</h3>
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
async function CsDashboard({ supabase, userId }: { supabase: SupabaseClient; userId: string }) {
  const today = todayInMalaysia()
  const monthStart = `${today.slice(0, 7)}-01`

  const [
    { data: deliveryListRows, count: pendingDeliveryCount },
    { count: dealerCount },
    { count: dealerCountLastMonth },
    activityMap,
    { data: monthTx },
    { data: dealerRegionRows },
    alerts,
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
    supabase.from('dealers_directory').select('id, region, company_name'),
    getNotifications(userId, 'cs'),
  ])

  const oldestDeliveryDays = deliveryListRows?.length ? daysSince(deliveryListRows[0].tx_date) : 0
  const inactiveCount = [...activityMap.values()].filter((a) => a.isInactive).length

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

  // cs can't join transactions->dealers (no SELECT on the base table), so the
  // region AND dealer name both come from dealers_directory, keyed by id.
  const dealerByIdForCs = new Map((dealerRegionRows ?? []).map((d) => [d.id, d]))
  const monthTxWithRegion = (monthTx ?? []).map((t) => {
    const d = dealerByIdForCs.get(t.dealer_id)
    return { points: t.points, dealers: { region: d?.region ?? null, company_name: d?.company_name ?? null } }
  })
  const totalPoints = monthTxWithRegion.reduce((sum, t) => sum + Number(t.points), 0)
  const regionGrowth = buildRegionGrowth(monthTxWithRegion, totalPoints)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Dashboard" subtitle={formatMonthLabel(monthStart.slice(0, 7))} />

      {/* Same ranking as the other two roles: the work first. */}
      <NeedsAttention items={alerts} flat />
      {/* cs has no financial visibility, so the headline is the queue that
          is actually their job to clear. */}
      {/* Full width. cs has no trend chart — no financial series to plot —
          so this card is the figure and its three supporting counts. */}
      <HeroCard
          flat
          label="SIM deliveries pending"
          value={String(pendingDeliveryCount ?? 0)}
          chgSuffix={
            pendingDeliveryCount
              ? oldestDeliveryDays >= DELIVERY_WARN_DAYS_THRESHOLD
                ? `oldest is ${oldestDeliveryDays}d old`
                : 'all recently queued'
              : 'nothing waiting on you'
          }
          href="/delivery"
          stats={[
            {
              label: 'Needs follow-up',
              value: String(inactiveCount),
              href: '/dealers?view=inactive',
              tone: inactiveCount ? 'warn' : 'normal',
            },
            { label: 'Dealers', value: String(dealerCount ?? 0), href: '/dealers' },
            {
              label: 'New this month',
              value: String((dealerCount ?? 0) - (dealerCountLastMonth ?? 0)),
              href: '/dealers',
            },
          ]}
      />

      <RegionGrowthCard regions={regionGrowth} flat />

      <div className="page-band">
          <div className="mb-3.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-paper">Pending Deliveries</h3>
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
    </div>
  )
}

