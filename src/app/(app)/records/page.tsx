import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { verifyTransaction } from './actions'

export const metadata: Metadata = {
  title: '交易记录 — DealerHub',
}

type TxRow = {
  id: string
  tx_date: string
  type: 'package' | 'topup'
  package: string | null
  points: number
  money_rm: number
  rate: number | null
  commission_rm: number
  sim_type: string | null
  delivery_status: string
  status: 'pending' | 'verified' | 'flagged'
  dealers: { company_name: string } | { company_name: string }[] | null
}

const DELIVERY_LABEL: Record<string, string> = {
  na: '—',
  pending: '待送',
  sent: '已送',
}

type PageProps = {
  searchParams: Promise<{ status?: string; submitted?: string }>
}

export default async function RecordsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { status = 'all', submitted } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        你的角色（{user.role}）没有查看交易记录的权限。
      </div>
    )
  }

  const supabase = await createClient()
  let query = supabase
    .from('transactions')
    .select(
      'id, tx_date, type, package, points, money_rm, rate, commission_rm, sim_type, delivery_status, status, dealers(company_name)',
      { count: 'exact' }
    )
    .order('tx_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: rows, count } = await query

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      {submitted && (
        <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/50 px-3.5 py-2.5 text-sm text-emerald-300">
          已录入！状态 = 待核对，核对后计入对账与报表。
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold text-zinc-50">交易记录</h1>
        <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
          共 {count ?? 0} 笔
        </span>
      </div>

      <form className="mb-4 flex gap-3" action="/records" method="GET">
        <select
          name="status"
          defaultValue={status}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500"
        >
          <option value="all">全部状态</option>
          <option value="pending">待核对</option>
          <option value="verified">已核对</option>
          <option value="flagged">已标记</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
        >
          筛选
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2.5">日期</th>
              <th className="px-3 py-2.5">Dealer</th>
              <th className="px-3 py-2.5">类型</th>
              <th className="px-3 py-2.5">In 钱 (RM)</th>
              <th className="px-3 py-2.5">Out (pts)</th>
              <th className="px-3 py-2.5">Rate</th>
              <th className="px-3 py-2.5">你的 2%</th>
              <th className="px-3 py-2.5">配送</th>
              <th className="px-3 py-2.5">状态</th>
              <th className="px-3 py-2.5">操作</th>
            </tr>
          </thead>
          <tbody>
            {(rows as unknown as TxRow[] | null)?.map((tx) => {
              const dealerName = Array.isArray(tx.dealers) ? tx.dealers[0]?.company_name : tx.dealers?.company_name
              return (
                <tr key={tx.id} className="border-b border-zinc-800 last:border-none hover:bg-zinc-800/50">
                  <td className="px-3 py-2.5 text-zinc-400">{tx.tx_date}</td>
                  <td className="px-3 py-2.5 font-semibold text-zinc-100">{dealerName ?? '—'}</td>
                  <td className="px-3 py-2.5 text-zinc-300">
                    {tx.type === 'package' ? `套餐 ${tx.package}` : 'Top-up'}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-300">RM{tx.money_rm.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-zinc-300">{tx.points.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-zinc-300">{tx.rate != null ? `${tx.rate}%` : '—'}</td>
                  <td className="px-3 py-2.5 font-semibold text-amber-300">RM{tx.commission_rm.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-zinc-400">{DELIVERY_LABEL[tx.delivery_status] ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={
                        tx.status === 'verified'
                          ? 'rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400'
                          : tx.status === 'flagged'
                            ? 'rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-bold text-red-400'
                            : 'rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-300'
                      }
                    >
                      {tx.status === 'verified' ? '已核对' : tx.status === 'flagged' ? '已标记' : '待核对'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {tx.status === 'pending' ? (
                      <form action={verifyTransaction}>
                        <input type="hidden" name="id" value={tx.id} />
                        <button
                          type="submit"
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                          核对 ✓
                        </button>
                      </form>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {!rows?.length && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-zinc-500">
                  没有符合条件的交易记录。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
