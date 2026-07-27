import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { monthRange, currentMonth, todayInMalaysia } from '@/lib/month'
import { ReconciledStamp, IconCheckCircle, IconAlertCircle, IconBuilding, IconDocument } from '../icons'
import { Avatar } from '../avatar'
import { StatusDot } from '../status-dot'
import { StatementForm } from './statement-form'
import { MarkReconciledForm } from './mark-reconciled-form'
import { MonthPicker } from '../month-picker'

export const metadata: Metadata = {
  title: 'Reconciliation — DealerHub',
}

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
  searchParams: Promise<{ month?: string; error?: string; saved?: string }>
}

export default async function ReconcilePage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { month = currentMonth(), error, saved } = await searchParams

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
    // Reports runs the identical unbounded query for the same reason.
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

  return (
    <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
      <div className="app-card relative overflow-visible">
        {statement?.reconciled && (
          <div className="pointer-events-none absolute -right-3 -top-5">
            <ReconciledStamp sub={month} />
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight text-paper">Reconciliation · {month}</h1>
            <p className="mt-1 text-[12.5px] text-paper-dim">
              Compare what your system recorded against Vibe&apos;s official statement before confirming this month&apos;s
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

        <h2 className="mb-3 text-sm font-bold text-paper">This Month&apos;s Comparison</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className={`app-tile ${diff === 0 ? 'border-jade/30 bg-jade/10' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">Your System (verified)</div>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <IconBuilding className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="figure-points mt-1.5 text-xl font-semibold">{systemPoints.toLocaleString()} pts</div>
          </div>
          <div className={`app-tile ${diff === 0 ? 'border-jade/30 bg-jade/10' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-paper-dim">Vibe&apos;s Statement</div>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <IconDocument className="h-3.5 w-3.5" />
              </span>
            </div>
            {companyPoints != null ? (
              <div className="figure-points mt-1.5 text-xl font-semibold">{Number(companyPoints).toLocaleString()} pts</div>
            ) : (
              <div className="mt-1.5 text-sm text-paper-dim">Not entered yet</div>
            )}
          </div>
        </div>

        <div
          className={`mt-3 flex items-center gap-3 rounded-xl px-4 py-3.5 ${
            diff == null ? 'bg-ink-850/60' : diff === 0 ? 'bg-jade/10' : 'bg-clay/10'
          }`}
        >
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
              diff == null ? 'bg-ink-800 text-paper-dim' : diff === 0 ? 'bg-jade/15 text-jade-bright' : 'bg-clay/15 text-clay-bright'
            }`}
          >
            {diff === 0 ? <IconCheckCircle className="h-5 w-5" /> : <IconAlertCircle className="h-5 w-5" />}
          </span>
          <div>
            <div
              className={`text-sm font-bold ${
                diff == null ? 'text-paper-dim' : diff === 0 ? 'text-jade-bright' : 'text-clay-bright'
              }`}
            >
              {diff == null ? 'Awaiting Vibe statement' : diff === 0 ? 'Matches exactly' : 'Mismatch found'}
            </div>
            <div className="text-xs text-paper-dim">
              {diff == null
                ? 'Enter the Vibe statement to compare.'
                : diff === 0
                  ? 'System and Vibe totals agree for this month.'
                  : `${diff > 0 ? '+' : ''}${diff.toLocaleString()} pts difference`}
            </div>
          </div>
        </div>

        <div className="-mx-3 mt-3 flex items-center justify-between rounded-lg bg-primary-soft px-3 py-2.5">
          <span className="text-sm font-semibold text-paper">Your 2% Due</span>
          <b className="figure-money text-lg text-primary-deep">RM {systemProfit.toLocaleString()}</b>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <MarkReconciledForm month={month} hasStatement={!!statement} diff={diff} />
        </div>

        <div className="mt-5 border-t border-ink-800 pt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-paper">Verified Transactions Behind This Total</h2>
            <span className="pill pill-neutral">Most recent</span>
          </div>
          {breakdownRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
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
                  {breakdownRows.slice(0, 8).map((tx) => {
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
            </div>
          ) : (
            <p className="text-sm text-paper-dim">No verified transactions in this period yet.</p>
          )}
          <div className="mt-3 text-center">
            <a href={`/records?month=${month}&status=verified`} className="text-[11.5px] font-semibold text-primary hover:underline">
              View all in Transactions →
            </a>
          </div>
        </div>
      </div>

      <div className="app-card">
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
