import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { monthRange, previousMonth, currentMonth, todayInMalaysia, formatMonthLabel, formatDateLabel } from '@/lib/month'
import { MonthPicker } from '../month-picker'
import { ScrollFade } from '../scroll-fade'
import { PageHeader } from '../page-header'
import { HeroCard, pctChange } from '../hero-card'
import { formatMYR } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Monthly Report — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ month?: string; by?: string }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { month = currentMonth(), by: byRaw } = await searchParams
  const by: 'dealer' | 'type' = byRaw === 'type' ? 'type' : 'dealer'

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="view monthly reports" />
  }

  const { start, end } = monthRange(month)
  const prevMonth = previousMonth(month)
  const { start: prevStart, end: prevEnd } = monthRange(prevMonth)
  const supabase = await createClient()

  const [{ data: rows }, { data: prevRows }] = await Promise.all([
    supabase
      .from('transactions')
      .select('dealer_id, type, package, points, money_rm, commission_rm, dealers(company_name)')
      .eq('status', 'verified')
      .gte('tx_date', start)
      .lte('tx_date', end),
    supabase
      .from('transactions')
      .select('dealer_id, points, money_rm, commission_rm')
      .eq('status', 'verified')
      .gte('tx_date', prevStart)
      .lte('tx_date', prevEnd),
  ])

  const byDealer = new Map<string, { id: string; name: string; points: number; money: number; commission: number }>()
  for (const t of rows ?? []) {
    const rel = t.dealers as { company_name: string } | { company_name: string }[] | null
    const name = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    const prev = byDealer.get(t.dealer_id) ?? { id: t.dealer_id, name, points: 0, money: 0, commission: 0 }
    prev.points += Number(t.points)
    prev.money += Number(t.money_rm)
    prev.commission += Number(t.commission_rm)
    byDealer.set(t.dealer_id, prev)
  }

  // Same 3-way label already used on Records/Reconcile/dealer detail — group
  // by that instead of a new categorization, so "By Package" reads the same
  // as the type column everywhere else in the app.
  const byType = new Map<string, { label: string; points: number; money: number; commission: number; count: number }>()
  for (const t of rows ?? []) {
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
  const totalPoints = breakdown.reduce((s, d) => s + d.points, 0)
  const totalMoney = breakdown.reduce((s, d) => s + d.money, 0)
  const totalCommission = breakdown.reduce((s, d) => s + d.commission, 0)
  const maxMoney = Math.max(...breakdown.map((d) => d.money), 0)

  const prevTotalPoints = (prevRows ?? []).reduce((s, t) => s + Number(t.points), 0)
  const prevTotalCommission = (prevRows ?? []).reduce((s, t) => s + Number(t.commission_rm), 0)
  const prevTxCount = prevRows?.length ?? 0

  return (
    <div className="flex flex-col gap-5">
      {/* Month lives in the header beside Export, not inside the content —
          same placement as Reconciliation. It used to appear twice: once in
          the subtitle and again as a picker directly below it. */}
      <PageHeader
        title="Monthly Report"
        subtitle={`Generated ${formatDateLabel(todayInMalaysia())}`}
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

      {/* Was four equal tiles inside a card carrying a 3px purple top rail —
          a treatment that existed on no other page in the app, which is the
          same thing that made Reconciliation read as imported from elsewhere.

          Three of those four figures were also repeated verbatim in the By
          Package total row a few hundred pixels below (top-up, your 2%, and
          the transaction count). They stay, because what they carry that the
          table cannot is the comparison against last month — but as supporting
          figures rather than as four equal shouts. Your 2% leads: it is the
          number this report exists to produce. */}
      <HeroCard
        label={`Your 2% — ${formatMonthLabel(month)}`}
        value={formatMYR(totalCommission)}
        chg={pctChange(totalCommission, prevTotalCommission)}
        chgSuffix={`vs ${formatMYR(prevTotalCommission)} last month`}
        href={`/records?month=${month}&status=verified`}
        stats={[
          {
            label: 'Total top-up',
            value: `${totalPoints.toLocaleString()} pts`,
            href: `/records?month=${month}&status=verified`,
            chg: pctChange(totalPoints, prevTotalPoints),
          },
          {
            label: 'Transactions',
            value: String(rows?.length ?? 0),
            href: `/records?month=${month}&status=verified`,
            chg: pctChange(rows?.length ?? 0, prevTxCount),
          },
          {
            // Was "Active dealers", which is just the row count of the table
            // below it. Money collected is the one figure of the four that
            // appears nowhere else on the page.
            label: 'Money collected',
            value: formatMYR(totalMoney),
            href: `/records?month=${month}&status=verified`,
          },
        ]}
      />

      {/* One card, two axes.
          These were two cards each carrying its own Total row, and both
          totals were identical: 34,799 pts / RM 32,486.00 / RM 695.98 —
          figures the hero above already states. Measured on the live page,
          "34,799 pts" appeared three times and the money and commission
          twice each.

          They are not two datasets. They are the same month sliced two ways,
          which is what Stripe's reports let you pivot rather than stack. The
          grand total lives in the hero and is stated once; each table now
          carries only its own rows.

          The axis is in the URL so the view is shareable and survives
          Back/Forward, per Geist. */}
      {/* The breakdown is an index — a heading, an axis switcher, and rows —
          so it takes the index shape rather than a card, the same as
          /dealers and /records. The hero above keeps its card because it is
          a summary, not a list. */}
      <div className="index-surface">
        <div className="index-filterbar">
          <div>
            <h3 className="text-sm font-semibold text-paper">Where it came from</h3>
            <p className="mt-0.5 text-[12px] text-paper-dim">
              {by === 'type'
                ? 'The same month split by what was sold. Click nothing here — the totals are in the header.'
                : 'Click a dealer to see its individual transactions for this month.'}
            </p>
          </div>
          <div className="segmented ml-auto shrink-0">
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
                <tr key={t.label} className="tr-row">
                  <td className="td font-semibold text-paper">{t.label}</td>
                  <td className="td figure text-right text-paper-dim">{t.count}</td>
                  <td className="td figure-points text-right">{t.points.toLocaleString()} pts</td>
                  <td className="td figure-money text-right">{formatMYR(t.money)}</td>
                  <td className="td figure-money text-right">{formatMYR(t.commission)}</td>
                </tr>
              ))}
              {!typeBreakdown.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-paper-dim">
                    No verified transactions this month yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollFade>

        ) : (
        <ScrollFade label="This month by dealer">
          {/* table-fixed with percentage widths. Auto layout gave Dealer every
              pixel of slack — the name ended around x=600 and the first
              figure did not start until x=1290 — while the numeric columns
              stayed cramped. Share column carries the proportion bar. */}
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
                    {/* A real column, not an absolutely-positioned strip
                        hanging off the bottom of the money cell — that
                        rendered as a stray underline drifting under the
                        figure rather than as a bar. Same in-row bar the
                        dashboard leaderboard uses. */}
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
                  <td colSpan={5} className="px-3 py-8 text-center text-paper-dim">
                    No verified transactions this month yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollFade>
        )}
      </div>
    </div>
  )
}
