import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { resolveReportMonth } from '@/lib/reporting-month'
import { daysSince } from '@/lib/dealer-activity'
import { monthRange, currentMonth, todayInMalaysia, formatMonthLabel, formatDateLabel } from '@/lib/month'
import { IconCheckCircle, IconChevronDown } from '../icons'
import { Avatar } from '../avatar'
import { StatusDot } from '../status-dot'
import { StatementForm } from './statement-form'
import { MarkReconciledForm } from './mark-reconciled-form'
import { ReopenMonthForm } from './reopen-month-form'
import { OpenVariances } from './open-variances'
import { GapLeads } from './gap-leads'
import { findReconciliationGapLeads, type GapTx } from '@/lib/reconcile-gap'
import { fetchAll } from '@/lib/fetch-all'
import { MonthPicker } from '../month-picker'
import { ScrollFade } from '../scroll-fade'
import { formatMYR } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Reconciliation — Vibe456',
}

// How many verified rows the evidence table shows before handing off to
// Transactions. Enough to recognise the month, few enough that Close stays
// on the same screen as the form above it.
const EVIDENCE_ROWS = 8

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
  searchParams: Promise<{ month?: string; error?: string; saved?: string; reopened?: string; resolved?: string }>
}

export default async function ReconcilePage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { month: monthParam, error, saved, reopened, resolved } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="view reconciliation" />
  }

  const supabase = await createClient()
  // The month you reconcile is the one that has transactions in it. Opening on
  // an untouched current month put a 38px "0 pts" at the top of the page and
  // disabled the only button on it.
  const { month, auto: monthAuto } = await resolveReportMonth(supabase, monthParam)

  const { start, end } = monthRange(month)

  const [{ data: totalsRow }, { data: evidenceData }, { data: statement }, { data: openVarianceRows }, { data: varianceProfiles }] = await Promise.all([
    // The month's total is summed in the database (0054), not from rows fetched here: the
    // API returns at most 1,000 rows per request without saying so, so a total added up
    // from fetched rows is a fraction of the truth once a month passes that — measured
    // 2,905,470 pts read against a real 12,073,598. The rows below are only the extract.
    supabase.rpc('verified_month_totals', { p_start: start, p_end: end }).single(),
    supabase
      .from('transactions')
      .select('id, dealer_id, tx_date, type, package, points, commission_rm, dealers(company_name)')
      .eq('status', 'verified')
      .gte('tx_date', start)
      .lte('tx_date', end)
      .order('tx_date', { ascending: false })
      .order('id')
      .limit(EVIDENCE_ROWS),
    supabase.from('company_statements').select('*').eq('month', `${month}-01`).maybeSingle(),
    // Every month still open, not just the one on screen — an unanswered
    // variance is outstanding work wherever you happen to be standing.
    supabase.from('statement_variances').select('id, month, gap_points, reason, opened_by, created_at').is('resolved_at', null).order('month', { ascending: false }),
    supabase.from('staff_directory').select('id, display_name'),
  ])

  const evidenceRows = (evidenceData as BreakdownRow[] | null) ?? []
  const totals = totalsRow as { points: number | string; commission: number | string; tx_count: number | string } | null
  const txCount = Number(totals?.tx_count ?? 0)
  const varianceNameById = new Map((varianceProfiles ?? []).map((p) => [p.id, p.display_name ?? '—']))
  const openVariances = ((openVarianceRows ?? []) as { id: string; month: string; gap_points: number; reason: string; opened_by: string; created_at: string }[]).map((v) => ({
    id: v.id,
    month: v.month,
    gap_points: Number(v.gap_points),
    reason: v.reason,
    openedByName: varianceNameById.get(v.opened_by) ?? '—',
    createdAt: v.created_at,
    // daysSince, not Date.now() arithmetic: it counts in the Malaysia
    // calendar the way every other "N days ago" in this app does, and keeping
    // the clock read out of the render body is what the compiler's purity rule
    // is asking for.
    daysOpen: daysSince(v.created_at.slice(0, 10)),
  }))

  const systemPoints = Number(totals?.points ?? 0)
  // Sums each row's own commission_rm rather than recomputing points*rate —
  // matches how Reports/Dashboard/dealer-detail all compute "Your 2%", and
  // avoids the two calculations landing a cent apart under fractional
  // adjustment amounts (round(sum) vs sum(round) aren't the same operation).
  const systemProfit = Math.round(Number(totals?.commission ?? 0) * 100) / 100
  const companyPoints = statement?.company_total_points ?? null
  // Rounded to whole points before comparing — systemPoints is a float sum
  // over potentially many fractional-point adjustment rows, so an
  // honestly-reconciled month could otherwise land on e.g. 4e-13 instead of
  // exactly 0 and wrongly report "Mismatch found".
  const diff = companyPoints != null ? Math.round((systemPoints - companyPoints) * 100) / 100 : null

  // An extract, not a page of results. The full list lives on Transactions,
  // which is built for reading a ledger; here it only has to answer "does
  // this look like my month" before you lock it. (evidenceRows above.)

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

  // A deterministic search for which of this month's own transactions could
  // account for the gap — see lib/reconcile-gap.ts for why this is
  // arithmetic rather than a model call.
  // Every row of the month, but only when there is a gap to explain — a matching month
  // has nothing to search, and reading thousands of rows to find nothing is wasted work.
  // Paged, because the search needs each row and a single request stops at 1,000.
  const gapRows =
    hasStatement && gap !== 0
      ? await fetchAll<BreakdownRow>((from, to) =>
          supabase
            .from('transactions')
            .select('id, dealer_id, tx_date, type, package, points, commission_rm, dealers(company_name)')
            .eq('status', 'verified')
            .gte('tx_date', start)
            .lte('tx_date', end)
            .order('id')
            .range(from, to) as unknown as PromiseLike<{ data: BreakdownRow[] | null; error: { message: string } | null }>,
        )
      : []
  const gapTxs: GapTx[] = gapRows.map((t) => {
    const rel = t.dealers
    return {
      id: t.id,
      dealerId: t.dealer_id,
      dealerName: (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—',
      points: Number(t.points),
      txDate: t.tx_date,
    }
  })
  const gapFindings = hasStatement && gap !== 0 ? findReconciliationGapLeads(gapTxs, gap, end) : []

  return (
    <div className="flex w-full flex-col gap-8">
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
          {/* Only what the page is for. The "showing an earlier month" notice
              used to lead this line, which read as a two-sentence paragraph and
              wrapped to three lines at 390px — enough to push the month picker
              onto its own row and the first card past 200px. It also belonged
              somewhere else: it explains a figure, so it now sits beside the
              figure it explains. */}
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
      {resolved && <div className="alert alert-ok">Variance resolved.</div>}
      {reopened && <div className="alert alert-ok">{formatMonthLabel(month)} reopened. Make the correction, then close it again.</div>}

      {!hasStatement ? (
        /* STATE A — no statement yet.
           The page used to open on the entry form, and measured against the
           rest of the app that was the odd one out: every other page paints a
           summary card directly under the title and this one opened on an
           empty form at y=112. The earlier note here was right that a verdict
           placeholder reading "—" would be a lie — the difference genuinely
           cannot exist yet. But your own side of the comparison does exist,
           and stating it is not a verdict. So the card carries what is known
           and names what is missing, and the form moves below it as a band. */
        /* One line, not a hero.
           The hero here was 97,465 pts at 34px under "YOUR VERIFIED TOTAL",
           and the strip beneath it opened with "Your system 97,465 pts" —
           the same number, printed twice inside one card, with the third
           appearance on the breakdown fold below. Two of the strip's three
           cells were dead: one a duplicate, one the words "Not entered yet"
           occupying a whole column to say a thing was absent.
           It is also a hero that cannot mean anything yet. This page exists
           to answer whether two sides agree; before Vibe's figures arrive
           there is no answer, and dressing your own subtotal up as one is
           what made the page feel like it was reporting a result. State the
           two facts that are true, and let the form be the page.

           py-5, not py-4. At py-4 this measured 52px and design-audit's anchor
           rule — the page's first painted surface must be at least 56px and
           start near the title — skipped it as too small to land on, then
           reported the form card below at y=211 as the page opening on bare
           canvas. The threshold is right: a 52px strip is a caption, not
           something the eye can settle on. So the card grew rather than the
           rule shrinking.

           This note is a plain block comment rather than a braced JSX one,
           deliberately: a ternary branch holds one expression, and a JSX
           comment beside the element is a second child with no parent. */
        <div className="app-card">
          <div className="text-[12px] font-medium uppercase tracking-wide text-paper-dim">Your verified total</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="figure-points text-[34px] font-semibold leading-none text-paper">{systemPoints.toLocaleString()} pts</span>
            {monthAuto && (
              <span
                className="pill pill-neutral"
                title={`Nothing has been verified yet in ${formatMonthLabel(currentMonth())} — this is ${formatMonthLabel(month)} instead.`}
              >
                {formatMonthLabel(month)}
              </span>
            )}
          </div>
          {/* Everything the dead three-cell strip used to carry, on one line.
              Of those three cells, one repeated the figure above it verbatim
              and one held the words "Not entered yet" — a whole column spent
              saying a thing was absent. Only "Your 2% due" was a fact the
              headline did not already state, so it joins the sentence that
              was there anyway. */}
          <div className="mt-2.5 text-[13px] text-paper-dim">
            {txCount} verified transaction{txCount === 1 ? '' : 's'} in {formatMonthLabel(month)} · your 2%{' '}
            <b className="figure-money font-semibold text-paper">{formatMYR(systemProfit)}</b>
          </div>
          <div className="mt-1 text-[13px] text-brass-bright">
            Vibe has not sent their {formatMonthLabel(month)} statement yet — nothing can be compared until it is in.
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
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className={`figure-points text-[34px] font-semibold leading-none ${gap === 0 ? 'text-jade-bright' : 'text-clay-bright'}`}>
                  {gap === 0 ? '0' : `${gap > 0 ? '+' : ''}${gap.toLocaleString()}`} pts
                </span>
                {monthAuto && (
                  <span
                    className="pill pill-neutral"
                    title={`Nothing has been verified yet in ${formatMonthLabel(currentMonth())} — this is ${formatMonthLabel(month)} instead.`}
                  >
                    {formatMonthLabel(month)}
                  </span>
                )}
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

      {/* Directly under the summary. An unanswered gap against Vibe is the
          most consequential thing this page can be carrying, so it sits above
          the forms rather than below them. Renders nothing when there are
          none. */}
      <GapLeads findings={gapFindings} />

      <OpenVariances items={openVariances} month={month} />

      {/* The entry form, once the summary above has said where you stand.
          A band, not a card: this page's one card is the summary, and the
          three things below it — enter, check, close — are the task itself
          laid out in order. Same reasoning as an index page's table, which
          also stopped being boxed. */}
      {/* A card now, not a band. The rule on this page is that the card is
          the thing you act on, and with no statement in there is exactly one
          thing to act on — this. The summary above gave up its card in the
          same move, so the page still carries one. */}
      {!hasStatement && (
        <div className="app-card">
          <h2 className="text-[14px] font-semibold text-paper">Enter Vibe&apos;s {formatMonthLabel(month)} statement</h2>
          <p className="mb-4 mt-1 text-[12px] leading-relaxed text-paper-dim">
            Upload their statement and the numbers below fill themselves in, or type them.
          </p>
          <StatementForm
            month={month}
            initialPoints={companyPoints}
            initialProfit={statement?.company_profit_rm ?? null}
            initialNote={statement?.note ?? ''}
          />
        </div>
      )}

      {/* Once entered, the statement collapses to a read-only summary with a
          Change affordance — GOV.UK's check-answers pattern. Showing the live
          form again would imply the entry step is still outstanding. Source is
          named because OCR can misread, and that's worth being able to see. */}
      {hasStatement && !isClosed && (
        <details className="page-band group">
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


      {/* Closing is the consequential act on this page: migration 0031 locks
          the month at the database level afterwards. NetSuite, QuickBooks and
          Xero all put visible preconditions, a separate confirmation and an
          audit trail around the equivalent action; this gets its own block at
          the end of the task rather than sitting beside the figures.

          A card, not a bare band. This page is three steps — see where you
          stand, enter Vibe's figures, lock the month — and the first two were
          cards while the third was loose text on the canvas, so the one
          irreversible act on the page looked like a footer. */}
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
                {/* Closing is not the end of the month's work, it is the
                    permission to do the last of it: the figures cannot move
                    now, so this is the moment the commission report is worth
                    producing. The page said "closed" and stopped, leaving the
                    one remaining step to be remembered rather than offered. */}
                <a
                  href={`/reports?month=${month}`}
                  className="mt-1.5 inline-block py-1 text-[12px] font-semibold text-primary hover:underline"
                >
                  Now the figures are final — see the {formatMonthLabel(month)} report →
                </a>
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

      {/* Supporting evidence, open, and below the three steps rather than
          between them.
          It used to be a <details> — the only collapsed table in the whole
          app. Transactions, Dealers, SIM Card Stock, Monthly Report and
          Credit Purchases all show theirs, so this one read as belonging to
          a different product. Folding it also put a click between the reader
          and the only proof the figure above is right.
          It is capped instead. Fifty rows of evidence between the entry form
          and the Close button pushed the one irreversible act on the page
          hundreds of pixels down; the most recent few answer "does this look
          like my month", and Transactions is where you go to read the rest.
          Pagination went with the cap — a paged control on an eight-row
          extract is machinery for nothing. */}
      <div className="page-band">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-[13px] font-semibold text-paper">
            What is behind the {systemPoints.toLocaleString()} pts
            <span className="ml-2 font-normal text-paper-dim">
              {txCount <= EVIDENCE_ROWS ? `all ${txCount}` : `most recent ${EVIDENCE_ROWS} of ${txCount}`}
            </span>
          </span>
          <Link href={`/records?month=${month}&status=verified`} className="text-[12px] font-semibold text-primary hover:underline">
            View all {txCount} in Transactions →
          </Link>
        </div>
        <div>
          {evidenceRows.length ? (
            <ScrollFade label="Verified transactions in this period">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Dealer</th>
                    <th className="th">Type</th>
                    <th className="th text-right">Points</th>
                    {/* Right-aligned. A status chip in a left-aligned last
                        column sits mid-cell and leaves the row's ink 78px
                        short of the table's own edge — see qa-probe-ink.mjs.
                        Every other table here ends on ink at the edge. */}
                    <th className="th text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {evidenceRows.map((tx) => {
                    const dealerRel = Array.isArray(tx.dealers) ? tx.dealers[0] : tx.dealers
                    const dealerName = dealerRel?.company_name
                    return (
                      <tr key={tx.id} className="tr-row relative">
                        {/* nowrap. "10 Aug 2026" is one character longer
                            than "8 Aug 2026" and wrapped where the shorter
                            dates did not — so on the demo month exactly the
                            two-digit days ran 61px rows and the rest 45px. */}
                        <td className="td whitespace-nowrap text-paper-dim">{formatDateLabel(tx.tx_date)}</td>
                        {/* truncate + title, the same treatment /records
                            gives a dealer name. Left to wrap, the longest
                            name on the demo — Bayan Baru Handphone Centre —
                            took its row to 61px against 45px for the rest.
                            Abbreviated is fine here; unrecoverable is not,
                            so the full name stays on the title. */}
                        <td className="td">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar name={dealerName ?? '?'} size={24} />
                            {tx.dealer_id ? (
                              <a
                                href={`/dealers/${tx.dealer_id}`}
                                title={dealerName ?? undefined}
                                className="truncate font-semibold text-paper after:absolute after:inset-0 after:content-[''] hover:text-jade-bright"
                              >
                                {dealerName ?? '—'}
                              </a>
                            ) : (
                              <span className="truncate font-semibold text-paper" title={dealerName ?? undefined}>
                                {dealerName ?? '—'}
                              </span>
                            )}
                          </div>
                        </td>
                        {/* nowrap: at 390px "Regular Top-up" wrapped to two
                            lines while "Buy Package B" did not, so the table
                            ran 61px rows and 45px rows alternately. The audit
                            never saw it because this table was collapsed. */}
                        <td className="td whitespace-nowrap text-paper-dim">
                          {tx.type === 'package' ? `Buy Package ${tx.package}` : tx.type === 'adjustment' ? 'Correction' : 'Regular Top-up'}
                        </td>
                        <td className="td figure-points text-right">{tx.points.toLocaleString()}</td>
                        <td className="td text-right">
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
        </div>
      </div>
    </div>
  )
}
