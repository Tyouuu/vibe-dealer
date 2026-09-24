import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { getAvailablePointsBalance, LOW_BALANCE_THRESHOLD } from '@/lib/credit-balance'
import { ScrollFade } from '../scroll-fade'
import { PageHeader } from '../page-header'
import { Pagination } from '../pagination'
import { formatMYR } from '@/lib/money'
import { formatTimeOfDay } from '@/lib/month'
import { EmptyState } from '../empty-state'
import { AdjustPurchaseButton } from './adjust-purchase-button'

export const metadata: Metadata = {
  title: 'Credit Purchases — Vibe456',
}

// Enough to cover a normal month of movement without pulling the whole
// transaction history through PostgREST. Older sales live on Transactions,
// which this page links to; the all-time totals in the card come from the
// balance aggregate, so nothing is lost when a row falls off the end.
// 50, the same page size /records and /dealers use, so "one page" means the
// same number of rows everywhere in the app.
const PAGE_SIZE = 50

type Movement = {
  key: string
  date: string
  createdAt: string
  what: string
  detail: string | null
  points: number
  kind: 'in' | 'out'
  // Only set for a genuine credit_purchases row that is not itself a
  // correction — the one case Adjust is offered for. A sale's own correction
  // path is /records' AdjustButton; stacking a second one here would be two
  // ways to do the same thing.
  adjustable: { id: string; currentPoints: number; currentMoneyRm: number } | null
}

// Walked backwards from the live balance rather than forwards from zero:
// forwards would need every row ever written, and the newest row's closing
// balance is the one figure already known for certain. Same approach as the
// Monthly Report's points ledger.
//
// A module-level function rather than a loop inside the component: the React
// compiler flags a component-scope `let` that is reassigned while mapping,
// and it is right to — the accumulator has nothing to do with rendering.
function withRunningBalance(movements: Movement[], closing: number): (Movement & { after: number })[] {
  let running = closing
  return movements.map((m) => {
    const after = running
    running -= m.kind === 'in' ? m.points : -m.points
    return { ...m, after }
  })
}

type PageProps = {
  searchParams: Promise<{ saved?: string; adjusted?: string; error?: string; page?: string }>
}

