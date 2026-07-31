import type { Metadata } from 'next'
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
  searchParams: Promise<{ month?: string }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { month = currentMonth() } = await searchParams

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
  const prevActiveDealers = new Set((prevRows ?? []).map((t) => t.dealer_id)).size

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
            label: 'Active dealers',
            value: String(breakdown.length),
            href: '/dealers',
            chg: pctChange(breakdown.length, prevActiveDealers),
          },
        ]}
      />

      <div className="app-card">
        <h3 className="mb-0.5 text-sm font-bold text-paper">By Package</h3>
        <p className="mb-3.5 text-[11.5px] text-paper-dim">This month&apos;s verified total, split by transaction type.</p>
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
                  <td className="td text-right text-paper-dim">{t.count}</td>
                  <td className="td figure-points text-right">{t.points.toLocaleString()} pts</td>
                  <td className="td figure-money text-right">{formatMYR(t.money)}</td>
                  <td className="td figure-money text-right">{formatMYR(t.commission)}</td>
                </tr>
              ))}
              {typeBreakdown.length > 0 && (
                <tr className="border-t-2 border-paper bg-ink-850/60 font-semibold">
                  <td className="td text-paper">Total</td>
                  <td className="td text-right text-paper">{typeBreakdown.reduce((s, t) => s + t.count, 0)}</td>
                  <td className="td figure-points text-right">{typeBreakdown.reduce((s, t) => s + t.points, 0).toLocaleString()} pts</td>
                  <td className="td figure-money text-right">{formatMYR(typeBreakdown.reduce((s, t) => s + t.money, 0))}</td>
                  <td className="td figure-money text-right">{formatMYR(typeBreakdown.reduce((s, t) => s + t.commission, 0))}</td>
                </tr>
              )}
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
      </div>

      <div className="app-card">
        <h3 className="mb-0.5 text-sm font-bold text-paper">By Dealer</h3>
        <p className="mb-3.5 text-[11.5px] text-paper-dim">Click a dealer to see its individual transactions for this month.</p>
        <ScrollFade label="This month by dealer">
          <table className="w-full min-w-[660px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="th">#</th>
                <th className="th">Dealer</th>
                <th className="th text-right">This Month&apos;s Top-up</th>
                <th className="th text-right">Money Collected (RM)</th>
                <th className="th text-right">Your 2%</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((d, i) => {
                const pct = maxMoney > 0 ? Math.round((d.money / maxMoney) * 100) : 0
                return (
                  <tr key={d.id} className="tr-row relative">
                    <td className="td text-paper-dim">{i + 1}</td>
                    <td className="td font-semibold text-paper">
                      <a
                        href={`/records?month=${month}&status=verified&dealer=${d.id}`}
                        className="after:absolute after:inset-0 after:content-[''] hover:text-jade-bright"
                      >
                        {d.name}
                      </a>
                    </td>
                    <td className="td figure-points text-right">{d.points.toLocaleString()} pts</td>
                    <td className="td figure-money relative text-right">
                      <span className="absolute -left-1.5 bottom-[3px] top-[3px] rounded-md bg-primary-soft" style={{ width: `${pct}%` }} />
                      <span className="relative">{formatMYR(d.money)}</span>
                    </td>
                    <td className="td figure-money text-right">{formatMYR(d.commission)}</td>
                  </tr>
                )
              })}
              {breakdown.length > 0 && (
                <tr className="border-t-2 border-paper bg-ink-850/60 font-semibold">
                  <td className="td" />
                  <td className="td text-paper">Total</td>
                  <td className="td figure-points text-right">{totalPoints.toLocaleString()} pts</td>
                  <td className="td figure-money text-right">{formatMYR(totalMoney)}</td>
                  <td className="td figure-money text-right">{formatMYR(totalCommission)}</td>
                </tr>
              )}
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
      </div>
    </div>
  )
}
