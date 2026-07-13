import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange, currentMonth } from '@/lib/month'
import { saveStatement, markReconciled } from './actions'

export const metadata: Metadata = {
  title: 'Reconciliation — DealerHub',
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
    supabase.from('transactions').select('points').eq('status', 'verified').gte('tx_date', start).lte('tx_date', end),
    supabase.from('company_statements').select('*').eq('month', `${month}-01`).maybeSingle(),
  ])

  const systemPoints = (verifiedTx ?? []).reduce((s, t) => s + Number(t.points), 0)
  const systemProfit = Math.round(systemPoints * 0.02 * 100) / 100
  const companyPoints = statement?.company_total_points ?? null
  const diff = companyPoints != null ? systemPoints - companyPoints : null

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="app-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-paper">Reconciliation · {month}</h3>
          <form action="/reconcile" method="GET" className="flex items-center gap-2">
            <input type="month" name="month" defaultValue={month} className="field-input w-auto py-1.5" />
            <button type="submit" className="btn-ghost py-1.5 text-xs">
              View
            </button>
          </form>
        </div>

        {error && <div className="alert alert-bad">{error}</div>}
        {saved && <div className="alert alert-ok">Saved.</div>}

        <Row label="System Total Top-up (verified)" value={`${systemPoints.toLocaleString()} pts`} unit="points" />
        <Row
          label="Vibe Company Statement"
          value={companyPoints != null ? `${Number(companyPoints).toLocaleString()} pts` : 'Not entered yet'}
          unit={companyPoints != null ? 'points' : undefined}
        />
        <Row
          label="Difference"
          value={diff == null ? '—' : diff === 0 ? '✓ Matches exactly' : `${diff > 0 ? '+' : ''}${diff.toLocaleString()} pts`}
          highlight={diff === 0 ? 'good' : diff != null && diff !== 0 ? 'bad' : undefined}
        />
        <Row label="Your 2% Due" value={`RM ${systemProfit.toLocaleString()}`} unit="money" bold />

        <div className="mt-4 flex items-center gap-3">
          <form action={markReconciled}>
            <input type="hidden" name="month" value={month} />
            <button type="submit" disabled={!statement} className="btn-primary">
              Mark Reconciled ✓
            </button>
          </form>
          {statement?.reconciled && <span className="pill pill-jade">Reconciled this month</span>}
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
          <button type="submit" className="btn-primary">
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

function Row({
  label,
  value,
  unit,
  highlight,
  bold,
}: {
  label: string
  value: string
  unit?: 'money' | 'points'
  highlight?: 'good' | 'bad'
  bold?: boolean
}) {
  const valueClass =
    highlight === 'good'
      ? 'figure text-jade-bright'
      : highlight === 'bad'
        ? 'figure text-clay-bright'
        : unit === 'money'
          ? 'figure-money'
          : unit === 'points'
            ? 'figure-points'
            : 'text-paper'
  return (
    <div className="docket-row">
      <span className="text-paper-dim">{label}</span>
      <b className={`${valueClass} ${bold ? 'text-base' : ''}`}>{value}</b>
    </div>
  )
}
