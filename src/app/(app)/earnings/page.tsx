import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '../page-header'
import { EmptyState } from '../empty-state'
import { Avatar } from '../avatar'
import { formatMYR } from '@/lib/money'
import { todayInMalaysia, formatMonthLabel } from '@/lib/month'
import { earningsFrom, isEarningsPeriod, periodRange, PERIOD_LABEL, type EarningsPeriod, type EarningsTx } from '@/lib/earnings'
import { LiveBadge, CountUp } from './live'

export const metadata: Metadata = {
  title: 'Earnings — Vibe456',
}

// A phone page that also works on a desktop, rather than a desktop page shrunk.
//
// Measured on an iPhone 13 (390x664) before any of this existed: /dealers was
// 3,052px tall with a 1,078px-wide table inside a 390px screen, /records was
// 4,346px with 162 tap targets under the 44px minimum. Those are not pages a
// 10-column table can be made good on -- so this is a different, smaller
// surface that answers one question, the way Stripe and Shopify ship a
// separate mobile view rather than a squeezed desktop one.
//
// The question: how much did I make, and who made it for me.
//
// Rows stack rather than tabulate. Shopify's app-home index table calls this
// responsive stacking and splits a row into a `primary` and a `secondary`
// slot; that is exactly the shape here -- company name on top, what they
// bought underneath, money on the right -- and it means the page never
// scrolls sideways at any width.

const PERIODS: EarningsPeriod[] = ['today', 'month', 'all']

