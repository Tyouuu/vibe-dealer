import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { monthRange, currentMonth, todayInMalaysia, formatMonthLabel } from '@/lib/month'
import { IconCheckCircle, IconChevronDown } from '../icons'
import { Avatar } from '../avatar'
import { StatusDot } from '../status-dot'
import { StatementForm } from './statement-form'
import { MarkReconciledForm } from './mark-reconciled-form'
import { ReopenMonthForm } from './reopen-month-form'
import { MonthPicker } from '../month-picker'
import { ScrollFade } from '../scroll-fade'
import { formatMYR } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Reconciliation — DealerHub',
}

const PAGE_SIZE = 50

type BreakdownRow = {
  id: string
  dealer_id: string
  tx_date: string
  type: 'package' | 'topup' | 'adjustment'
  package: string | null
  points: number
  commission_rm: number
  dealers: { company_name: string } | { company_name: string }[] | null
}

type PageProps = {
  searchParams: Promise<{ month?: string; error?: string; saved?: string; reopened?: string; page?: string }>
}

export default async function ReconcilePage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { month = currentMonth(), error, saved, reopened, page } = await searchParams
  const pageNum = Math.max(1, Math.trunc(Number(page)) || 1)

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="view reconciliation" />
  }

  const { start, end } = monthRange(month)
  const supabase = await createClient()

  const [{ data: verifiedTx }, { data: statement }] = await Promise.all([
    // No .limit() — systemPoints below is a real sum over every verified row
    // this month, and Your 2% Due is computed from it. A cap here would
    // silently under-count both once the month passes that many rows (this
    // is company-wide, not per-dealer, so 242 dealers gets there fast).
    // Reports runs the identical unbounded query for the same reason. The
    // list below (pure display, not an input to any total) is paginated in
    // memory off this same array instead of a second query.
    supabase
      .from('transactions')
      .select('id, dealer_id, tx_date, type, package, points, commission_rm, dealers(company_name)')
      .eq('status', 'verified')
      .gte('tx_date', start)
      .lte('tx_date', end)
      .order('tx_date', { ascending: false }),
    supabase.from('company_statements').select('*').eq('month', `${month}-01`).maybeSingle(),
  ])

  const breakdownRows = (verifiedTx as BreakdownRow[] | null) ?? []
  const systemPoints = breakdownRows.reduce((s, t) => s + Number(t.points), 0)
  // Sums each row's own commission_rm rather than recomputing points*rate —
  // matches how Reports/Dashboard/dealer-detail all compute "Your 2%", and
  // avoids the two calculations landing a cent apart under fractional
  // adjustment amounts (round(sum) vs sum(round) aren't the same operation).
  const systemProfit = Math.round(breakdownRows.reduce((s, t) => s + Number(t.commission_rm), 0) * 100) / 100
  const companyPoints = statement?.company_total_points ?? null
  // Rounded to whole points before comparing — systemPoints is a float sum
  // over potentially many fractional-point adjustment rows, so an
  // honestly-reconciled month could otherwise land on e.g. 4e-13 instead of
  // exactly 0 and wrongly report "Mismatch found".
  const diff = companyPoints != null ? Math.round((systemPoints - companyPoints) * 100) / 100 : null

  const totalPages = Math.max(1, Math.ceil(breakdownRows.length / PAGE_SIZE))
  const currentPage = Math.min(pageNum, totalPages)
  const pagedRows = breakdownRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  function pageHref(p: number) {
    const params = new URLSearchParams({ month })
    if (p > 1) params.set('page', String(p))
    return `/reconcile?${params.toString()}`
  }

  // Single column, ordered by the task, and state-driven rather than a fixed
  // layout — the shape research settled on after checking how QuickBooks,
  // Xero, NetSuite, Stripe and Adyen actually build this screen.
  //
  // It used to be two columns with the verdict in the primary 1.55fr slot and
  // "Enter Vibe Statement" in the secondary 1fr one. Shopify Polaris defines
  // that secondary column as holding "information that might not be used as
  // often but remains helpful for context or secondary tasks" — but entering
  // the statement is the one action this page exists for, and the verdict
  // beside it could not even be computed until that action had happened. So
  // before a statement arrived, the largest region on the page was
  // structurally empty and the only thing worth doing was in the corner.
  //
  // No mainstream product does it that way. QuickBooks gates its whole
  // reconcile screen behind entering the statement's ending balance, because
  // Difference = statement − cleared simply has no value without it. Xero
  // gives the bank's own figures the left/primary column and moves the verdict
  // to a separate report entirely.
  //
  // Deliberately NOT a stepper: NN/g warns wizards "quickly become annoying
  // and overly controlling if they have to be used over and over again", and
  // this is three people doing the same thing once a month.
  // diff is null exactly when companyPoints is — narrowing it here keeps
  // State B free of non-null assertions.
  const hasStatement = companyPoints != null && diff != null
  const gap = diff ?? 0
  const isClosed = Boolean(statement?.reconciled)

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Month is the page's scope, so it belongs in the header rather than
          as the first control inside the content — the same place QuickBooks,
          NetSuite and Stripe all settle it before any work begins. Changing it
          is a safe read, so it navigates on change with no separate View
          button to press. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2.5">
            Reconciliation
            <span className={`pill ${isClosed ? 'pill-jade' : 'pill-neutral'}`}>{isClosed ? 'Closed' : 'Open'}</span>
          </h1>
          <p className="page-subtitle">Compare your verified total against Vibe&apos;s own statement, then close the month.</p>
        </div>
        <form action="/reconcile" method="GET" className="flex items-center gap-2">
          <div className="w-44">
            <MonthPicker name="month" defaultValue={month} today={todayInMalaysia().slice(0, 7)} />
          </div>
          <button type="submit" className="btn-ghost py-1.5 text-xs">
            View
          </button>
        </form>
      </div>

      {error && <div className="alert alert-bad">{error}</div>}
      {saved && <div className="alert alert-ok">Statement saved.</div>}
      {reopened && <div className="alert alert-ok">{formatMonthLabel(month)} reopened. Make the correction, then close it again.</div>}

      {!hasStatement ? (
        /* STATE A — no statement yet. The form IS the page. No verdict
           placeholder showing "—", because the verdict genuinely doesn't
           exist yet; QuickBooks' equivalent state is simply its entry screen. */
        <div className="app-card">
          <h2 className="text-[14px] font-semibold text-paper">Enter Vibe&apos;s {formatMonthLabel(month)} statement</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-paper-dim">
            Nothing can be compared until Vibe&apos;s own figures are in. Upload their statement and the numbers below
            fill themselves in, or type them.
          </p>
          <div className="mt-4">
            <StatementForm
              month={month}
              initialPoints={companyPoints}
              initialProfit={statement?.company_profit_rm ?? null}
              initialNote={statement?.note ?? ''}
            />
          </div>
        </div>
      ) : (
        /* STATE B — statement is in. The difference becomes the anchor and
           stays visible; this is QuickBooks' summary bar, whose whole purpose
           is driving one number to zero. */
        <div className={`app-card ${gap === 0 ? 'ring-1 ring-jade/30' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[12px] font-medium uppercase tracking-wide text-paper-dim">Difference</div>
              {/* The number the page exists to produce. The old layout showed
                  your total and Vibe's total side by side and left the reader
                  to subtract them. */}
              <div
                className={`figure-points mt-1 text-[34px] font-semibold leading-none ${
                  gap === 0 ? 'text-jade-bright' : 'text-clay-bright'
                }`}
              >
                {gap === 0 ? '0' : `${gap > 0 ? '+' : ''}${gap.toLocaleString()}`} pts
              </div>
              <div className="mt-2 text-[13px] text-paper-dim">
                {gap === 0
                  ? 'Your records and Vibe’s agree exactly.'
                  : gap > 0
                    ? `Your system records ${Math.abs(gap).toLocaleString()} pts more than Vibe’s statement.`
                    : `Vibe’s statement is ${Math.abs(gap).toLocaleString()} pts higher than your system.`}
              </div>
            </div>
            <span className={`pill ${gap === 0 ? 'pill-jade' : 'pill-clay'}`}>{gap === 0 ? 'Matched' : 'Mismatch'}</span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2.5 border-t border-ink-800 pt-4 sm:grid-cols-3">
            <div>
              <div className="text-[12px] font-medium text-paper-dim">Your system</div>
              <div className="figure-points mt-0.5 text-[14px] font-semibold text-paper">{systemPoints.toLocaleString()} pts</div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-paper-dim">Vibe&apos;s statement</div>
              <div className="figure-points mt-0.5 text-[14px] font-semibold text-paper">{Number(companyPoints).toLocaleString()} pts</div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-paper-dim">Your 2% due</div>
              <div className="figure-money mt-0.5 text-[14px] font-semibold text-paper">{formatMYR(systemProfit)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Once entered, the statement collapses to a read-only summary with a
          Change affordance — GOV.UK's check-answers pattern. Showing the live
          form again would imply the entry step is still outstanding. Source is
          named because OCR can misread, and that's worth being able to see. */}
      {hasStatement && !isClosed && (
        <details className="app-card group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[13px] font-semibold text-paper">Vibe&apos;s statement</span>
              <span className="figure-points text-[12px] text-paper-dim">{Number(companyPoints).toLocaleString()} pts</span>
              {statement?.company_profit_rm != null && (
                <span className="figure-money text-[12px] text-paper-dim">{formatMYR(statement.company_profit_rm)}</span>
              )}
              {statement?.note ? <span className="truncate text-[12px] text-paper-dim">{statement.note}</span> : null}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-primary-deep">
              Change
              <IconChevronDown className="h-3 w-3 transition-transform duration-150 group-open:rotate-180" />
            </span>
          </summary>
          <div className="mt-4 border-t border-ink-800 pt-4">
            <StatementForm
              month={month}
              initialPoints={companyPoints}
              initialProfit={statement?.company_profit_rm ?? null}
              initialNote={statement?.note ?? ''}
            />
          </div>
        </details>
      )}

      {/* Supporting evidence, folded away by default — Stripe and Adyen both
          split reconciliation into a summary with itemised detail behind a
          deliberate step. Opened automatically when the difference isn't zero,
          because at that point the task changes from confirming to
          investigating and the rows stop being background material. The
          summary line carries the count and total, since NN/g requires the
          progression mechanic to say what's behind it. */}
      <details className="app-card group" open={hasStatement && gap !== 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-paper">
            {breakdownRows.length} verified transaction{breakdownRows.length === 1 ? '' : 's'} behind your total
          </span>
          <span className="flex shrink-0 items-center gap-2.5">
            <span className="figure-points text-[13px] font-semibold text-paper-dim">{systemPoints.toLocaleString()} pts</span>
            <IconChevronDown className="h-3 w-3 text-paper-dim transition-transform duration-150 group-open:rotate-180" />
          </span>
        </summary>
        <div className="mt-4 border-t border-ink-800 pt-4">
          {pagedRows.length ? (
            <ScrollFade label="Verified transactions in this period">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Dealer</th>
                    <th className="th">Type</th>
                    <th className="th text-right">Points</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((tx) => {
                    const dealerRel = Array.isArray(tx.dealers) ? tx.dealers[0] : tx.dealers
                    const dealerName = dealerRel?.company_name
                    return (
                      <tr key={tx.id} className="tr-row relative">
                        <td className="td text-paper-dim">{tx.tx_date}</td>
                        <td className="td">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={dealerName ?? '?'} size={24} />
                            {tx.dealer_id ? (
                              <a
                                href={`/dealers/${tx.dealer_id}`}
                                className="font-semibold text-paper after:absolute after:inset-0 after:content-[''] hover:text-jade-bright"
                              >
                                {dealerName ?? '—'}
                              </a>
                            ) : (
                              <span className="font-semibold text-paper">{dealerName ?? '—'}</span>
                            )}
                          </div>
                        </td>
                        <td className="td text-paper-dim">
                          {tx.type === 'package' ? `Buy Package ${tx.package}` : tx.type === 'adjustment' ? 'Adjustment' : 'Regular Top-up'}
                        </td>
                        <td className="td figure-points text-right">{tx.points.toLocaleString()}</td>
                        <td className="td">
                          <StatusDot color="jade-bright" label="Verified" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ScrollFade>
          ) : (
            <p className="text-sm text-paper-dim">No verified transactions in this period yet.</p>
          )}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
              <span className="text-[12px] text-paper-dim">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Link href={pageHref(currentPage - 1)} className="btn-ghost py-1.5 text-xs">
                    Previous
                  </Link>
                ) : (
                  <button type="button" disabled className="btn-ghost py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                    Previous
                  </button>
                )}
                {currentPage < totalPages ? (
                  <Link href={pageHref(currentPage + 1)} className="btn-ghost py-1.5 text-xs">
                    Next
                  </Link>
                ) : (
                  <button type="button" disabled className="btn-ghost py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                    Next
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="mt-3 text-center">
            {/* inline-block + py-1.5 so this standalone link is a 24px-tall
                touch target (WCAG 2.5.8) rather than just its 15px line box. */}
            <a
              href={`/records?month=${month}&status=verified`}
              className="inline-block py-1.5 text-[12px] font-semibold text-primary hover:underline"
            >
              View all in Transactions →
            </a>
          </div>
        </div>
      </details>

      {/* Closing is the consequential act on this page: migration 0031 locks
          the month at the database level afterwards. NetSuite, QuickBooks and
          Xero all put visible preconditions, a separate confirmation and an
          audit trail around the equivalent action; this gets its own block at
          the end of the task rather than sitting beside the figures. */}
      <div className="app-card">
        {isClosed ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-jade/12 text-jade-bright">
                <IconCheckCircle className="h-5 w-5" />
              </span>
              <div>
                <div className="text-[14px] font-semibold text-paper">{formatMonthLabel(month)} is closed</div>
                <div className="mt-0.5 text-[12px] text-paper-dim">
                  Transactions dated in this month can no longer be added, edited or verified.
                </div>
              </div>
            </div>
            {user.role === 'master' && <ReopenMonthForm month={month} />}
          </div>
        ) : (
          <>
            <div className="text-[14px] font-semibold text-paper">Close {formatMonthLabel(month)}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-paper-dim">
              Locks the month. Once closed, no transaction dated in {formatMonthLabel(month)} can be added, edited or
              verified — a correction has to reopen the month first.
            </p>
            {/* Precondition stays visible rather than the action just being
                absent, so it's clear what's left to do — NetSuite shows its
                blocked close tasks as a lock icon for the same reason. */}
            {!hasStatement && (
              <p className="mt-2 text-[12px] font-medium text-brass-bright">Enter Vibe&apos;s statement first.</p>
            )}
            {hasStatement && gap !== 0 && (
              <p className="mt-2 text-[12px] font-medium text-brass-bright">
                Resolve the {Math.abs(gap).toLocaleString()} pt difference, or record a reason for closing anyway.
              </p>
            )}
            <div className="mt-4">
              <MarkReconciledForm month={month} monthLabel={formatMonthLabel(month)} hasStatement={hasStatement} diff={diff} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
