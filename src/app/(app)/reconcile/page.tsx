import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange, currentMonth } from '@/lib/month'
import { saveStatement, markReconciled } from './actions'
import { ReconciledStamp, IconCheckCircle, IconAlertCircle } from '../icons'

export const metadata: Metadata = {
  title: 'Reconciliation — DealerHub',
}

type BreakdownRow = {
  id: string
  tx_date: string
  type: 'package' | 'topup'
  package: string | null
  points: number
  dealers: { company_name: string } | { company_name: string }[] | null
}

type PageProps = {
  searchParams: Promise<{ month?: string; error?: string; saved?: string }>
}

export default async function ReconcilePage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { month = currentMonth(), error, saved } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <div className="app-card text-sm text-paper-dim">Your role ({user.role}) does not have permission to view reconciliation.</div>
  }

  const { start, end } = monthRange(month)
  const supabase = await createClient()

  const [{ data: verifiedTx }, { data: statement }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, tx_date, type, package, points, dealers(company_name)')
      .eq('status', 'verified')
      .gte('tx_date', start)
      .lte('tx_date', end)
      .order('tx_date', { ascending: false })
      .limit(200),
    supabase.from('company_statements').select('*').eq('month', `${month}-01`).maybeSingle(),
  ])

  const breakdownRows = (verifiedTx as BreakdownRow[] | null) ?? []
  const systemPoints = breakdownRows.reduce((s, t) => s + Number(t.points), 0)
  const systemProfit = Math.round(systemPoints * 0.02 * 100) / 100
  const companyPoints = statement?.company_total_points ?? null
  const diff = companyPoints != null ? systemPoints - companyPoints : null

  return (
    <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
      <div className="app-card relative overflow-visible">
        {statement?.reconciled && (
          <div className="pointer-events-none absolute -right-3 -top-5">
            <ReconciledStamp sub={month} />
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-paper">Reconciliation · {month}</h3>
          <form action="/reconcile" method="GET" className="flex flex-wrap items-center gap-2">
            <input type="month" name="month" defaultValue={month} className="field-input w-auto py-1.5" />
            <button type="submit" className="btn-ghost py-1.5 text-xs">
              View
            </button>
          </form>
        </div>

        {error && <div className="alert alert-bad">{error}</div>}
        {saved && <div className="alert alert-ok">Saved.</div>}

        <div className="grid grid-cols-2 gap-3">
          <div className="app-tile">
            <div className="text-[11px] font-semibold text-paper-dim">System Total (verified)</div>
            <div className="figure-points mt-1.5 text-xl font-semibold">{systemPoints.toLocaleString()} pts</div>
          </div>
          <div className="app-tile">
            <div className="text-[11px] font-semibold text-paper-dim">Vibe Company Statement</div>
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

        <div className="-mx-3 mt-3 flex items-center justify-between rounded-lg bg-brass/10 px-3 py-2.5">
          <span className="text-sm font-semibold text-paper">Your 2% Due</span>
          <b className="figure-money text-lg">RM {systemProfit.toLocaleString()}</b>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <form action={markReconciled} className="w-full">
            <input type="hidden" name="month" value={month} />
            <button type="submit" disabled={!statement} className="btn-primary w-full">
              Mark Reconciled ✓
            </button>
          </form>
        </div>

        <div className="mt-5 border-t border-ink-800 pt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wide text-paper-dim">Verified Transactions Behind This Total</h4>
            <span className="pill pill-neutral">{breakdownRows.length}</span>
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
                  </tr>
                </thead>
                <tbody>
                  {breakdownRows.slice(0, 8).map((tx) => {
                    const dealerName = Array.isArray(tx.dealers) ? tx.dealers[0]?.company_name : tx.dealers?.company_name
                    return (
                      <tr key={tx.id} className="tr-row">
                        <td className="td text-paper-dim">{tx.tx_date}</td>
                        <td className="td font-semibold text-paper">{dealerName ?? '—'}</td>
                        <td className="td text-paper-dim">{tx.type === 'package' ? `Package ${tx.package}` : 'Top-up'}</td>
                        <td className="td figure-points text-right">{tx.points.toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-paper-dim">No verified transactions in this period yet.</p>
          )}
          {breakdownRows.length > 8 && (
            <a href={`/records?month=${month}&status=verified`} className="mt-2 block text-[11.5px] font-semibold text-primary hover:underline">
              +{breakdownRows.length - 8} more — view all in Transactions →
            </a>
          )}
        </div>
      </div>

      <div className="app-card">
        <h3 className="mb-3.5 text-sm font-bold text-paper">Enter Vibe Statement</h3>
        <form action={saveStatement} className="flex flex-col gap-3.5">
          <input type="hidden" name="month" value={month} />
          <div>
            <label className="field-label">Vibe total top-up (pts)</label>
            <input
              name="company_total_points"
              type="number"
              step="0.01"
              min="0"
              defaultValue={companyPoints ?? ''}
              required
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Vibe&apos;s Profit Figure (RM)</label>
            <input
              name="company_profit_rm"
              type="number"
              step="0.01"
              min="0"
              defaultValue={statement?.company_profit_rm ?? ''}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Note</label>
            <input name="note" type="text" defaultValue={statement?.note ?? ''} className="field-input" />
          </div>
          <button type="submit" className="btn-primary w-full">
            Save &amp; Compare
          </button>
        </form>
        <p className="note-strip">
          Vibe provides a monthly total; the system compares it against verified records automatically so any
          mismatch is obvious right away.
        </p>
      </div>
    </div>
  )
}