export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const user = await requireUser()
  // Money, so the same gate every financial page uses. cs has no SELECT on
  // `transactions` at all, so this page would render a confident RM 0.00 for
  // them -- a wrong figure, not a hidden one.
  if (user.role !== 'master' && user.role !== 'accountant') {
    return <PermissionDenied role={user.role} action="see what the business earned" />
  }

  const sp = await searchParams
  const period: EarningsPeriod = isEarningsPeriod(sp.period) ? sp.period : 'month'
  const today = todayInMalaysia()
  const { from, to } = periodRange(period, today)

  const supabase = await createClient()
  let q = supabase
    .from('transactions')
    .select('dealer_id, tx_date, type, package, quantity, status, commission_rm, dealers(company_name, region)')
    .lte('tx_date', to)
  if (from) q = q.gte('tx_date', from)
  const { data: rows } = await q

  type Row = EarningsTx & { dealers: { company_name: string; region: string | null } | { company_name: string; region: string | null }[] | null }
  const tx = (rows as Row[] | null) ?? []
  const totals = earningsFrom(tx)

  // One pass for the names, off the rows already in memory -- a second query
  // for a roster this page only needs 20 names from would be a round trip to
  // learn what it already knows.
  const meta = new Map<string, { name: string; region: string | null }>()
  for (const t of tx) {
    if (meta.has(t.dealer_id)) continue
    const d = Array.isArray(t.dealers) ? t.dealers[0] : t.dealers
    meta.set(t.dealer_id, { name: d?.company_name ?? 'Unknown dealer', region: d?.region ?? null })
  }

  const periodNote =
    period === 'today'
      ? new Date(`${today}T00:00:00Z`).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', timeZone: 'UTC' })
      : period === 'month'
        ? formatMonthLabel(today.slice(0, 7))
        : 'Everything on record'

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <PageHeader
        title="Earnings"
        subtitle="What you made, and which dealer made it."
        meta={<LiveBadge />}
      />

      <section className="app-card flex flex-col gap-1">
        {/* The switcher lives in the card it drives. As a band floating on the
            canvas above it, the page opened on 214px of bare background
            before the first surface -- and the control and the figure it
            produces were two objects when they are one. The card's own label
            below is then redundant, so it is gone: the active segment says
            which period this is. */}
        <nav aria-label="Period" className="mb-4">
          <div className="segmented">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={p === 'month' ? '/earnings' : `/earnings?period=${p}`}
                // 44px on a phone. Vercel's interface guidelines put the
                // mobile minimum at 44px and the shared .segmented-btn is
                // 32px, which is fine under a mouse and not under a thumb.
                className={`segmented-btn min-h-[44px] px-4 text-[13px] sm:min-h-[32px] sm:px-3.5 sm:text-xs ${period === p ? 'active' : ''}`}
                style={{ touchAction: 'manipulation' }}
                aria-current={period === p ? 'page' : undefined}
              >
                {PERIOD_LABEL[p]}
              </Link>
            ))}
          </div>
        </nav>
        <CountUp value={totals.totalRm} className="figure-money text-[40px] font-semibold leading-[1.1] tracking-tight text-paper sm:text-[52px]" />
        <p className="text-[13px] text-paper-dim">{periodNote}</p>

        {/* The two kinds of money, kept apart. They are earned differently --
            one is paid by Vibe on points, the other is the RM1.50 between what
            a card costs and what a dealer pays -- and a single total hides
            which half moved. */}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-ink-800 pt-4 sm:max-w-md">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[12px] font-semibold text-paper-dim">SIM cards</dt>
            <dd className="figure-money text-lg font-semibold text-paper">{formatMYR(totals.cardRm)}</dd>
            <dd className="text-[12px] text-paper-dim">{totals.cards.toLocaleString()} cards at RM1.50</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[12px] font-semibold text-paper-dim">Commission</dt>
            <dd className="figure-money text-lg font-semibold text-paper">{formatMYR(totals.commissionRm)}</dd>
            <dd className="text-[12px] text-paper-dim">2% on verified top-ups</dd>
          </div>
        </dl>

        {/* Pending sits outside the figure, not inside it. A number that moves
            on a row nobody has checked is the number that gets argued about
            later -- the same split a payment processor draws between an
            available balance and one still settling. */}
        {totals.pendingCount > 0 && (
          <p className="mt-3 text-[13px] text-paper-dim">
            Not counted:{' '}
            <span className="figure-money font-semibold text-brass-bright">{formatMYR(totals.pendingRm)}</span> on{' '}
            <Link href="/records?status=pending" className="font-semibold text-paper underline underline-offset-2">
              {totals.pendingCount} unchecked {totals.pendingCount === 1 ? 'row' : 'rows'}
            </Link>
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-paper">
          Who earned it
          {totals.byDealer.length > 0 && <span className="ml-2 font-normal text-paper-dim">{totals.byDealer.length} dealers</span>}
        </h2>

        {totals.byDealer.length === 0 ? (
          <EmptyState
            variant="empty"
            title={period === 'today' ? 'Nothing recorded today yet' : period === 'month' ? `Nothing verified in ${periodNote} yet` : 'No verified sales on record yet'}
            description={
              totals.pendingCount > 0
                ? `${totals.pendingCount} ${totals.pendingCount === 1 ? 'row is' : 'rows are'} waiting to be checked. Once verified they land here.`
                : 'A sale shows up here the moment someone verifies it.'
            }
            action={period === 'today' ? { href: '/earnings', label: 'See this month' } : { href: '/entry', label: 'Record a sale' }}
          />
        ) : (
          <ol className="app-card flex flex-col gap-0 p-0">
            {totals.byDealer.map((d, i) => {
              const m = meta.get(d.dealerId)
              return (
                <li key={d.dealerId} className="border-b border-ink-800 last:border-b-0">
                  {/* The whole row is the target, and it is 64px tall -- well
                      over the 44px minimum, because this list is read with a
                      thumb while the other hand holds a phone. */}
                  <Link
                    href={`/dealers/${d.dealerId}`}
                    className="flex min-h-[64px] items-center gap-2.5 px-4 py-3 transition-colors hover:bg-ink-850 sm:gap-3 sm:px-6"
                    style={{ touchAction: 'manipulation' }}
                  >
                    {/* Rank as a plain figure rather than a medal: this list
                        re-sorts itself whenever a sale lands, and a podium
                        that keeps changing hands reads as decoration. */}
                    <span className="figure w-5 shrink-0 text-right text-[13px] font-semibold text-paper-dim">{i + 1}</span>
                    <span className="hidden sm:block"><Avatar name={m?.name ?? '?'} size={32} /></span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-semibold text-paper">{m?.name}</span>
                      <span className="truncate text-[13px] text-paper-dim">
                        {d.packagesLabel ? <span className="figure">{d.packagesLabel}</span> : 'Top-ups only'}
                        {m?.region ? <span> · {m.region}</span> : null}
                      </span>
                    </span>
                    {/* One figure, not two stacked. The split lived here first
                        and sized the column on "RM 720.00 + RM 1,949.30",
                        which left the company name 168px and truncated
                        "Lumut Handphone Trading" to "Lumut Han...". The hero
                        above already splits the period's two kinds of money,
                        and the per-dealer split is on the dealer's own page. */}
                    <span className="figure-money shrink-0 text-[15px] font-semibold text-paper">{formatMYR(d.totalRm)}</span>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
