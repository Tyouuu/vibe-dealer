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
import Link from 'next/link'
import { Leaderboard, GhostEmpty } from './elements'
import { MonthChart, RegionStrip } from './chart'
import { PeriodSwitcher } from './period-switcher'
import { resolvePeriod, sameSpanTotal } from '@/lib/dashboard-period'
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

/**
 * The same transactions, summed by DAY instead of by month.
 *
 * monthlySeries — six numbers for six months, deleted with the last
 * sparkline that consumed it — is why the
 * headline chart was a six-point zigzag — "那条线可以更加细节一点". Every row
 * in `trendTx` carries its own tx_date, so the resolution was always there
 * and was being thrown away. This returns a running total, one entry per
 * day, because a cumulative line is what makes two months comparable: their
 * daily totals are noise, their running totals are a race.
 *
 * `upto` caps it at today for a month still in progress — the point of
 * stopping the line is that the empty right-hand side reads as "not yet"
 * rather than as a collapse to zero.
 */
function dailyCumulative(
  tx: { tx_date: string; points: number | string; commission_rm?: number | string }[],
  monthKey: string,
  daysInMonth: number,
  field: 'points' | 'commission_rm',
  upto?: number,
): number[] {
  const perDay = new Array<number>(daysInMonth).fill(0)
  for (const t of tx) {
    if (t.tx_date.slice(0, 7) !== monthKey) continue
    const d = Number(t.tx_date.slice(8, 10))
    if (d >= 1 && d <= daysInMonth) perDay[d - 1] += Number(t[field] ?? 0)
  }
  const end = Math.max(1, Math.min(upto ?? daysInMonth, daysInMonth))
  const out: number[] = []
  let run = 0
  for (let i = 0; i < end; i++) {
    run += perDay[i]
    out.push(run)
  }
  return out
}

/**
 * How long the credit on hand lasts at the rate it is being sold.
 *
 * Nothing in this app answers "when do I need to buy from Vibe again" — the
 * balance is printed on three pages and the burn rate on none, so the owner
 * does the division in his head. Both numbers were already on this page.
 *
 * Returns null when there is nothing to divide by, and that matters: on
 * production today there are zero transactions, so a runway would be either
 * a crash or a meaningless infinity. A figure that cannot exist yet does not
 * get a placeholder — the same rule Reconciliation is built on.
 */