export default async function PurchasesPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { saved, adjusted, error, page } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="view credit purchases" />
  }

  const supabase = await createClient()
  const [{ data: purchaseRows }, { data: saleRows }, { data: profiles }, creditBalance] = await Promise.all([
    supabase
      .from('credit_purchases')
      .select('id, purchase_date, created_at, money_rm, points, note, receipt_url, recorded_by, adjusts_id')
      .order('purchase_date', { ascending: false }),
    // The other half of the ledger. Credit is drawn down by every transaction
    // that is not flagged — pending counts, because the dealer has already had
    // the credit — which is exactly the definition the balance itself uses.
    // See computeAvailableBalance.
    supabase
      .from('transactions')
      .select('id, tx_date, created_at, type, package, points, status, dealers(company_name)')
      .neq('status', 'flagged')
      .order('tx_date', { ascending: false }),
    supabase.from('staff_directory').select('id, display_name'),
    getAvailablePointsBalance(supabase),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? '—']))

  // ---- the figures --------------------------------------------------------
  // Balance, bought and sold all come from the same aggregate the New
  // Transaction hard-block uses, so they cannot disagree with each other or
  // with the badge in the rail.
  const balance = creditBalance.available
  const totalBought = creditBalance.totalPurchased
  const totalSold = creditBalance.totalCommitted
  const totalCost = (purchaseRows ?? []).reduce((s, p) => s + Number(p.money_rm), 0)
  const costPerPoint = totalBought > 0 ? totalCost / totalBought : 0
  const worthAtCost = balance * costPerPoint
  const leftPct = totalBought > 0 ? Math.round((balance / totalBought) * 100) : 0
  // Not a forecast — the boundary restated in the unit the work happens in.
  // The largest package a dealer can buy draws LOW_BALANCE_THRESHOLD points,
  // and a sale that would take the balance below zero is refused outright.
  const biggestSalesLeft = Math.floor(balance / LOW_BALANCE_THRESHOLD)

  // ---- the ledger ---------------------------------------------------------
  // One list, both directions, with a running balance — the columns every
  // wallet screen in this trade carries: type, amount, date, description,
  // running balance. This page used to read credit_purchases alone, so you
  // could see the balance but never what had drawn it down. It had half the
  // ledger, which is why it looked like it had almost nothing on it.
  const movements: Movement[] = [
    ...(purchaseRows ?? []).map((p) => {
      // A correction can carry a negative delta — money handed back because
      // the original overstated what was bought. Classified by sign, not by
      // which table the row came from, for the same reason the sale side
      // below already is: an 'in' of -50000 would otherwise print "+-50,000",
      // two minus signs in the one column whose job is to say which way the
      // credit moved.
      const pts = Number(p.points)
      const isCorrection = p.adjusts_id != null
      return {
        key: `p-${p.id}`,
        date: p.purchase_date as string,
        createdAt: (p.created_at as string) ?? (p.purchase_date as string),
        what: isCorrection ? 'Correction · Bought from Vibe Mobile' : 'Bought from Vibe Mobile',
        detail: (p.note as string | null) || nameById.get(p.recorded_by as string) || null,
        points: Math.abs(pts),
        kind: (pts < 0 ? 'out' : 'in') as 'in' | 'out',
        adjustable: isCorrection ? null : { id: p.id as string, currentPoints: pts, currentMoneyRm: Number(p.money_rm) },
      }
    }),
    ...(saleRows ?? []).map((t) => {
      const rel = t.dealers as { company_name: string } | { company_name: string }[] | null
      const dealer = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
      const label = t.type === 'package' ? `Package ${t.package}` : t.type === 'adjustment' ? 'Correction' : 'Top-up'
      // A correction carries a delta, and a downward one is negative: it hands
      // points back to the pool rather than drawing from it. Treated as an
      // outflow of a negative number, the Out column rendered "−-80" — two
      // minus signs, in the column whose entire job is to say which way the
      // credit went. Classified by the sign instead, so it lands in the In
      // column as +80, which is what actually happened to the balance.
      //
      // withRunningBalance is unaffected: an 'out' of -80 and an 'in' of 80
      // move the running total by the same amount in the same direction.
      const pts = Number(t.points)
      return {
        key: `t-${t.id}`,
        date: t.tx_date as string,
        createdAt: (t.created_at as string) ?? (t.tx_date as string),
        what: `${label} · ${dealer}`,
        detail: t.status === 'pending' ? 'pending review — already committed' : null,
        points: Math.abs(pts),
        kind: (pts < 0 ? 'in' : 'out') as 'in' | 'out',
        // A sale's own correction path is /records — this page only offers
        // Adjust on the purchase side.
        adjustable: null,
      }
    }),
    // Same day, newest first — purchase_date and tx_date carry no time, so
    // created_at breaks the tie rather than the order coming out arbitrary.
  ].sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))

  // The running balance is computed across the whole ledger first and only
  // then sliced. It has to be: every row's balance depends on every row after
  // it, so a page-two figure worked out from page two alone would be wrong by
  // the entire first page. This is also why the transactions half is no longer
  // capped — a cap made the oldest visible balance silently incorrect.
  const withBalance = withRunningBalance(movements, balance)
  const totalPages = Math.max(1, Math.ceil(withBalance.length / PAGE_SIZE))
  const pageNum = Math.min(totalPages, Math.max(1, Math.trunc(Number(page)) || 1))
  const ledger = withBalance.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE)
  const rangeStart = withBalance.length === 0 ? 0 : (pageNum - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(pageNum * PAGE_SIZE, withBalance.length)

  // Same day, same description, more than once on this page — e.g. five
  // "Top-up · Bayan Baru Handphone Centre" rows dated 10 Aug, two of them for
  // the identical amount. The date column can't tell those apart, so a time
  // is shown for just that set rather than on every row.
  const movementDayCounts = new Map<string, number>()
  for (const m of ledger) {
    const key = `${m.date}|${m.what}`
    movementDayCounts.set(key, (movementDayCounts.get(key) ?? 0) + 1)
  }

  return (
    <>
      <PageHeader
        title="Credit Purchases"
        subtitle="What we pay Vibe Mobile for points, and every movement in and out of that credit."
        action={{ href: '/purchases/new', label: 'Log Purchase' }}
      />

      {saved && <div className="alert alert-ok">Purchase recorded.</div>}
      {adjusted && <div className="alert alert-ok">Correction posted.</div>}
      {error && <div className="alert alert-bad">{error}</div>}

      <div className="stack-loose mt-8 w-full">
        {/* Balance leads because it is the figure that stops work: the New
            Transaction form refuses a sale that would oversell it.

            What used to sit beside it was "Cash margin vs 2%" — money in from
            dealers minus money out to Vibe, all time — which is large and
            negative purely because stock is pre-bought, and needed a sentence
            of apology underneath so it would not read as a bug. It is gone,
            for two reasons that came out of looking at how this is built
            elsewhere. Every comparable balance screen (Twilio, OpenAI, the
            recharge-distribution platforms) keeps profit off this page, and
            the platforms that do track dealer commission put it in a separate
            commission wallet "for improved accounting". Ours already has a
            home: the Monthly Report states it per month.

            What replaces it is the one money figure this page can honestly
            carry — what the unsold credit cost. */}
        <div className="app-card">
          <div className="text-[12px] text-paper-dim">Credit balance</div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
            <span className="figure-points text-[38px] font-semibold leading-none tracking-[-.03em]">{balance.toLocaleString()}</span>
            {/* 16px, a size the page already carries. At 15px it was an eighth
                distinct size and design-audit caps the scale at seven. */}
            <span className="text-base text-paper-dim">pts</span>
          </div>
          <p className="mt-2 text-[13px] text-paper-dim">
            {balance <= 0
              ? 'Out of credit — a sale cannot be recorded until you log a purchase.'
              : `Bought from Vibe Mobile and not yet resold — ${leftPct}% of everything you have bought is still to sell.`}
          </p>

          {/* The boundary drawn before you reach it. The app already refuses a
              sale that would oversell the balance, but nothing said how close
              that was, and every product in this category warns ahead of the
              wall rather than only at it. */}
          {balance > 0 && (
            <p
              className="mt-1.5 text-[13px]"
              style={balance < LOW_BALANCE_THRESHOLD ? { color: 'var(--color-brass-bright)', fontWeight: 600 } : undefined}
            >
              {balance < LOW_BALANCE_THRESHOLD
                ? `Below the ${LOW_BALANCE_THRESHOLD.toLocaleString()} pts the largest package draws — the next big sale will be refused.`
                : `Enough for ${biggestSalesLeft.toLocaleString()} more sales of ${LOW_BALANCE_THRESHOLD.toLocaleString()} pts, the largest a dealer can buy.`}
            </p>
          )}

          <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-6 border-t border-ink-800 pt-5 sm:grid-cols-3">
            <div>
              <div className="text-[12px] text-paper-dim">Worth at cost</div>
              <div className="figure-money mt-1 text-[20px] tracking-[-.02em]">{formatMYR(worthAtCost)}</div>
              <div className="mt-1 text-[12px] text-paper-dim">
                {balance.toLocaleString()} pts at the {formatMYR(costPerPoint)} a point you paid
              </div>
            </div>
            <div>
              <div className="text-[12px] text-paper-dim">Bought so far</div>
              <div className="figure-points mt-1 text-[20px]">{totalBought.toLocaleString()}</div>
              <div className="mt-1 text-[12px] text-paper-dim">{formatMYR(totalCost)} paid to Vibe Mobile</div>
            </div>
            <div>
              <div className="text-[12px] text-paper-dim">Sold on so far</div>
              <div className="figure-points mt-1 text-[20px]">{totalSold.toLocaleString()}</div>
              <div className="mt-1 text-[12px]">
                <Link href="/reports" className="font-semibold text-primary hover:underline">
                  What you earned on it →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* The ledger is the page — no card. See .index-surface. */}
        <div className="index-surface">
          <div className="index-filterbar">
            <div>
              <h2 className="text-sm font-semibold text-paper">Credit ledger</h2>
              <p className="mt-0.5 text-[12px] text-paper-dim">
                Every movement in and out, newest first. A sale counts against the balance as soon as it is recorded, before anyone verifies it.
              </p>
            </div>
          </div>
          {ledger.length ? (
            <>
              <ScrollFade label="Credit ledger">
                <table className="w-full min-w-[860px] table-fixed border-collapse text-sm">
                  <colgroup>
                    <col className="w-[12%]" />
                    <col className="w-[33%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[17%]" />
                    <col className="w-[14%]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Movement</th>
                      <th className="th text-right">In</th>
                      <th className="th text-right">Out</th>
                      <th className="th text-right">Balance after</th>
                      {/* Empty, not a label — this column exists for the one
                          action a purchase row can carry, not a category, and
                          most rows (every sale) leave it blank. */}
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((m) => {
                      const sameDayAsAnother = (movementDayCounts.get(`${m.date}|${m.what}`) ?? 0) > 1
                      const timeOfDay = sameDayAsAnother ? formatTimeOfDay(m.createdAt) : null
                      return (
                      <tr key={m.key} className="tr-row h-14">
                        <td className="td whitespace-nowrap text-paper-dim">
                          {timeOfDay ? (
                            <span
                              className="underline decoration-dotted decoration-paper-dim/40 underline-offset-4"
                              title={`More than one of these on this day — this one was recorded at ${timeOfDay}.`}
                            >
                              {m.date}
                            </span>
                          ) : (
                            m.date
                          )}
                        </td>
                        <td className="td truncate" title={m.detail ? `${m.what} — ${m.detail}` : m.what}>
                          <span className="font-semibold text-paper">{m.what}</span>
                          {m.detail && <span className="ml-2 text-[12px] text-paper-dim">{m.detail}</span>}
                        </td>
                        <td className="td figure-points whitespace-nowrap text-right">
                          {m.kind === 'in' ? (
                            <span style={{ color: 'var(--color-jade-bright)' }}>+{m.points.toLocaleString()}</span>
                          ) : (
                            <span className="text-paper-dim/40">—</span>
                          )}
                        </td>
                        <td className="td figure-points whitespace-nowrap text-right text-paper-dim">
                          {m.kind === 'out' ? `−${m.points.toLocaleString()}` : <span className="text-paper-dim/40">—</span>}
                        </td>
                        <td className="td figure-points whitespace-nowrap text-right font-semibold">{m.after.toLocaleString()}</td>
                        <td className="td text-right">
                          {m.adjustable && (
                            <AdjustPurchaseButton
                              purchaseId={m.adjustable.id}
                              currentPoints={m.adjustable.currentPoints}
                              currentMoneyRm={m.adjustable.currentMoneyRm}
                            />
                          )}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </ScrollFade>
              {/* A pager, not a cap. This said "showing the 60 most recent
                  movements" and sent you to Transactions — a different page,
                  with a different shape and no running balance, to read the
                  rest of this one. */}
              <Pagination
                page={pageNum}
                totalPages={totalPages}
                hrefFor={(p) => `/purchases?page=${p}`}
                summary={`${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${withBalance.length.toLocaleString()} movements`}
              />
            </>
          ) : (
            /* The consequence, then the way out. This was one grey line that
               stated the obvious and offered nothing — and it is the page a
               brand-new system opens on, because until a purchase exists here
               the balance is zero and /entry refuses every sale. */
            <EmptyState
              variant="empty"
              title="No credit bought yet"
              description="Every sale is checked against this balance, and it starts at zero — so until a purchase is logged, every top-up and package is refused. Log the batches you have already paid Vibe for, with their real dates, and the running balance below builds itself."
              action={{ href: '/purchases/new', label: 'Log a purchase' }}
            />
          )}
        </div>
      </div>
    </>
  )
}
