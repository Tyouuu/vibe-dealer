import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange, currentMonth } from '@/lib/month'
import { saveStatement, markReconciled } from './actions'

export const metadata: Metadata = {
  title: '月度对账 — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ month?: string; error?: string; saved?: string }>
}

export default async function ReconcilePage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { month = currentMonth(), error, saved } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        你的角色（{user.role}）没有查看月度对账的权限。
      </div>
    )
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
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-zinc-50">⇄ 月度对账 · {month}</h3>
          <form action="/reconcile" method="GET" className="flex items-center gap-2">
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
            />
            <button
              type="submit"
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
            >
              查看
            </button>
          </form>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-3.5 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}
        {saved && (
          <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/50 px-3.5 py-2.5 text-sm text-emerald-300">
            已保存。
          </div>
        )}

        <Row label="系统 total top-up（verified）" value={`${systemPoints.toLocaleString()} pts`} />
        <Row
          label="Vibe 公司 statement"
          value={companyPoints != null ? `${Number(companyPoints).toLocaleString()} pts` : '还没录入'}
        />
        <Row
          label="差异"
          value={diff == null ? '—' : diff === 0 ? '✓ 完全一致' : `${diff > 0 ? '+' : ''}${diff.toLocaleString()} pts`}
          highlight={diff === 0 ? 'good' : diff != null && diff !== 0 ? 'bad' : undefined}
        />
        <Row label="你的 2% 应得" value={`RM${systemProfit.toLocaleString()}`} highlight="gold" last />

        <div className="mt-4 flex items-center gap-3">
          <form action={markReconciled}>
            <input type="hidden" name="month" value={month} />
            <button
              type="submit"
              disabled={!statement}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              标记已对账 ✓
            </button>
          </form>
          {statement?.reconciled && (
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400">
              本月已对账
            </span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-3.5 text-sm font-bold text-zinc-50">录入 Vibe statement</h3>
        <form action={saveStatement} className="flex flex-col gap-3.5">
          <input type="hidden" name="month" value={month} />
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Vibe total top-up (pts)</label>
            <input
              name="company_total_points"
              type="number"
              step="0.01"
              defaultValue={companyPoints ?? ''}
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Vibe 给的盈利数字 (RM)</label>
            <input
              name="company_profit_rm"
              type="number"
              step="0.01"
              defaultValue={statement?.company_profit_rm ?? ''}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">备注</label>
            <input
              name="note"
              type="text"
              defaultValue={statement?.note ?? ''}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
          >
            保存并比对
          </button>
        </form>
        <p className="mt-4 rounded-lg bg-zinc-800/60 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-400">
          Vibe 每月给一个总数，系统自动跟 verified 记录比对，对不上马上看得出。
        </p>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  highlight,
  last,
}: {
  label: string
  value: string
  highlight?: 'good' | 'bad' | 'gold'
  last?: boolean
}) {
  const color =
    highlight === 'good'
      ? 'text-emerald-400'
      : highlight === 'bad'
        ? 'text-red-400'
        : highlight === 'gold'
          ? 'text-amber-300'
          : 'text-zinc-100'
  return (
    <div className={`flex items-center justify-between py-2.5 ${last ? '' : 'border-b border-dashed border-zinc-800'}`}>
      <span className="text-zinc-400">{label}</span>
      <b className={color}>{value}</b>
    </div>
  )
}