function creditRunwayDays(available: number, soldThisPeriod: number, elapsedDays: number): number | null {
  if (available <= 0 || soldThisPeriod <= 0 || elapsedDays <= 0) return null
  const perDay = soldThisPeriod / elapsedDays
  if (!Number.isFinite(perDay) || perDay <= 0) return null
  return Math.floor(available / perDay)
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

  // Four reads, down from seven. The three that went were the ones feeding
  // blocks this page no longer has: the last ten transactions, every
  // transaction of any status across six months, and every credit purchase
  // across six months. See the note further down for why they went with the
  // sparklines rather than staying behind them.
  const [{ data: dealerRows }, { data: trendTx }, { data: simOrders }, creditBalance, alerts] = await Promise.all([
    // Was a head-only count. It now returns the roster's package column too,
    // which is the same round trip and answers a question the count could
    // not: how many of these dealers can actually trade. See the "Can't
    // trade yet" band below.
    supabase.from('dealers_directory').select('id, company_name, region, package, status'),
    // The one read the whole page is built on. Every verified transaction in
    // the six-month window, each with its own tx_date — which is what makes
    // the day-resolution chart possible without asking for anything new.
    supabase
      .from('transactions')
      .select('dealer_id, tx_date, points, commission_rm, dealers(company_name, region)')
      .eq('status', 'verified')
      .gte('tx_date', trendStart)
      .lte('tx_date', today),
    // The second revenue line, which this page had never shown.
    //
    // Monthly Report leads with "What you made — August 2026 · RM 2,008.80";
    // this page led with "Your commission · RM 1,949.30". The RM 59.50
    // between them is the margin on SIM cards, and the owner reading both in
    // the same minute has no way to know that. Same figure on both pages
    // now, built the same way — see marginOf in reports/page.tsx: net of
    // shipping, because the fee is what was paid to send them.
    supabase.from('sim_orders').select('order_date, quantity, unit_price_rm, unit_cost_rm, shipping_fee_rm').gte('order_date', trendStart).lte('order_date', today),
    getAvailablePointsBalance(supabase),
    // Same list the bell and /notifications show — getNotifications is
    // request-cached, so this doesn't re-run the layout's queries.
    getNotifications(user.id, 'master'),
  ])

  // ---- which month the page is showing ---------------------------------
  const monthsWithData = new Set((trendTx ?? []).map((t) => t.tx_date.slice(0, 7)))
  const period = resolvePeriod(monthParam, trendMonths, monthsWithData)
  const periodKey = period.key
  const periodIsCurrent = periodKey === currentMonthStr
  const periodIdx = trendMonths.findIndex((m) => m.key === periodKey)
  const prevMonthKey = periodIdx > 0 ? trendMonths[periodIdx - 1].key : null

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
  // The commission-only change and projection went with the commission-only
  // headline. Both now live as earnedChg / projectedEarned further down,
  // computed over commission PLUS SIM margin — because that is what the
  // figure above them says, and two of them would be two answers to "how is
  // the month going".

  const regionGrowth = buildRegionGrowth(monthTx, totalPoints)
  const leaders = topDealers(monthTx)

  // ---- what to show in place of an empty month -------------------------
  // Not a line of grey text. The month before, drawn faint, so an empty
  // section still tells you what belongs there and how it last looked.
  // No ghostRegions any more: By region is a stacked strip now, and a strip
  // of last month's shares standing in for this month's would read as this
  // month's. The leaderboard's ghost survives because it is a list of names
  // with a sentence over it saying whose month it is.
  const prevMonthTx = prevMonthKey ? (trendTx ?? []).filter((t) => t.tx_date.slice(0, 7) === prevMonthKey) : []
  const ghostLeaders = topDealers(prevMonthTx)

  // ---- who stopped buying ----------------------------------------------
  // Dealers who bought last month and have bought nothing this month,
  // ranked by how much business went quiet rather than by how long they have
  // been silent.
  //
  // That ordering is the whole point. The notification builder already
  // watches for inactivity, but on a 30-day threshold — so on the demo month
  // it names Klang Valley Reload Centre (3,000 pts in July) and says nothing
  // about Teluk Intan Mobile Hub, which bought 36,000 pts in July and has
  // bought nothing since. A twelve-fold difference in what is at stake, and
  // the quiet one is the one that gets mentioned.
  //
  // No new query: trendTx already spans six months, so both sides of this
  // comparison are in memory.
  // ---- who cannot buy at all -------------------------------------------
  // A dealer with no package has no rate, and /entry's guard refuses a
  // top-up it cannot price. So these are not slow dealers — they are
  // dealers the system will not let trade, and nothing in the app said how
  // many there were. On production that is 242 of 284, which is the largest
  // single fact about the business right now and it was only visible by
  // reading the Package column down a five-page table.
  //
  // No new query: the roster read that produced "34 dealers" now returns the
  // package column with it.
  const dealerCount = dealerRows?.length ?? 0
  const noPackage = (dealerRows ?? []).filter((d) => !d.package && d.status === 'active')

  const activeThisPeriod = new Set(monthTx.map((t) => t.dealer_id))
  const wentQuiet = topDealers(prevMonthTx)
    .filter((d) => !activeThisPeriod.has(d.id))
    .slice(0, 5)
  const wentQuietTotal = topDealers(prevMonthTx)
    .filter((d) => !activeThisPeriod.has(d.id))
    .reduce((s, d) => s + d.points, 0)
  const wentQuietCount = topDealers(prevMonthTx).filter((d) => !activeThisPeriod.has(d.id)).length

  // ---- the headline chart, day by day ----------------------------------
  // Six monthly totals became one month at day resolution — see
  // dailyCumulative. Same query, same rows.
  const elapsed = periodComplete ? daysInPeriod : dayOfMonth

  // SIM margin, shaped like a transaction so the same day-summing code works
  // on both. margin = quantity × (price − cost) − shipping, net of the fee
  // paid to send them, which is how reports/page.tsx computes it.
  const simAsTx = (simOrders ?? []).map((o) => ({
    tx_date: o.order_date as string,
    points: 0,
    commission_rm:
      Number(o.quantity) * (Number(o.unit_price_rm) - Number(o.unit_cost_rm)) - Number(o.shipping_fee_rm ?? 0),
  }))
  const earnedTx = [...(trendTx ?? []).map((t) => ({ tx_date: t.tx_date, points: 0, commission_rm: Number(t.commission_rm) })), ...simAsTx]
  const simMarginPeriod = simAsTx.filter((o) => o.tx_date.slice(0, 7) === periodKey).reduce((s, o) => s + o.commission_rm, 0)
  const totalEarned = totalCommission + simMarginPeriod
  const prevSpanSim = prevMonthKey ? sameSpanTotal(simAsTx, prevMonthKey, spanDays, 'commission_rm') : 0
  const prevSpanEarned = prevSpanCommission + prevSpanSim
  const earnedChg = prevSpanEarned > 0 ? pctChange(totalEarned, prevSpanEarned) : null
  const projectedEarned = periodComplete || dayOfMonth === 0 ? totalEarned : (totalEarned / dayOfMonth) * daysInPeriod

  const dailyCommission = dailyCumulative(earnedTx, periodKey, daysInPeriod, 'commission_rm', elapsed)
  const prevDaysInMonth = prevMonthKey
    ? new Date(Date.UTC(Number(prevMonthKey.slice(0, 4)), Number(prevMonthKey.slice(5, 7)), 0)).getUTCDate()
    : 0
  const prevDailyRaw = prevMonthKey ? dailyCumulative(earnedTx, prevMonthKey, prevDaysInMonth, 'commission_rm') : []
  // Day 1 to day 13 of last month against day 1 to day 13 of this one — the
  // same span the "↓5.4%" beside it is computed over. An earlier version
  // stretched the whole of last month across this month's axis, which made
  // the chart's comparison and the headline's comparison two different
  // things sitting an inch apart.
  const prevDaily = prevDailyRaw.slice(0, Math.min(elapsed, prevDailyRaw.length))
  const prevMonthCommission = prevDailyRaw.length ? prevDailyRaw[prevDailyRaw.length - 1] : 0

  const soldThisPeriod = totalPoints
  const runwayDays = creditRunwayDays(creditBalance.available, soldThisPeriod, elapsed)
  // Computed once: pctChange returns null when there is no baseline, and
  // calling it twice inline made the null-check and the use two separate
  // expressions that TypeScript could not tie together.
  const pointsChg = prevSpanPoints > 0 ? pctChange(totalPoints, prevSpanPoints) : null

  const dealersTrading = new Set(monthTx.map((t) => t.dealer_id)).size

  // Three series and their three queries went with the four sparklines.
  //
  // pointsSeries, tradingSeries and balanceSeries each drew a 46px stub on a
  // tile that no longer exists, and balanceSeries alone needed two of this
  // page's seven reads — every credit purchase in the window, and every
  // transaction of any status in the window. Recent Transactions took a
  // third. Deleting the tiles without deleting the reads would have left the
  // most-visited page in the app doing three round trips for nothing, which
  // is the kind of thing that survives a redesign for years.
  //
  // Master's dashboard is now four queries instead of seven.

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

      {/* One figure, not four peers.
          =================================================================
          This row used to be four 22px numbers with four sparklines, and the
          largest text on the page was the word "Dashboard" at 24px — so the
          one page everybody lands on was the only page in the app that did
          not lead with an answer. Every other page does: Dealers opens on
          38px "34", Transactions on 38px "22", Monthly Report on 38px
          "RM 2,008.80".

          Two of the four were also the same series. Commission is 2% of
          top-up by definition, so normalised into equal boxes their paths
          were byte-identical — measured, not guessed: both drew
          "M3.0 43.0 L41.8 43.0 … L197.0 30.6". Half the chart row carried
          one fact. Top-up is now a figure in the line under the headline,
          which is the only place it was adding anything.

          The other two keep their numbers and lose their sparklines. That is
          the trade the client accepted: the trend that matters daily is the
          money, and it now gets a real chart instead of a 46px stub. */}
      <div className="page-band">
        <div>
          {/* "What you made", and both lines of it.
              ===========================================================
              This said "Your commission" and printed RM 1,949.30 while
              Monthly Report, one click away, said "What you made — August
              2026 · RM 2,008.80". The RM 59.50 between them is the margin on
              SIM cards — a whole revenue stream this page had never named —
              and nothing told the reader that. Same figure, same wording,
              same arithmetic on both pages now, with the split on the line
              underneath so the headline stays one number. */}
          <Link href={`/reports?month=${periodKey}`} className="group inline-block">
            <div className="text-[12px] text-paper-dim">What you made — {periodLabel}</div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
              <span className="figure-money text-[38px] leading-none tracking-[-.03em] group-hover:underline">{formatMYR(totalEarned)}</span>
              {earnedChg != null && (
                <span className={`chg text-[14px] ${earnedChg === 0 ? 'chg-warn' : earnedChg > 0 ? 'chg-up' : 'chg-down'}`}>
                  {earnedChg === 0 ? '→' : earnedChg > 0 ? '↑' : '↓'} {Math.abs(Math.round(earnedChg * 10) / 10).toFixed(1)}%
                </span>
              )}
              {prevSpanEarned > 0 && prevMonthLabel && (
                <span className="text-[12px] text-paper-dim">
                  {prevMonthLabel} same span {formatMYR(prevSpanEarned)}
                </span>
              )}
            </div>
          </Link>
          <div className="mt-1 text-[12px] text-paper-dim">
            Points 2% <b className="figure font-semibold text-paper">{formatMYR(totalCommission)}</b>
            {simMarginPeriod !== 0 && (
              <>
                {' · '}SIM cards <b className="figure font-semibold text-paper">{formatMYR(simMarginPeriod)}</b> margin
              </>
            )}
          </div>

          <MonthChart
            id="dash-month"
            daily={dailyCommission}
            ghost={prevDaily.length > 1 ? prevDaily : undefined}
            days={daysInPeriod}
            projected={periodComplete ? undefined : projectedEarned}
            ghostLabel={prevDaily.length > 1 && prevMonthLabel ? prevMonthLabel : undefined}
            targetLabel={[
              // Not "July 2026 finished at…" — the key swatch beside it
              // already says July 2026, and printing the month twice on one
              // 11px line is the same duplication this page just lost four
              // sparklines over.
              prevMonthCommission > 0 ? `finished at ${formatMYR(prevMonthCommission)}` : null,
              periodComplete ? null : `day ${dayOfMonth} of ${daysInPeriod} · at this rate ${formatMYR(projectedEarned)} by month end`,
            ]
              .filter(Boolean)
              .join(' · ')}
          />

          <div className="mt-4 border-t border-ink-800 pt-3.5">
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[12px] text-paper-dim">
              <span>
                Sold{' '}
                <Link href={`/records?status=verified&month=${periodKey}`} className="figure font-semibold text-paper hover:underline">
                  {totalPoints.toLocaleString()}
                </Link>{' '}
                pts
                {pointsChg != null && (
                  <span className="ml-1.5">
                    ({pointsChg >= 0 ? '+' : ''}
                    {Math.round(pointsChg * 10) / 10}%)
                  </span>
                )}
              </span>
              <span>
                <Link href="/dealers" className="figure font-semibold text-paper hover:underline">
                  {dealersTrading}
                </Link>{' '}
                / {dealerCount} dealers traded
              </span>
              <span>
                Credit{' '}
                <Link href="/purchases" className="figure font-semibold text-paper hover:underline">
                  {creditBalance.available.toLocaleString()}
                </Link>{' '}
                pts
                {/* Only when it can be worked out. On a month with no sales
                    the divisor is zero, and production has exactly that
                    today — so this whole clause is absent rather than
                    showing an infinity or a dash. */}
                {runwayDays != null && (
                  <span
                    className={`ml-1.5 font-semibold ${runwayDays < 15 ? 'text-clay-bright' : runwayDays < 45 ? 'text-brass-bright' : 'text-jade-bright'}`}
                  >
                    ~{runwayDays} days left at this rate
                  </span>
                )}
                {runwayDays == null && creditBalance.available < LOW_BALANCE_THRESHOLD && (
                  <span className="ml-1.5 font-semibold text-brass-bright">below the low-balance threshold</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top five, and the regions as one band.
          =================================================================
          Two eight-row bar lists side by side came to 486px — 29% of the
          page — for a question /dealers already answers with a ranked table
          and a podium. Not redundant enough to delete: /dealers ranks by
          CUMULATIVE top-up and has no region cut at all, while this is "who
          bought THIS month". But it does not need to be a second
          leaderboard.

          Five names instead of eight-plus-a-disclosure, and By region
          collapses to one stacked strip — the right shape for it anyway,
          because a region is a share of a whole and a dealer is not. */}
      <div className="page-band">
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <h3 className="text-sm font-semibold text-paper">Who bought — {periodLabel}</h3>
            <p className="text-[12px] text-paper-dim">Ranked by what they topped up this month.</p>
          </div>
          <Link href="/dealers" className="text-[12px] font-semibold text-primary hover:underline">
            All {dealerCount} dealers →
          </Link>
        </div>

        {leaders.length ? (
          <Leaderboard rows={leaders.slice(0, 5)} />
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
            <Leaderboard rows={ghostLeaders.slice(0, 5)} />
          </GhostEmpty>
        ) : (
          <p className="text-[13px] text-paper-dim">No verified top-ups on record yet.</p>
        )}

        {regionGrowth.length > 0 && (
          <div className="mt-4 border-t border-ink-800 pt-3.5">
            <p className="mb-2 text-[12px] font-semibold text-paper">By region</p>
            <RegionStrip rows={regionGrowth.map((r) => ({ region: r.region, points: r.points }))} />
          </div>
        )}
      </div>

      {/* Who stopped buying.
          =================================================================
          The one block on this page that is not a smaller copy of another
          page. /dealers ranks who is biggest; nothing anywhere answers "who
          was buying last month and has gone quiet", which for a business
          with 34 trading dealers is the question that costs money.

          Ranked by what went quiet, not by how long they have been silent.
          The notification builder already watches inactivity on a 30-day
          threshold, and on this month's data that makes it name Klang Valley
          Reload Centre — 3,000 pts in July — while saying nothing about
          Teluk Intan Mobile Hub, which bought 36,000 pts in July and has
          bought nothing since. Twelve times the money, no mention.

          Rows, not bars. "Who bought" directly above is already a bar list,
          and two bar lists on one page is exactly what made Top dealers and
          By region read as one thing in two columns.

          Absent, not empty, when nobody has gone quiet — which is the
          healthy state and should take no room at all. */}
      {wentQuiet.length > 0 && prevMonthLabel && (
        <div className="page-band">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h3 className="text-sm font-semibold text-paper">Went quiet</h3>
              <p className="text-[12px] text-paper-dim">
                Bought in {prevMonthLabel}, nothing yet in {periodLabel}.
              </p>
            </div>
            <Link href="/dealers?view=inactive" className="text-[12px] font-semibold text-primary hover:underline">
              All dealers →
            </Link>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="figure-points text-[26px] leading-none tracking-[-.03em] text-paper">{wentQuietCount}</span>
            <span className="text-[12px] text-paper-dim">
              {wentQuietCount === 1 ? 'dealer' : 'dealers'} · <b className="figure font-semibold text-paper">{wentQuietTotal.toLocaleString()}</b> pts of{' '}
              {prevMonthLabel} business
            </span>
          </div>

          <ul className="mt-3 flex flex-col">
            {wentQuiet.map((d) => (
              <li key={d.id} className="border-t border-ink-800">
                <Link href={d.href} className="group flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-paper group-hover:underline" title={d.name}>
                    {d.name}
                  </span>
                  {/* No "in July 2026" on the row — the line above the list
                      already says which month these figures are from, and
                      repeating it four times is the same duplication this
                      page lost four sparklines over. */}
                  <span className="whitespace-nowrap text-[12px] text-paper-dim">
                    <b className="figure font-semibold text-paper">{d.points.toLocaleString()}</b> pts
                  </span>
                </Link>
              </li>
            ))}
            {wentQuietCount > wentQuiet.length && (
              <li className="border-t border-ink-800 py-2.5 text-[12px] text-paper-dim">
                and {wentQuietCount - wentQuiet.length} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Who cannot buy at all.
          =================================================================
          Paired with Went quiet directly above on purpose: one is the
          business that stopped, the other is the business that has never
          been able to start. Same row shape, same cap, same "and N more".

          A dealer with no package has no rate, so /entry's credit guard
          refuses the top-up — this is not a slow dealer, it is a dealer the
          system will not let trade. Production has 242 of them against 284
          on the roster, and until now the only way to see that was to read
          the Package column down five pages of /dealers. The link goes to
          that list, filtered, rather than to the roster.

          Absent when everybody can trade, same as Went quiet. */}
      {noPackage.length > 0 && (
        <div className="page-band">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h3 className="text-sm font-semibold text-paper">Can&rsquo;t trade yet</h3>
              <p className="text-[12px] text-paper-dim">No package, so no rate — a top-up would be refused.</p>
            </div>
            <Link href="/dealers?view=nopackage" className="text-[12px] font-semibold text-primary hover:underline">
              Set packages →
            </Link>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="figure-points text-[26px] leading-none tracking-[-.03em] text-paper">{noPackage.length}</span>
            <span className="text-[12px] text-paper-dim">
              of <b className="figure font-semibold text-paper">{dealerCount}</b> dealers on the roster
            </span>
          </div>

          <ul className="mt-3 flex flex-col">
            {[...noPackage]
              .sort((a, b) => (a.company_name ?? '').localeCompare(b.company_name ?? ''))
              .slice(0, 5)
              .map((d) => (
                <li key={d.id} className="border-t border-ink-800">
                  <Link href={`/dealers/${d.id}`} className="group flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-paper group-hover:underline" title={d.company_name ?? ''}>
                      {d.company_name}
                    </span>
                    <span className="whitespace-nowrap text-[12px] text-paper-dim">{d.region || 'No region'}</span>
                  </Link>
                </li>
              ))}
            {noPackage.length > 5 && (
              <li className="border-t border-ink-800 py-2.5 text-[12px] text-paper-dim">and {noPackage.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      {/* Recent Transactions is gone.
          =================================================================
          It was the tallest block on the page at 605px — 37% of it — and its
          columns were Txn Id / Date / Dealer / Type / Status / Points /
          Amount: /records with fewer rows and one filter instead of seven.
          Seeing a row here that needed handling still meant going to
          /records to handle it, so it was a detour rather than a
          destination, and the rail already carries the only number it was
          really delivering — the pending count.

          1,649px to roughly 940px, which is one screen. */}
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

  // Five reads, down from eight, and the page is the same shape master's is.
  //
  // What went, and why:
  //   the last ten transactions   Recent Transactions — /records with fewer
  //                               rows and one filter, same as on master
  //   six months of any-status    fed one sparkline (pending per month)
  //   six months of purchases     fed one sparkline (the balance line)
  //   every statement in window   the Reconciliation band, which repeated an
  //                               alert sitting 200px above it
  const [{ data: pendingRows }, creditBalance, { data: trendTx }, { count: dealerCount }, alerts] = await Promise.all([
    supabase.from('transactions').select('id, tx_date').eq('status', 'pending'),
    getAvailablePointsBalance(supabase),
    // The one read the page is built on — every verified transaction in the
    // window with its own tx_date, which is what makes the day-resolution
    // chart possible without asking for anything new.
    supabase
      .from('transactions')
      .select('dealer_id, tx_date, points, dealers(region, company_name)')
      .eq('status', 'verified')
      .gte('tx_date', trendStart)
      .lte('tx_date', today),
    supabase.from('dealers_directory').select('id', { count: 'exact', head: true }),
    getNotifications(userId, 'accountant'),
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
  const ghostLeaders = topDealers(prevMonthTx)
  const dealersTrading = new Set(monthTx.map((t) => t.dealer_id)).size

  // The same chart master has, on the figure an accountant actually works in.
  // Points, not ringgit: this role records and verifies volume, and the
  // commission the business keeps is master's question.
  const elapsed = periodComplete ? daysInPeriod : dayOfMonth
  const dailyPoints = dailyCumulative(trendTx ?? [], periodKey, daysInPeriod, 'points', elapsed)
  const prevDaysInMonth = prevMonthKey
    ? new Date(Date.UTC(Number(prevMonthKey.slice(0, 4)), Number(prevMonthKey.slice(5, 7)), 0)).getUTCDate()
    : 0
  const prevDailyRaw = prevMonthKey ? dailyCumulative(trendTx ?? [], prevMonthKey, prevDaysInMonth, 'points') : []
  const prevDaily = prevDailyRaw.slice(0, Math.min(elapsed, prevDailyRaw.length))
  const prevMonthPointsTotal = prevDailyRaw.length ? prevDailyRaw[prevDailyRaw.length - 1] : 0
  const runwayDays = creditRunwayDays(creditBalance.available, totalPoints, elapsed)

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

      {/* One figure and a real chart, in place of four tiles and four 46px
          sparklines.
          =================================================================
          The four tiles were Top-up / Pending review / Dealers trading /
          Credit balance, all at 22px, so — exactly as on master before the
          rebuild — the largest text on the accountant's dashboard was the
          word "Dashboard". Three of the four are facts you read once and act
          on elsewhere; only the volume has a shape worth drawing, and it now
          gets 31 points instead of a stub. The other three keep their
          numbers on the line under the chart.

          The Reconciliation band is gone with them. It printed a dot and the
          word "Open" linking to /reconcile, while the alert card 200px above
          it already said "2026-08 statement not reconciled · Go to
          Reconciliation →" — the same fact, twice, and the alert is the one
          that also tells you it is late. Its one loss is honest: for a PAST
          period the band could say whether that month was closed, and now
          that question belongs to /reconcile, which is where it is answered
          properly. */}
      <div className="page-band">
        <div>
          <Link href={`/records?status=verified&month=${periodKey}`} className="group inline-block">
            <div className="text-[12px] text-paper-dim">Top-up recorded — {periodLabel}</div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
              <span className="figure-points text-[38px] leading-none tracking-[-.03em] group-hover:underline">
                {totalPoints.toLocaleString()}
              </span>
              <span className="text-[13px] text-paper-dim">pts</span>
              {pointsChg != null && (
                <span className={`chg text-[14px] ${pointsChg === 0 ? 'chg-warn' : pointsChg > 0 ? 'chg-up' : 'chg-down'}`}>
                  {pointsChg === 0 ? '→' : pointsChg > 0 ? '↑' : '↓'} {Math.abs(Math.round(pointsChg * 10) / 10).toFixed(1)}%
                </span>
              )}
              {prevSpanPoints > 0 && prevMonthLabel && (
                <span className="text-[12px] text-paper-dim">
                  {prevMonthLabel} same span {prevSpanPoints.toLocaleString()} pts
                </span>
              )}
            </div>
          </Link>

          <MonthChart
            id="acct-month"
            daily={dailyPoints}
            ghost={prevDaily.length > 1 ? prevDaily : undefined}
            days={daysInPeriod}
            projected={periodComplete ? undefined : projectedPoints}
            ghostLabel={prevDaily.length > 1 && prevMonthLabel ? prevMonthLabel : undefined}
            targetLabel={[
              prevMonthPointsTotal > 0 ? `finished at ${prevMonthPointsTotal.toLocaleString()} pts` : null,
              periodComplete ? null : `day ${dayOfMonth} of ${daysInPeriod} · at this rate ${projectedPoints.toLocaleString()} pts by month end`,
            ]
              .filter(Boolean)
              .join(' · ')}
          />

          <div className="mt-4 border-t border-ink-800 pt-3.5">
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[12px] text-paper-dim">
              <span>
                Pending review{' '}
                <Link href="/records?status=pending" className="figure font-semibold text-paper hover:underline">
                  {pendingCount}
                </Link>
                {pendingCount > 0 && oldestPendingDays >= PENDING_REVIEW_STALE_DAYS && (
                  <span className="ml-1.5 font-semibold text-brass-bright">oldest waiting {oldestPendingDays}d</span>
                )}
              </span>
              <span>
                <Link href="/dealers" className="figure font-semibold text-paper hover:underline">
                  {dealersTrading}
                </Link>{' '}
                / {dealerCount ?? 0} dealers traded
              </span>
              <span>
                Credit{' '}
                <Link href="/purchases" className="figure font-semibold text-paper hover:underline">
                  {creditBalance.available.toLocaleString()}
                </Link>{' '}
                pts
                {runwayDays != null && (
                  <span
                    className={`ml-1.5 font-semibold ${runwayDays < 15 ? 'text-clay-bright' : runwayDays < 45 ? 'text-brass-bright' : 'text-jade-bright'}`}
                  >
                    ~{runwayDays} days left at this rate
                  </span>
                )}
                {runwayDays == null && creditBalance.available < LOW_BALANCE_THRESHOLD && (
                  <span className="ml-1.5 font-semibold text-brass-bright">below the low-balance threshold</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Five names and one stacked strip, same as master — and for the same
          reason: two eight-row bar lists side by side read as one object, and
          a region is a share of a whole where a dealer is not. */}
      <div className="page-band">
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <h3 className="text-sm font-semibold text-paper">Who bought — {periodLabel}</h3>
            <p className="text-[12px] text-paper-dim">Ranked by what they topped up this month.</p>
          </div>
          <Link href="/dealers" className="text-[12px] font-semibold text-primary hover:underline">
            All {dealerCount ?? 0} dealers →
          </Link>
        </div>

        {leaders.length ? (
          <Leaderboard rows={leaders.slice(0, 5)} />
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
            <Leaderboard rows={ghostLeaders.slice(0, 5)} />
          </GhostEmpty>
        ) : (
          <p className="text-[13px] text-paper-dim">No verified top-ups on record yet.</p>
        )}

        {regionGrowth.length > 0 && (
          <div className="mt-4 border-t border-ink-800 pt-3.5">
            <p className="mb-2 text-[12px] font-semibold text-paper">By region</p>
            <RegionStrip rows={regionGrowth.map((r) => ({ region: r.region, points: r.points }))} />
          </div>
        )}
      </div>

      {/* No "Went quiet" and no "Can't trade yet" here, though master has
          both. Chasing a dealer who stopped buying is a sales job, and
          setting a package is one an accountant cannot do — canManage on
          /dealers is cs and master. A block whose action the reader is not
          allowed to take is a block that only makes the page longer. */}
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

