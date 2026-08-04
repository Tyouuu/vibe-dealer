import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { monthRange, previousMonth, currentMonth, todayInMalaysia, formatMonthLabel, formatDateLabel } from '@/lib/month'
import { MonthPicker } from '../month-picker'
import { ScrollFade } from '../scroll-fade'
import { PageHeader } from '../page-header'
import { pctChange } from '../hero-card'
import { resolveReportMonth } from '@/lib/reporting-month'
import { getAvailablePointsBalance } from '@/lib/credit-balance'
import { balanceSeries } from '@/lib/dashboard-period'
import { formatMYR } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Monthly Report — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ month?: string; by?: string }>
}

// This page used to run one query — verified transactions — and print the 2%
// it produced. That is a commission report, and it was the only monthly
// report in the app, so "what did I make in July" had no answer anywhere.
//
// Three things were missing and all three were already in the database:
//
//   * SIM cards are a second revenue line, living in sim_orders. Nothing on
//     this page had ever read that table, so a whole stream of margin was
//     invisible here.
//   * Anything not verified was dropped silently. A flagged transaction is
//     correctly excluded from the totals — it is disputed — but a report that
//     excludes something without saying so cannot be checked.
//   * Whether the month had been reconciled against Vibe's own statement did
//     not appear, even though that is what decides whether these figures can
//     be trusted at all. The trade's own warning: a statement that is 4% short
//     still looks fine at the bottom line, and dispute windows expire.
//
// It now also carries the cost side and the points ledger, which is the shape
// every distributor statement of account uses: opening balance, what moved,
// closing balance.
export default async function ReportsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { month: monthParam, by: byRaw } = await searchParams
  const by: 'dealer' | 'type' = byRaw === 'type' ? 'type' : 'dealer'

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="view monthly reports" />
  }

  const supabaseForMonth = await createClient()
  // Opens on the last month that has anything in it, the way the dashboard
  // already does. On the 3rd of a month this page led with "RM 0.00 ↓ 100%".
  const { month, auto: monthAuto } = await resolveReportMonth(supabaseForMonth, monthParam)

  const { start, end } = monthRange(month)
  const prevMonth = previousMonth(month)
  const { start: prevStart, end: prevEnd } = monthRange(prevMonth)
  const today = todayInMalaysia()
  const supabase = supabaseForMonth

  const [
    { data: monthTxAll },
    { data: prevRows },
    { data: simOrdersAll },
    { data: intakeRows },
    { data: statement },
    { data: ledgerPurchases },
    { data: ledgerCommitted },
    creditBalance,
  ] = await Promise.all([
    // Every status, not just verified. What was left out is part of the
    // report now, so it has to be fetched to be named.
    supabase
      .from('transactions')
      .select('dealer_id, type, package, status, points, money_rm, commission_rm, dealers(company_name)')
      .gte('tx_date', start)
      .lte('tx_date', end),
    supabase.from('transactions').select('points, money_rm, commission_rm').eq('status', 'verified').gte('tx_date', prevStart).lte('tx_date', prevEnd),
    // Both months in one read — this month's figures and last month's for the
    // comparison the headline makes.
    supabase.from('sim_orders').select('order_date, sim_type, quantity, unit_price_rm, unit_cost_rm, shipping_fee_rm').gte('order_date', prevStart).lte('order_date', end),
    supabase.from('sim_stock_intakes').select('quantity, cost_per_unit_rm').gte('intake_date', start).lte('intake_date', end),
    supabase.from('company_statements').select('reconciled, company_total_points, company_profit_rm').eq('month', `${month}-01`).maybeSingle(),
    // From the start of the month before through today: what balanceSeries
    // needs to walk the balance backwards from where it stands now.
    supabase.from('credit_purchases').select('purchase_date, money_rm, points').gte('purchase_date', prevStart),
    supabase.from('transactions').select('tx_date, points').neq('status', 'flagged').gte('tx_date', prevStart).lte('tx_date', today),
    getAvailablePointsBalance(supabase),
  ])

  const allTx = (monthTxAll ?? []) as {
    dealer_id: string
    type: string
    package: string | null
    status: string
    points: number | string
    money_rm: number | string
    commission_rm: number | string
    dealers: { company_name: string } | { company_name: string }[] | null
  }[]
  const rows = allTx.filter((t) => t.status === 'verified')

  // ---- what the month earned, both lines ---------------------------------
  const orders = (simOrdersAll ?? []) as {
    order_date: string
    sim_type: string
    quantity: number
    unit_price_rm: number | string
    unit_cost_rm: number | string
    shipping_fee_rm: number | string | null
  }[]
  const simThis = orders.filter((o) => o.order_date >= start && o.order_date <= end)
  const simPrev = orders.filter((o) => o.order_date >= prevStart && o.order_date <= prevEnd)
  // Net of shipping. The fee on an order is what was paid to send it, so it
  // comes off the margin — see the note on SIM Card Stock, where every margin
  // figure had been overstated by exactly this.
  const marginOf = (list: typeof orders) =>
    list.reduce((s, o) => s + o.quantity * (Number(o.unit_price_rm) - Number(o.unit_cost_rm)) - Number(o.shipping_fee_rm ?? 0), 0)
  const simRevenue = simThis.reduce((s, o) => s + o.quantity * Number(o.unit_price_rm), 0)
  const simShipping = simThis.reduce((s, o) => s + Number(o.shipping_fee_rm ?? 0), 0)
  const simCards = simThis.reduce((s, o) => s + o.quantity, 0)
  const simMargin = marginOf(simThis)

  const totalPoints = rows.reduce((s, t) => s + Number(t.points), 0)
  const totalMoney = rows.reduce((s, t) => s + Number(t.money_rm), 0)
  const totalCommission = rows.reduce((s, t) => s + Number(t.commission_rm), 0)

  const prevTotalCommission = (prevRows ?? []).reduce((s, t) => s + Number(t.commission_rm), 0)

  const totalEarned = totalCommission + simMargin
  const earnedChg = pctChange(totalEarned, prevTotalCommission + marginOf(simPrev))
  const prevEarned = prevTotalCommission + marginOf(simPrev)
  const moneyCollected = totalMoney + simRevenue

  // ---- what this report leaves out ---------------------------------------
  const excludedOf = (status: string) => {
    const list = allTx.filter((t) => t.status === status)
    return {
      count: list.length,
      points: list.reduce((s, t) => s + Number(t.points), 0),
      money: list.reduce((s, t) => s + Number(t.money_rm), 0),
      commission: list.reduce((s, t) => s + Number(t.commission_rm), 0),
    }
  }
  const flagged = excludedOf('flagged')
  const pending = excludedOf('pending')
  const excludedCount = flagged.count + pending.count

  // ---- has it been checked against Vibe -----------------------------------
  const companyPoints = statement?.company_total_points != null ? Number(statement.company_total_points) : null
  const variance = companyPoints != null ? Math.round((totalPoints - companyPoints) * 100) / 100 : null
  const isClosed = Boolean(statement?.reconciled)

  // ---- the points ledger --------------------------------------------------
  // Opening balance, what moved, closing balance — the shape a distributor
  // statement of account uses. balanceSeries walks backwards from the live
  // balance, so the closing figure ties to the number on Credit Purchases.
  const purchases = (ledgerPurchases ?? []) as { purchase_date: string; money_rm: number | string; points: number | string }[]
  const committed = (ledgerCommitted ?? []) as { tx_date: string; points: number | string }[]
  const [openingBalance, closingBalance] = balanceSeries(creditBalance.available, purchases, committed, [
    { key: prevMonth, label: '' },
    { key: month, label: '' },
  ])
  const inMonth = <T,>(list: T[], date: (t: T) => string) => list.filter((t) => date(t).slice(0, 7) === month)
  const pointsBought = inMonth(purchases, (p) => p.purchase_date).reduce((s, p) => s + Number(p.points), 0)
  const pointsSold = inMonth(committed, (t) => t.tx_date).reduce((s, t) => s + Number(t.points), 0)
  const paidToVibe = inMonth(purchases, (p) => p.purchase_date).reduce((s, p) => s + Number(p.money_rm), 0)
  const stockBought = (intakeRows ?? []).reduce((s, r) => s + r.quantity * Number(r.cost_per_unit_rm), 0)
  const cardsBought = (intakeRows ?? []).reduce((s, r) => s + r.quantity, 0)

  // ---- the breakdown table (unchanged in shape) ---------------------------
  const byDealer = new Map<string, { id: string; name: string; points: number; money: number; commission: number }>()
  for (const t of rows) {
    const rel = t.dealers
    const name = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    const prev = byDealer.get(t.dealer_id) ?? { id: t.dealer_id, name, points: 0, money: 0, commission: 0 }
    prev.points += Number(t.points)
    prev.money += Number(t.money_rm)
    prev.commission += Number(t.commission_rm)
    byDealer.set(t.dealer_id, prev)
  }

  // Same 3-way label already used on Records/Reconcile/dealer detail — group
  // by that instead of a new categorization, so "By type" reads the same
  // as the type column everywhere else in the app.
  const byType = new Map<string, { label: string; points: number; money: number; commission: number; count: number }>()
  for (const t of rows) {
    const label = t.type === 'package' ? `Package ${t.package}` : t.type === 'adjustment' ? 'Adjustment' : 'Top-up'
    const prev = byType.get(label) ?? { label, points: 0, money: 0, commission: 0, count: 0 }
    prev.points += Number(t.points)
    prev.money += Number(t.money_rm)
    prev.commission += Number(t.commission_rm)
    prev.count += 1
    byType.set(label, prev)
  }
  const typeBreakdown = [...byType.values()].sort((a, b) => b.money - a.money)

  const breakdown = [...byDealer.values()].sort((a, b) => b.points - a.points)
  const maxMoney = Math.max(...breakdown.map((d) => d.money), 0)

  // Per SIM type, so the second revenue line can be broken down the way the
  // first one is rather than arriving as a single figure.
  const simByType = new Map<string, { label: string; orders: number; cards: number; revenue: number; shipping: number; margin: number }>()
  for (const o of simThis) {
    const label = o.sim_type === 'esim' ? 'eSIM' : o.sim_type === 'physical_no_number' ? 'Physical (No Number)' : 'Physical (With Number)'
    const prev = simByType.get(label) ?? { label, orders: 0, cards: 0, revenue: 0, shipping: 0, margin: 0 }
    prev.orders += 1
    prev.cards += o.quantity
    prev.revenue += o.quantity * Number(o.unit_price_rm)
    prev.shipping += Number(o.shipping_fee_rm ?? 0)
    prev.margin += o.quantity * (Number(o.unit_price_rm) - Number(o.unit_cost_rm)) - Number(o.shipping_fee_rm ?? 0)
    simByType.set(label, prev)
  }
  const simBreakdown = [...simByType.values()].sort((a, b) => b.margin - a.margin)

  const monthLabel = formatMonthLabel(month)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Monthly Report"
        subtitle={
          /* The "showing an earlier month" notice used to lead this line.
             It explains a figure rather than the page, so it now sits under
             the figure — and it kept the subtitle to one line, which is what
             stops the month picker wrapping and pushing the card down on a
             phone. Same treatment as Reconciliation. */
          `${monthLabel} · generated ${formatDateLabel(todayInMalaysia())}`
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex items-center gap-2" action="/reports" method="GET">
              <div className="w-40">
                <MonthPicker name="month" defaultValue={month} today={todayInMalaysia().slice(0, 7)} />
              </div>
              <button type="submit" className="btn-ghost py-1.5 text-xs">
                View
              </button>
            </form>
            <a href={`/api/reports/export?month=${month}`} className="btn-ghost shrink-0">
              Export CSV
            </a>
          </div>
        }
      />

      {/* The page's one card, and the figure it exists to produce. It used to
          read "Your 2%", which was honest about what it was but meant the
          only monthly report in the app could not answer "what did I make". */}
      <div className="app-card">
        <div className="text-[12px] text-paper-dim">What you made — {monthLabel}</div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tnum text-[38px] font-semibold leading-none tracking-[-.03em] text-paper">{formatMYR(totalEarned)}</span>
          {/* Reads pctChange's null as "don't show a badge" rather than
              coercing it to 0% — a `?? 0` here printed "↓ 0%" for a month with
              no baseline, and printed a real percentage for changes so large
              (a month against a near-empty one) that the two absolute figures
              in the line below say it better. */}
          {earnedChg != null && (
            <span className={`chg text-[13px] ${earnedChg >= 0 ? 'chg-up' : 'chg-down'}`}>
              {earnedChg >= 0 ? '↑' : '↓'} {Math.abs(Math.round(earnedChg)).toFixed(0)}%
            </span>
          )}
        </div>
        <p className="mt-2 text-[13px] text-paper-dim">
          {prevEarned > 0 ? `vs ${formatMYR(prevEarned)} in ${formatMonthLabel(prevMonth)}` : `Nothing earned in ${formatMonthLabel(prevMonth)} to compare against`}
        </p>
        {monthAuto && (
          <p className="mt-1.5 text-[13px] text-brass-bright">
            Nothing has been verified in {formatMonthLabel(currentMonth())} yet, so this opened on {monthLabel}.
          </p>
        )}

        {/* Two revenue lines, then what changed hands. The 2% and the SIM
            margin are separate businesses sharing one month, and the report
            had only ever shown the first. */}
        <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-6 border-t border-ink-800 pt-5 sm:grid-cols-3">
          <div>
            <div className="text-[12px] text-paper-dim">Points — your 2%</div>
            <div className="figure-money mt-1 text-[20px] tracking-[-.02em]">{formatMYR(totalCommission)}</div>
            <div className="mt-1 text-[12px] text-paper-dim">
              {totalPoints.toLocaleString()} pts over {rows.length} transaction{rows.length === 1 ? '' : 's'}
            </div>
          </div>
          <div>
            <div className="text-[12px] text-paper-dim">SIM cards — margin</div>
            <div className="figure-money mt-1 text-[20px] tracking-[-.02em]">{formatMYR(simMargin)}</div>
            <div className="mt-1 text-[12px] text-paper-dim">
              {simCards.toLocaleString()} card{simCards === 1 ? '' : 's'} over {simThis.length} order{simThis.length === 1 ? '' : 's'}
            </div>
          </div>
          <div>
            <div className="text-[12px] text-paper-dim">Money collected</div>
            <div className="figure-money mt-1 text-[20px] tracking-[-.02em]">{formatMYR(moneyCollected)}</div>
            <div className="mt-1 text-[12px] text-paper-dim">
              {formatMYR(totalMoney)} points · {formatMYR(simRevenue)} cards
            </div>
          </div>
        </div>

        {/* Opening balance, what moved, closing balance — the shape every
            distributor statement of account uses.

            This was a band at the foot of the page and that was wrong: "what
            did I make" and "what have I got left to sell" are the same rank
            of question, and the second one was arriving last. It sits in the
            card now as its second row, the anatomy SIM Card Stock uses —
            headline, rule, the figures that break it down, rule, the figures
            that follow from them.

            The closing figure ties to the balance printed on Credit
            Purchases: it is walked backwards from the live number by
            balanceSeries, not recomputed. */}
        <div className="mt-6 border-t border-ink-800 pt-5">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold text-paper">Points ledger</h3>
            <span className="text-[12px] text-paper-dim">
              what {monthLabel} did to the credit you hold — sold counts pending as well as verified, the way the live balance does
            </span>
          </div>
          {/* Four figures when four figures have something to say, one line
              when they do not. On a month with no movement the grid printed
              "21,501 / 0 / 0 / 21,501" — four boxes to report that nothing
              happened. Same reasoning as the dashboard's empty months: a
              layout that only composes when the data is there is a bad
              layout, and the fix is for it to shrink rather than to be
              permanently small. */}
          {pointsBought === 0 && pointsSold === 0 ? (
            <p className="text-[13px] text-paper-dim">
              Nothing moved. Opened and closed on{' '}
              <b className="figure-points font-semibold text-paper">{closingBalance.toLocaleString()}</b> pts — no credit bought from Vibe, none sold
              on to dealers.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-10 gap-y-5 sm:grid-cols-4">
              <div>
                <div className="text-[12px] text-paper-dim">Opened with</div>
                <div className="figure-points mt-1 text-[20px]">{openingBalance.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[12px] text-paper-dim">Bought from Vibe</div>
                <div className="figure-points mt-1 text-[20px]">{pointsBought > 0 ? `+${pointsBought.toLocaleString()}` : '0'}</div>
                {pointsBought > 0 && <div className="mt-1 text-[12px] text-paper-dim">{formatMYR(paidToVibe)} paid</div>}
              </div>
              <div>
                <div className="text-[12px] text-paper-dim">Sold to dealers</div>
                <div className="figure-points mt-1 text-[20px]">{pointsSold > 0 ? `−${pointsSold.toLocaleString()}` : '0'}</div>
              </div>
              <div>
                <div className="text-[12px] text-paper-dim">Closed with</div>
                <div className="figure-points mt-1 text-[20px] font-semibold">{closingBalance.toLocaleString()}</div>
                {cardsBought > 0 && (
                  <div className="mt-1 text-[12px] text-paper-dim">
                    {cardsBought.toLocaleString()} SIM cards bought, {formatMYR(stockBought)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Whether these figures can be trusted, and what they leave out. A
          report that silently drops a disputed transaction cannot be checked
          against anything, and one that does not say whether the month has
          been agreed with Vibe is a claim rather than a statement. */}
      <div className="page-band">
        <h3 className="mb-1 text-sm font-semibold text-paper">Before you rely on this</h3>
        <p className="mb-4 text-[12px] text-paper-dim">What the figures above leave out, and whether they have been checked against Vibe.</p>
        <div className="grid grid-cols-1 gap-x-10 gap-y-5 lg:grid-cols-2">
          <div>
            <div className="text-[12px] text-paper-dim">Not counted</div>
            {excludedCount === 0 ? (
              <p className="mt-1 text-[13px] text-paper">Nothing. Every transaction dated in {monthLabel} is verified.</p>
            ) : (
              <>
                <p className="mt-1 text-[13px] font-semibold text-paper">
                  {excludedCount} transaction{excludedCount === 1 ? '' : 's'} · {(flagged.points + pending.points).toLocaleString()} pts ·{' '}
                  {formatMYR(flagged.money + pending.money)}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-paper-dim">
                  {flagged.count > 0 && (
                    <>
                      {flagged.count} flagged ({formatMYR(flagged.commission)} of commission) — disputed, so held out until resolved.
                    </>
                  )}
                  {flagged.count > 0 && pending.count > 0 && ' '}
                  {pending.count > 0 && (
                    <>
                      {pending.count} still pending review ({formatMYR(pending.commission)}) — will count once verified.
                    </>
                  )}
                </p>
                <Link href={`/records?month=${month}`} className="mt-1.5 inline-block text-[12px] font-semibold text-primary hover:underline">
                  See them in Transactions →
                </Link>
              </>
            )}
          </div>
          <div>
            <div className="text-[12px] text-paper-dim">Checked against Vibe</div>
            {companyPoints == null ? (
              <>
                <p className="mt-1 text-[13px] font-semibold" style={{ color: 'var(--color-brass-bright)' }}>
                  Not entered yet
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-paper-dim">
                  Vibe&apos;s own statement for {monthLabel} has not been recorded, so nothing here has been agreed with them.
                </p>
              </>
            ) : (
              <>
                <p
                  className="mt-1 text-[13px] font-semibold"
                  style={{ color: variance === 0 ? 'var(--color-jade-bright)' : 'var(--color-clay-bright)' }}
                >
                  {variance === 0 ? 'Matched exactly' : `${variance! > 0 ? '+' : ''}${variance!.toLocaleString()} pts apart`}
                  {isClosed ? ' · month closed' : ' · month still open'}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-paper-dim">
                  You recorded {totalPoints.toLocaleString()} pts; Vibe&apos;s statement says {companyPoints.toLocaleString()} pts.
                </p>
              </>
            )}
            <Link href={`/reconcile?month=${month}`} className="mt-1.5 inline-block text-[12px] font-semibold text-primary hover:underline">
              Open Reconciliation →
            </Link>
          </div>
        </div>
      </div>

      {/* One band, two axes. These were two cards each carrying its own Total
          row, and both totals were identical to the figures in the header.
          They are the same month sliced two ways, which is what Stripe's
          reports let you pivot rather than stack. The axis is in the URL so
          the view is shareable and survives Back/Forward, per Geist. */}
      <div className="page-band">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h3 className="text-sm font-semibold text-paper">Where the points came from</h3>
            <p className="mt-0.5 text-[12px] text-paper-dim">
              {by === 'type'
                ? 'The same month split by what was sold.'
                : 'Click a dealer to see its individual transactions for this month.'}
            </p>
          </div>
          <div className="segmented shrink-0">
            <Link href={`/reports?month=${month}`} className={`segmented-btn ${by === 'dealer' ? 'active' : ''}`}>
              By dealer
            </Link>
            <Link href={`/reports?month=${month}&by=type`} className={`segmented-btn ${by === 'type' ? 'active' : ''}`}>
              By type
            </Link>
          </div>
        </div>
        {by === 'type' ? (
          <ScrollFade label="This month by package">
            <table className="w-full min-w-[660px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="th">Type</th>
                  <th className="th text-right">Count</th>
                  <th className="th text-right">Points</th>
                  <th className="th text-right">Money Collected (RM)</th>
                  <th className="th text-right">Your 2%</th>
                </tr>
              </thead>
              <tbody>
                {typeBreakdown.map((t) => (
                  <tr key={t.label} className="tr-row h-14">
                    <td className="td font-semibold text-paper">{t.label}</td>
                    <td className="td figure text-right text-paper-dim">{t.count}</td>
                    <td className="td figure-points text-right">{t.points.toLocaleString()} pts</td>
                    <td className="td figure-money text-right">{formatMYR(t.money)}</td>
                    <td className="td figure-money text-right">{formatMYR(t.commission)}</td>
                  </tr>
                ))}
                {!typeBreakdown.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-paper-dim">
                      No verified transactions this month yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollFade>
        ) : (
          <ScrollFade label="This month by dealer">
            {/* table-fixed with percentage widths. Auto layout gave Dealer
                every pixel of slack — the name ended around x=600 and the
                first figure did not start until x=1290 — while the numeric
                columns stayed cramped. */}
            <table className="w-full min-w-[860px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[28%]" />
                <col className="w-[17%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="th">#</th>
                  <th className="th">Dealer</th>
                  <th className="th text-right">This Month&apos;s Top-up</th>
                  <th className="th text-right">Money Collected (RM)</th>
                  <th className="th">Share</th>
                  <th className="th text-right">Your 2%</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((d, i) => {
                  const pct = maxMoney > 0 ? Math.round((d.money / maxMoney) * 100) : 0
                  return (
                    <tr key={d.id} className="tr-row relative h-14">
                      <td className="td figure text-paper-dim">{i + 1}</td>
                      <td className="td truncate font-semibold text-paper">
                        <a
                          href={`/records?month=${month}&status=verified&dealer=${d.id}`}
                          className="after:absolute after:inset-0 after:content-[''] hover:text-jade-bright"
                        >
                          {d.name}
                        </a>
                      </td>
                      <td className="td figure-points whitespace-nowrap text-right">{d.points.toLocaleString()} pts</td>
                      <td className="td figure-money whitespace-nowrap text-right">{formatMYR(d.money)}</td>
                      <td className="td">
                        <span className="block h-1.5 rounded-full bg-ink-800" aria-hidden="true">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, pct)}%` }} />
                        </span>
                      </td>
                      <td className="td figure-money whitespace-nowrap text-right">{formatMYR(d.commission)}</td>
                    </tr>
                  )
                })}
                {!breakdown.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-paper-dim">
                      No verified transactions this month yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollFade>
        )}
      </div>

      {/* The second revenue line, broken down the way the first one is. It
          had never appeared on this page at all. */}
      <div className="page-band">
        <h3 className="mb-1 text-sm font-semibold text-paper">SIM cards</h3>
        <p className="mb-4 text-[12px] text-paper-dim">
          Bought from Vibe and resold to dealers, separate from the points ledger. Margin is after the {formatMYR(simShipping)} it cost
          to ship — nothing in this app used to subtract that.
        </p>
        {simThis.length ? (
          <ScrollFade label="This month by SIM type">
            <table className="w-full min-w-[660px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="th">SIM Type</th>
                  <th className="th text-right">Orders</th>
                  <th className="th text-right">Cards</th>
                  <th className="th text-right">Collected (RM)</th>
                  <th className="th text-right">Shipping (RM)</th>
                  <th className="th text-right">Margin (RM)</th>
                </tr>
              </thead>
              <tbody>
                {simBreakdown.map((s) => (
                  <tr key={s.label} className="tr-row h-14">
                    <td className="td font-semibold text-paper">{s.label}</td>
                    <td className="td figure text-right text-paper-dim">{s.orders}</td>
                    <td className="td figure text-right text-paper-dim">{s.cards.toLocaleString()}</td>
                    <td className="td figure-money text-right">{formatMYR(s.revenue)}</td>
                    <td className="td figure-money text-right font-normal text-paper-dim">
                      {s.shipping > 0 ? `−${formatMYR(s.shipping)}` : '—'}
                    </td>
                    <td className="td figure-money text-right">{formatMYR(s.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollFade>
        ) : (
          <p className="text-[13px] text-paper-dim">No SIM orders in {monthLabel}.</p>
        )}
      </div>
    </div>
  )
}
