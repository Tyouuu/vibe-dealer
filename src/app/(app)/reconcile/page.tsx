import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { monthRange, currentMonth, todayInMalaysia, formatMonthLabel } from '@/lib/month'
import { ReconciledStamp, IconCheckCircle, IconAlertCircle } from '../icons'
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
  searchParams: Promise<{ month?: string; error?: string; saved?: string; page?: string }>
}

export default async function ReconcilePage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { month = currentMonth(), error, saved, page } = await searchParams
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

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <div className="app-card relative overflow-visible">
          {statement?.reconciled && (
            <div className="pointer-events-none absolute -right-3 -top-5">
              <ReconciledStamp sub={month} />
            </div>
          )}
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="page-title">Reconciliation · {formatMonthLabel(month)}</h1>
              <p className="page-subtitle">
                Compare what your system recorded against Vibe&apos;s statement before confirming this month&apos;s
                commission.
              </p>
            </div>
            <form action="/reconcile" method="GET" className="flex flex-wrap items-center gap-2">
              <div className="w-40">
                <MonthPicker name="month" defaultValue={month} today={todayInMalaysia().slice(0, 7)} />
              </div>
              <button type="submit" className="btn-ghost py-1.5 text-xs">
                View
              </button>
            </form>
          </div>

          {error && <div className="alert alert-bad">{error}</div>}
          {saved && <div className="alert alert-ok">Saved.</div>}

          {/* One verdict, stated once, in the app's own visual language.
              This block previously stacked three different container styles
              (a tinted verdict panel, a dashed info box, a full-bleed purple
              strip) and set its headline in the MONO face — which is used
              nowhere else in the app for prose, only for figures. That single
              choice was most of why the page read as if it came from a
              different product. Everything here now uses .app-tile, .pill and
              .figure-* exactly as the rest of the app does. */}
          <div className="rounded-xl border border-ink-800 bg-ink-850/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                    diff == null
                      ? 'bg-ink-800 text-paper-dim'
                      : diff === 0
                        ? 'bg-jade/12 text-jade-bright'
                        : 'bg-clay/12 text-clay-bright'
                  }`}
                >
                  {diff === 0 ? <IconCheckCircle className="h-5 w-5" /> : <IconAlertCircle className="h-5 w-5" />}
                </span>
                <div>
                  <div className="text-[15px] font-semibold text-paper">
                    {diff == null
                      ? 'Waiting on Vibe’s statement'
                      : diff === 0
                        ? 'Your records match Vibe’s'
                        : `Off by ${Math.abs(diff).toLocaleString()} pts`}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-paper-dim">
                    {diff == null
                      ? 'Enter their total on the right to compare.'
                      : diff === 0
                        ? 'Nothing to resolve — this month is ready to close.'
                        : `Your system is ${diff > 0 ? 'ahead of' : 'behind'} their statement.`}
                  </div>
                </div>
              </div>
              <span className={`pill ${diff == null ? 'pill-neutral' : diff === 0 ? 'pill-jade' : 'pill-clay'}`}>
                {diff == null ? 'No statement' : diff === 0 ? 'Matched' : 'Mismatch'}
              </span>
            </div>

            {/* Same three-figure row in every state, so the numbers don't
                move around as the verdict changes. */}
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-lg bg-ink-900 px-3.5 py-2.5">
                <div className="text-[11px] font-medium text-paper-dim">Your system</div>
                <div className="figure-points mt-0.5 text-[15px] font-semibold text-paper">{systemPoints.toLocaleString()} pts</div>
              </div>
              <div className="rounded-lg bg-ink-900 px-3.5 py-2.5">
                <div className="text-[11px] font-medium text-paper-dim">Vibe’s statement</div>
                <div className="figure-points mt-0.5 text-[15px] font-semibold text-paper">
                  {companyPoints == null ? '—' : `${Number(companyPoints).toLocaleString()} pts`}
                </div>
              </div>
              <div className="rounded-lg bg-ink-900 px-3.5 py-2.5">
                <div className="text-[11px] font-medium text-paper-dim">Your 2% due</div>
                <div className="figure-money mt-0.5 text-[15px] font-semibold text-paper">{formatMYR(systemProfit)}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <MarkReconciledForm month={month} hasStatement={!!statement} diff={diff} />
          </div>

          {/* Once a month is reconciled its totals are locked (0031), so the
              only way to correct it is to reopen it — master only. */}
          {statement?.reconciled && user.role === 'master' && (
            <div className="mt-3">
              <ReopenMonthForm month={month} />
            </div>
          )}
        </div>

        <div className="app-card">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-paper">Verified Transactions Behind This Total</h2>
            <span className="pill pill-neutral">{breakdownRows.length} transaction{breakdownRows.length === 1 ? '' : 's'}</span>
          </div>
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
              <span className="text-[11.5px] text-paper-dim">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Link href={pageHref(currentPage - 1)} className="btn-ghost py-1.5 text-xs">
                    Previous
                  </Link>
                ) : (
                  <span className="btn-ghost cursor-not-allowed py-1.5 text-xs opacity-40">Previous</span>
                )}
                {currentPage < totalPages ? (
                  <Link href={pageHref(currentPage + 1)} className="btn-ghost py-1.5 text-xs">
                    Next
                  </Link>
                ) : (
                  <span className="btn-ghost cursor-not-allowed py-1.5 text-xs opacity-40">Next</span>
                )}
              </div>
            </div>
          )}
          <div className="mt-3 text-center">
            {/* inline-block + py-1.5 so this standalone link is a 24px-tall
                touch target (WCAG 2.5.8) rather than just its 15px line box. */}
            <a
              href={`/records?month=${month}&status=verified`}
              className="inline-block py-1.5 text-[11.5px] font-semibold text-primary hover:underline"
            >
              View all in Transactions →
            </a>
          </div>
        </div>
      </div>

      <div className="app-card lg:sticky lg:top-5 lg:self-start">
        <h3 className="mb-3.5 text-sm font-bold text-paper">Enter Vibe Statement</h3>
        <StatementForm
          month={month}
          initialPoints={companyPoints}
          initialProfit={statement?.company_profit_rm ?? null}
          initialNote={statement?.note ?? ''}
        />
        <p className="note-strip">
          Vibe provides a monthly total; the system compares it against verified records automatically so any
          mismatch is obvious right away.
        </p>
      </div>
    </div>
  )
}
