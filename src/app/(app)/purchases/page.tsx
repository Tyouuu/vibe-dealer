import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
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
import { allRows } from '@/lib/fetch-all'

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
  /** The balance right after this movement — worked out by the database (0055). */
  after: number
}

// One row of the credit_ledger view (0055): a movement plus the total of every movement newer than it.
type LedgerRow = {
  key: string
  mdate: string
  created_at: string
  source: 'purchase' | 'sale'
  ref_id: string
  delta: number | string
  purchase_money_rm: number | string | null
  purchase_note: string | null
  purchase_recorded_by: string | null
  purchase_is_correction: boolean
  sale_type: string | null
  sale_package: string | null
  sale_status: string | null
  sale_dealer: string | null
  newer_sum: number | string
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
  const requestedPage = Math.max(1, Math.trunc(Number(page)) || 1)
  const [{ data: ledgerRows, count: movementCount }, { data: purchaseCosts }, { data: profiles }, creditBalance] = await Promise.all([
    // One page of the ledger, worked out by the database (0055). This page used to read every
    // purchase and every sale there has ever been, merge them here and walk a running balance
    // down the lot to show fifty rows — thousands of rows a month, and the API stops at 1,000
    // per request without saying so, so the older pages simply did not exist. Each row now
    // arrives with the total of every movement newer than it, so its balance needs no other row.
    // Credit is drawn down by every transaction that is not flagged — pending counts, because
    // the dealer has already had the credit — the definition the balance itself uses.
    supabase
      .from('credit_ledger')
      .select('*', { count: 'exact' })
      .order('mdate', { ascending: false })
      .order('created_at', { ascending: false })
      .order('key', { ascending: false })
      .range((requestedPage - 1) * PAGE_SIZE, requestedPage * PAGE_SIZE - 1),
    // What everything ever bought cost, for the cost-per-point figure: a handful of rows a year,
    // paged all the same so it cannot silently stop at 1,000 either.
    allRows((from, to) => supabase.from('credit_purchases').select('money_rm').order('id').range(from, to)),
    supabase.from('staff_directory').select('id, display_name'),
    getAvailablePointsBalance(supabase),
  ])

  // A page number past the end (a bookmark, a typo, a ledger that shrank) comes back empty:
  // land on the last page that exists instead of an empty screen.
  if (requestedPage > 1 && !ledgerRows?.length) {
    const { count } = await supabase.from('credit_ledger').select('key', { count: 'exact', head: true })
    redirect(`/purchases?page=${Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))}`)
  }

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? '—']))

  // ---- the figures --------------------------------------------------------
  // Balance, bought and sold all come from the same aggregate the New
  // Transaction hard-block uses, so they cannot disagree with each other or
  // with the badge in the rail.
  const balance = creditBalance.available
  const totalBought = creditBalance.totalPurchased
  const totalSold = creditBalance.totalCommitted
  const totalCost = (purchaseCosts ?? []).reduce((s, p) => s + Number(p.money_rm), 0)
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
  const balanceAfter = (r: LedgerRow) => balance - Number(r.newer_sum)
  const ledger: Movement[] = ((ledgerRows ?? []) as LedgerRow[]).map((r) => {
    const delta = Number(r.delta)
    if (r.source === 'purchase') {
      // A correction can carry a negative delta — money handed back because the original
      // overstated what was bought. Classified by sign, not by which table the row came from,
      // for the same reason the sale side is: an 'in' of -50000 would otherwise print
      // "+-50,000", two minus signs in the one column whose job is to say which way the credit
      // moved.
      const isCorrection = r.purchase_is_correction
      return {
        key: r.key,
        date: r.mdate,
        createdAt: r.created_at,
        what: isCorrection ? 'Correction · Bought from Vibe Mobile' : 'Bought from Vibe Mobile',
        detail: r.purchase_note || nameById.get(r.purchase_recorded_by ?? '') || null,
        points: Math.abs(delta),
        kind: (delta < 0 ? 'out' : 'in') as 'in' | 'out',
        adjustable: isCorrection ? null : { id: r.ref_id, currentPoints: delta, currentMoneyRm: Number(r.purchase_money_rm) },
        after: balanceAfter(r),
      }
    }
    // A sale's delta is its points taken away, so a correction that hands points back is a
    // positive delta and lands in the In column as +80 — which is what happened to the
    // balance — rather than printing "−-80".
    const label = r.sale_type === 'package' ? `Package ${r.sale_package}` : r.sale_type === 'adjustment' ? 'Correction' : 'Top-up'
    return {
      key: r.key,
      date: r.mdate,
      createdAt: r.created_at,
      what: `${label} · ${r.sale_dealer ?? '—'}`,
      detail: r.sale_status === 'pending' ? 'pending review — already committed' : null,
      points: Math.abs(delta),
      kind: (delta >= 0 ? 'in' : 'out') as 'in' | 'out',
      // A sale's own correction path is /records — this page only offers Adjust on the
      // purchase side.
      adjustable: null,
      after: balanceAfter(r),
    }
  })

  const totalMovements = movementCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalMovements / PAGE_SIZE))
  const pageNum = Math.min(requestedPage, totalPages)
  const rangeStart = totalMovements === 0 ? 0 : (pageNum - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(pageNum * PAGE_SIZE, totalMovements)

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
                summary={`${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${totalMovements.toLocaleString()} movements`}
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
