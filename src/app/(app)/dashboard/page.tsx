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
import { RecentTransactionsTable, type RecentTxRow } from './recent-transactions-table'
import Link from 'next/link'
import { StatTiles, Leaderboard, RegionBars, GhostEmpty } from './elements'
import { PeriodSwitcher } from './period-switcher'
import { balanceSeries, dealersTradingSeries, resolvePeriod, sameSpanTotal } from '@/lib/dashboard-period'
import { NeedsAttention } from './summary'
import { pctChange, HeroCard } from '../hero-card'
import { getNotifications } from '@/lib/notifications/build'
import { DeliveryTable, type DeliveryRow } from '../delivery/delivery-table'
import { PageHeader } from '../page-header'
import { formatMYR } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Dashboard — Vibe456',
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

// Top dealers by this month's verified points. Derived from monthTx, which is
// already in memory — 249 dealers and this page had never named one of them.
// No limit here any more. One cap rule, in one place: BarList takes the top
// eight and puts the rest behind a disclosure, which is what the region list
// beside this one does. Two different caps in two different files is how the
// region list ended up with none at all.
function topDealers(monthTx: { dealer_id: string; points: number | string; dealers: DealerRegionRel }[]) {
  const by = new Map<string, { id: string; name: string; points: number }>()
  for (const t of monthTx) {
    const prev = by.get(t.dealer_id) ?? { id: t.dealer_id, name: dealerNameOf(t.dealers), points: 0 }
    prev.points += Number(t.points)
    by.set(t.dealer_id, prev)
  }
  return [...by.values()]
    .sort((a, b) => b.points - a.points)
    .map((d) => ({ ...d, href: `/dealers/${d.id}` }))
}

// Six trailing monthly totals for a sparkline, oldest first.
function monthlySeries(
  tx: { tx_date: string; points: number | string; commission_rm?: number | string }[],
  months: { key: string }[],
  field: 'points' | 'commission_rm',
) {
  return months.map(({ key }) =>
    tx.filter((t) => t.tx_date.slice(0, 7) === key).reduce((sum, t) => sum + Number(t[field] ?? 0), 0),
  )
}

type PageProps = { searchParams: Promise<{ month?: string }> }

export default async function DashboardPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { month: monthParam } = await searchParams
  const supabase = await createClient()

  if (user.role === 'accountant') return <AccountantDashboard supabase={supabase} userId={user.id} monthParam={monthParam} />
  if (user.role === 'cs') return <CsDashboard supabase={supabase} userId={user.id} monthParam={monthParam} />

  const today = todayInMalaysia()
  const currentMonthStr = today.slice(0, 7)
  const trendMonths = monthsBack(6)
  const trendStart = `${trendMonths[0].key}-01`

  const [{ count: dealerCount }, { data: trendTx }, { data: recentTxRows }, creditBalance, alerts, { data: windowRows }, { data: purchaseRows }] =
    await Promise.all([
      supabase.from('dealers_directory').select('id', { count: 'exact', head: true }),
      // The full dealer list went with the trend chart's region filter — the
      // only thing that consumed it. This page no longer reads 249 rows on
      // every load to populate a dropdown it does not have.
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
      // Every transaction in the charted window, any status. Two things read
      // it: the status split for whichever month is selected, and the credit
      // balance series, which needs pending as well as verified because a
      // pending sale is already committed against the balance. It replaces
      // the old this-month-only status query rather than adding to it, so
      // changing period costs no extra round trip.
      supabase.from('transactions').select('tx_date, points, status').gte('tx_date', trendStart).lte('tx_date', today),
      supabase.from('credit_purchases').select('purchase_date, points').gte('purchase_date', trendStart),
    ])

  // ---- which month the page is showing ---------------------------------
  const monthsWithData = new Set((trendTx ?? []).map((t) => t.tx_date.slice(0, 7)))
  const period = resolvePeriod(monthParam, trendMonths, monthsWithData)
  const periodKey = period.key
  const periodIsCurrent = periodKey === currentMonthStr
  const periodIdx = trendMonths.findIndex((m) => m.key === periodKey)
  const prevMonthKey = periodIdx > 0 ? trendMonths[periodIdx - 1].key : null

  const windowTx = (windowRows ?? []) as { tx_date: string; points: number | string; status: string }[]
  const monthTx = (trendTx ?? []).filter((t) => t.tx_date.slice(0, 7) === periodKey)

  const totalPoints = monthTx.reduce((sum, t) => sum + Number(t.points), 0)
  const totalCommission = monthTx.reduce((sum, t) => sum + Number(t.commission_rm), 0)

  // ---- the comparison --------------------------------------------------
  // Day 1 to today against day 1 to the same day of the month before, not
  // against the whole of it. Comparing two days of August with thirty-one
  // days of July is what made this read "down 100%" on the 1st of every
  // month. See sameSpanTotal.
  const dayOfMonth = Number(today.slice(8, 10))
  const daysInPeriod = new Date(Date.UTC(Number(periodKey.slice(0, 4)), Number(periodKey.slice(5, 7)), 0)).getUTCDate()
  const periodComplete = !periodIsCurrent || dayOfMonth >= daysInPeriod
  const spanDays = periodComplete ? daysInPeriod : dayOfMonth
  const prevSpanCommission = prevMonthKey ? sameSpanTotal(trendTx ?? [], prevMonthKey, spanDays, 'commission_rm') : 0
  const prevSpanPoints = prevMonthKey ? sameSpanTotal(trendTx ?? [], prevMonthKey, spanDays, 'points') : 0
  const prevMonthLabel = prevMonthKey ? formatMonthLabel(prevMonthKey) : null
  const commissionChg = prevSpanCommission > 0 ? pctChange(totalCommission, prevSpanCommission) : null
  const projected = periodComplete || dayOfMonth === 0 ? totalCommission : (totalCommission / dayOfMonth) * daysInPeriod

  const regionGrowth = buildRegionGrowth(monthTx, totalPoints)
  const leaders = topDealers(monthTx)

  // ---- what to show in place of an empty month -------------------------
  // Not a line of grey text. The month before, drawn faint, so an empty
  // section still tells you what belongs there and how it last looked.
  const prevMonthTx = prevMonthKey ? (trendTx ?? []).filter((t) => t.tx_date.slice(0, 7) === prevMonthKey) : []
  const prevMonthPoints = prevMonthTx.reduce((sum, t) => sum + Number(t.points), 0)
  const ghostLeaders = topDealers(prevMonthTx)
  const ghostRegions = buildRegionGrowth(prevMonthTx, prevMonthPoints)

  const commissionSeries = monthlySeries(trendTx ?? [], trendMonths, 'commission_rm')
  const pointsSeries = monthlySeries(trendTx ?? [], trendMonths, 'points')
  const tradingSeries = dealersTradingSeries(trendTx ?? [], trendMonths)
  // Committed = pending and verified, flagged excluded — the same definition
  // the live balance uses, or the series would not land on the figure printed
  // beside it. See computeAvailableBalance.
  const balances = balanceSeries(
    creditBalance.available,
    purchaseRows ?? [],
    windowTx.filter((t) => t.status !== 'flagged'),
    trendMonths,
  )
  const dealersTrading = new Set(monthTx.map((t) => t.dealer_id)).size

  // Recent Transactions — last 10 by created_at, any status, and deliberately
  // not scoped to the selected period: "what happened lately" is not a
  // question about a calendar month.
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

  const periodLabel = formatMonthLabel(periodKey)

  return (
    <div className="flex flex-col gap-8">
      {/* One period control, and every month-scoped block below follows it.
          The page used to hardcode "this month", so on the 2nd of a month
          five of its seven sections were empty by definition. */}
      <PageHeader
        title="Dashboard"
        subtitle={
          period.auto
            ? `Showing ${periodLabel} — nothing verified in ${formatMonthLabel(currentMonthStr)} yet.`
            : periodIsCurrent
              ? `${periodLabel} · day ${dayOfMonth} of ${daysInPeriod}`
              : periodLabel
        }
        action={<PeriodSwitcher months={trendMonths} selected={periodKey} compareLabel={prevMonthLabel ?? undefined} />}
      />

      {/* The first band is a card and the rest are not. Measured across the
          app: every page the client rates as finished paints its first
          surface at y=104-124, right under the title, and the two he rates
          as unfinished opened at y=384 and y=768. It is not the amount of
          white — Dealers is 5% painted and reads fine — it is whether the
          page opens with something to land on. So the thing that has to be
          read first gets the surface, and everything after it stays flat. */}
      <NeedsAttention items={alerts} />

      {/* Four figures and the pace, one row. All four carry a trend now:
          two of them used to have none, and because a grid row is as tall as
          its tallest cell that left a 100px hole under the other two. */}
      <div className="page-band">
        <StatTiles
          stats={[
            {
              label: `Your commission — ${periodLabel}`,
              value: formatMYR(totalCommission),
              href: `/records?status=verified&month=${periodKey}`,
              chg: commissionChg,
              spark: commissionSeries,
              // What the removed Pace ring knew and nothing else did: where
              // this month lands if it carries on at the rate it is going.
              sub: periodComplete ? undefined : `day ${dayOfMonth} of ${daysInPeriod} · on track for ${formatMYR(projected)}`,
            },
            {
              label: `Top-up — ${periodLabel}`,
              value: `${totalPoints.toLocaleString()} pts`,
              href: `/records?status=verified&month=${periodKey}`,
              chg: prevSpanPoints > 0 ? pctChange(totalPoints, prevSpanPoints) : null,
              spark: pointsSeries,
            },
            {
              label: 'Dealers trading',
              value: `${dealersTrading} / ${dealerCount ?? 0}`,
              href: '/dealers',
              spark: tradingSeries,
              sub: `recorded a verified top-up in ${periodLabel}`,
            },
            {
              label: 'Credit balance',
              value: `${creditBalance.available.toLocaleString()} pts`,
              href: '/purchases',
              spark: balances,
              sub: creditBalance.available < LOW_BALANCE_THRESHOLD ? 'below the low-balance threshold' : 'as it stands today',
            },
          ]}
        />
      </div>

      {/* Three sections became one. Top dealers, status split and region
          ranking are three cuts of the same question — how did this month
          sell — and each carried its own heading, its own description and,
          on an empty month, its own line of "nothing yet". One heading, one
          empty state, three columns. */}
      <div className="page-band">
        <h3 className="mb-1 text-sm font-semibold text-paper">{periodLabel}</h3>
        <p className="mb-5 text-[12px] text-paper-dim">Who bought, and where it came from.</p>
        <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2">
          <div>
            <h4 className="mb-2.5 text-[12px] font-semibold text-paper">Top dealers</h4>
            {leaders.length ? (
              <Leaderboard rows={leaders} />
            ) : ghostLeaders.length ? (
              <GhostEmpty
                note={`Nothing verified in ${periodLabel} yet. This is how ${prevMonthLabel} finished:`}
                action={
                  prevMonthKey ? (
                    <Link href={`/dashboard?month=${prevMonthKey}`} className="font-semibold text-primary hover:underline">
                      Open {prevMonthLabel} →
                    </Link>
                  ) : null
                }
              >
                <Leaderboard rows={ghostLeaders} />
              </GhostEmpty>
            ) : (
              <p className="text-[13px] text-paper-dim">No verified top-ups on record yet.</p>
            )}
          </div>
          <div>
            <h4 className="mb-2.5 text-[12px] font-semibold text-paper">By region</h4>
            {regionGrowth.length ? (
              <RegionBars rows={regionGrowth.map((r) => ({ region: r.region, points: r.points }))} />
            ) : ghostRegions.length ? (
              <GhostEmpty note={`Regions light up as top-ups are verified. ${prevMonthLabel} looked like this:`}>
                <RegionBars rows={ghostRegions.map((r) => ({ region: r.region, points: r.points }))} />
              </GhostEmpty>
            ) : (
              <p className="text-[13px] text-paper-dim">No verified transactions on record yet.</p>
            )}
          </div>
        </div>
      </div>

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
async function AccountantDashboard({ supabase, userId, monthParam }: { supabase: SupabaseClient; userId: string; monthParam?: string }) {
  const today = todayInMalaysia()
  const currentMonthStr = today.slice(0, 7)
  const trendMonths = monthsBack(6)
  const trendStart = `${trendMonths[0].key}-01`

  const [{ data: pendingRows }, creditBalance, { data: statements }, { data: trendTx }, { data: recentTxRows }, alerts, { data: windowRows }, { data: purchaseRows }] =
    await Promise.all([
      supabase.from('transactions').select('id, tx_date').eq('status', 'pending'),
      getAvailablePointsBalance(supabase),
      // Every statement in the window, not just this month's — the period
      // switcher can point at any of them.
      supabase.from('company_statements').select('month, reconciled').gte('month', trendStart),
      // The dealers_directory read went with the trend chart's region filter,
      // the only thing that consumed it. dealer_id is added below so the
      // leaderboard can group without a second query.
      supabase
        .from('transactions')
        .select('dealer_id, tx_date, points, dealers(region, company_name)')
        .eq('status', 'verified')
        .gte('tx_date', trendStart)
        .lte('tx_date', today),
      supabase
        .from('transactions')
        .select('id, dealer_id, tx_date, type, package, points, money_rm, status, dealers(company_name)')
        .order('created_at', { ascending: false })
        .limit(10),
      getNotifications(userId, 'accountant'),
      supabase.from('transactions').select('tx_date, points, status').gte('tx_date', trendStart).lte('tx_date', today),
      supabase.from('credit_purchases').select('purchase_date, points').gte('purchase_date', trendStart),
    ])

  const pendingCount = pendingRows?.length ?? 0
  const oldestPendingDays = pendingCount ? Math.max(...pendingRows!.map((t) => daysSince(t.tx_date))) : 0

  const monthsWithData = new Set((trendTx ?? []).map((t) => t.tx_date.slice(0, 7)))
  const period = resolvePeriod(monthParam, trendMonths, monthsWithData)
  const periodKey = period.key
  const periodLabel = formatMonthLabel(periodKey)
  const periodIsCurrent = periodKey === currentMonthStr
  const periodIdx = trendMonths.findIndex((m) => m.key === periodKey)
  const prevMonthKey = periodIdx > 0 ? trendMonths[periodIdx - 1].key : null
  const prevMonthLabel = prevMonthKey ? formatMonthLabel(prevMonthKey) : null

  const windowTx = (windowRows ?? []) as { tx_date: string; points: number | string; status: string }[]
  const monthTx = (trendTx ?? []).filter((t) => t.tx_date.slice(0, 7) === periodKey)
  const totalPoints = monthTx.reduce((sum, t) => sum + Number(t.points), 0)

  // Same span either side — see sameSpanTotal and the note in the master
  // branch. Two days against a whole month is not a comparison.
  const dayOfMonth = Number(today.slice(8, 10))
  const daysInPeriod = new Date(Date.UTC(Number(periodKey.slice(0, 4)), Number(periodKey.slice(5, 7)), 0)).getUTCDate()
  const periodComplete = !periodIsCurrent || dayOfMonth >= daysInPeriod
  const spanDays = periodComplete ? daysInPeriod : dayOfMonth
  const prevSpanPoints = prevMonthKey ? sameSpanTotal(trendTx ?? [], prevMonthKey, spanDays, 'points') : 0
  const pointsChg = prevSpanPoints > 0 ? pctChange(totalPoints, prevSpanPoints) : null
  const projectedPoints = periodComplete || dayOfMonth === 0 ? totalPoints : Math.round((totalPoints / dayOfMonth) * daysInPeriod)

  const regionGrowth = buildRegionGrowth(monthTx, totalPoints)
  const leaders = topDealers(monthTx)

  const prevMonthTx = prevMonthKey ? (trendTx ?? []).filter((t) => t.tx_date.slice(0, 7) === prevMonthKey) : []
  const prevMonthPoints = prevMonthTx.reduce((sum, t) => sum + Number(t.points), 0)
  const ghostLeaders = topDealers(prevMonthTx)
  const ghostRegions = buildRegionGrowth(prevMonthTx, prevMonthPoints)

  const pointsSeries = monthlySeries(trendTx ?? [], trendMonths, 'points')
  const tradingSeries = dealersTradingSeries(trendTx ?? [], trendMonths)
  const pendingSeries = trendMonths.map(({ key }) => windowTx.filter((t) => t.tx_date.slice(0, 7) === key && t.status === 'pending').length)
  const balances = balanceSeries(creditBalance.available, purchaseRows ?? [], windowTx.filter((t) => t.status !== 'flagged'), trendMonths)
  const dealersTrading = new Set(monthTx.map((t) => t.dealer_id)).size

  const statement = (statements ?? []).find((s) => (s.month as string).slice(0, 7) === periodKey)

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
      <PageHeader
        title="Dashboard"
        subtitle={
          period.auto
            ? `Showing ${periodLabel} — nothing verified in ${formatMonthLabel(currentMonthStr)} yet.`
            : periodIsCurrent
              ? `${periodLabel} · day ${dayOfMonth} of ${daysInPeriod}`
              : periodLabel
        }
        action={<PeriodSwitcher months={trendMonths} selected={periodKey} compareLabel={prevMonthLabel ?? undefined} />}
      />

      {/* Same shape as master, re-pointed at what an accountant acts on:
          volume they have to record and verify, not the commission the
          business keeps. */}
      <NeedsAttention items={alerts} />

      <div className="page-band">
        <StatTiles
          stats={[
            {
              label: `Top-up — ${periodLabel}`,
              value: `${totalPoints.toLocaleString()} pts`,
              href: `/records?status=verified&month=${periodKey}`,
              chg: pointsChg,
              spark: pointsSeries,
              sub: periodComplete ? undefined : `day ${dayOfMonth} of ${daysInPeriod} · on track for ${projectedPoints.toLocaleString()} pts`,
            },
            {
              label: 'Pending review',
              value: String(pendingCount),
              href: '/records?status=pending',
              spark: pendingSeries,
              sub: pendingCount && oldestPendingDays >= PENDING_REVIEW_STALE_DAYS ? `oldest waiting ${oldestPendingDays}d` : 'nothing waiting',
            },
            {
              label: 'Dealers trading',
              value: String(dealersTrading),
              href: '/dealers',
              spark: tradingSeries,
              sub: `recorded a verified top-up in ${periodLabel}`,
            },
            {
              label: 'Credit balance',
              value: `${creditBalance.available.toLocaleString()} pts`,
              href: '/purchases',
              spark: balances,
              sub: creditBalance.available < LOW_BALANCE_THRESHOLD ? 'below the low-balance threshold' : 'as it stands today',
            },
          ]}
        />
      </div>

      <div className="page-band">
        <h3 className="mb-1 text-sm font-semibold text-paper">Reconciliation {periodKey}</h3>
        <p className="mb-3 text-[12px] text-paper-dim">Until this is closed, the month is not final.</p>
        <Link href="/reconcile" className="inline-flex items-center gap-2 text-[14px] font-semibold hover:underline">
          <span className={`h-2 w-2 rounded-full ${statement?.reconciled ? 'bg-jade' : 'bg-clay'}`} />
          <span className={statement?.reconciled ? 'text-jade-bright' : 'text-clay-bright'}>{statement?.reconciled ? 'Closed' : 'Open'}</span>
        </Link>
      </div>

      {/* Three sections became one — see the note in the master branch. */}
      <div className="page-band">
        <h3 className="mb-1 text-sm font-semibold text-paper">{periodLabel}</h3>
        <p className="mb-5 text-[12px] text-paper-dim">Who bought, and where it came from.</p>
        <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2">
          <div>
            <h4 className="mb-2.5 text-[12px] font-semibold text-paper">Top dealers</h4>
            {leaders.length ? (
              <Leaderboard rows={leaders} />
            ) : ghostLeaders.length ? (
              <GhostEmpty
                note={`Nothing verified in ${periodLabel} yet. This is how ${prevMonthLabel} finished:`}
                action={
                  prevMonthKey ? (
                    <Link href={`/dashboard?month=${prevMonthKey}`} className="font-semibold text-primary hover:underline">
                      Open {prevMonthLabel} →
                    </Link>
                  ) : null
                }
              >
                <Leaderboard rows={ghostLeaders} />
              </GhostEmpty>
            ) : (
              <p className="text-[13px] text-paper-dim">No verified top-ups on record yet.</p>
            )}
          </div>
          <div>
            <h4 className="mb-2.5 text-[12px] font-semibold text-paper">By region</h4>
            {regionGrowth.length ? (
              <RegionBars rows={regionGrowth.map((r) => ({ region: r.region, points: r.points }))} />
            ) : ghostRegions.length ? (
              <GhostEmpty note={`Regions light up as top-ups are verified. ${prevMonthLabel} looked like this:`}>
                <RegionBars rows={ghostRegions.map((r) => ({ region: r.region, points: r.points }))} />
              </GhostEmpty>
            ) : (
              <p className="text-[13px] text-paper-dim">No verified transactions on record yet.</p>
            )}
          </div>
        </div>
      </div>

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
// read-only count) and the dealer roster, instead of the finance-facing
// trend chart.
async function CsDashboard({ supabase, userId, monthParam }: { supabase: SupabaseClient; userId: string; monthParam?: string }) {
  const today = todayInMalaysia()
  const monthStart = `${today.slice(0, 7)}-01`
  // monthParam is accepted and ignored on purpose. There is no period
  // switcher here because nothing on this dashboard is a monthly report — it
  // is a delivery queue and a dealer roster, both of which are "right now".
  void monthParam

  const [
    { data: deliveryListRows, count: pendingDeliveryCount },
    { count: dealerCount },
    { count: dealerCountLastMonth },
    activityMap,
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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Dashboard" subtitle={formatMonthLabel(monthStart.slice(0, 7))} />

      {/* Same ranking as the other two roles: the work first. */}
      <NeedsAttention items={alerts} />

      {/* cs has no financial visibility, so these are the roster and the queue
          rather than money. No sparklines: the series behind them are
          transaction values cs is not allowed to see.

          A card, not a band of four equal tiles. On a quiet day — which for
          cs is most days, since the job is to clear the queue — every figure
          here is zero and the whole page was one 52px strip followed by a
          screen of bare canvas with text floating on it. The queue is what cs
          opens this page to see, so it leads, the way pending review leads on
          /records. */}
      <HeroCard
        label={pendingDeliveryCount ? 'SIM deliveries waiting' : 'No SIM deliveries waiting'}
        value={String(pendingDeliveryCount ?? 0)}
        href="/delivery"
        chgSuffix={
          pendingDeliveryCount
            ? oldestDeliveryDays >= DELIVERY_WARN_DAYS_THRESHOLD
              ? `oldest has been waiting ${oldestDeliveryDays} days`
              : 'all recently queued'
            : 'every SIM ordered has been sent'
        }
        stats={[
          {
            label: 'Needs follow-up',
            value: String(inactiveCount),
            href: '/dealers?view=inactive',
            tone: inactiveCount ? 'caution' : 'normal',
            sub: 'no verified top-up in 30+ days',
          },
          { label: 'Dealers', value: String(dealerCount ?? 0), href: '/dealers', sub: 'on the roster' },
          {
            label: 'New this month',
            value: String((dealerCount ?? 0) - (dealerCountLastMonth ?? 0)),
            href: '/dealers',
            sub: 'onboarded since the 1st',
          },
        ]}
      />

      {/* No "Top-up by region" here, though the other two dashboards have one.
          It was here, and it could never have worked: it read the transactions
          table directly, and transactions_select_finance grants SELECT to
          accountant and master only. Every render fell through to "No verified
          transactions on record yet" — on a database holding 218 of them.
          Which is worse than a blank panel, because it is a specific claim,
          and it is false.

          Not fixed by widening what cs can read. Points are money, and the
          note below says why cs does not get money. The activity cs does see —
          which dealers have gone quiet — comes through
          dealer_last_verified_activity, a view carrying dealer_id and a date
          and no amount at all. That is the shape of what this role is allowed
          to know, and a regional points ranking is not it. */}

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

