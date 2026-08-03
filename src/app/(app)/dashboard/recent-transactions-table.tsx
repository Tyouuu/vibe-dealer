'use client'

import { useMemo, useState } from 'react'
import { IconSearch } from '../icons'
import { Avatar } from '../avatar'
import { ScrollFade } from '../scroll-fade'
import { StatusDot } from '../status-dot'
import { formatMYR } from '@/lib/money'
import { formatDateLabel } from '@/lib/month'

export type RecentTxRow = {
  id: string
  tx_date: string
  type: 'package' | 'topup' | 'adjustment'
  package: string | null
  points: number
  money_rm: number
  status: 'pending' | 'verified' | 'flagged'
  dealerName: string
  dealerId: string | null
}

// Client-side filter only — this narrows the small already-fetched batch
// (10 rows) the server component passed in. It is not a substitute for the
// server-side search + Sort by on the full /records page.
export function RecentTransactionsTable({ rows }: { rows: RecentTxRow[] }) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => r.dealerName.toLowerCase().includes(needle))
  }, [rows, q])

  return (
    <div>
      <label className="mini-search mb-3.5 w-64 max-w-full transition-colors focus-within:border-primary">
        <IconSearch className="h-4 w-4 shrink-0" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by dealer name"
          className="w-full bg-transparent text-sm text-paper outline-none placeholder:text-paper-dim/70"
        />
      </label>

      <ScrollFade label="Recent transactions">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="th">Txn Id</th>
              <th className="th">Date</th>
              <th className="th">Dealer</th>
              <th className="th">Type</th>
              <th className="th">Status</th>
              <th className="th text-right">Points</th>
              <th className="th text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tx) => (
              <tr key={tx.id} className="tr-row relative">
                <td className="td figure text-paper-dim">#{tx.id.slice(0, 6).toUpperCase()}</td>
                <td className="td text-paper-dim">{formatDateLabel(tx.tx_date)}</td>
                <td className="td">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={tx.dealerName} size={24} />
                    {tx.dealerId ? (
                      <a
                        href={`/dealers/${tx.dealerId}`}
                        className="font-semibold text-paper after:absolute after:inset-0 after:content-[''] hover:text-jade-bright"
                      >
                        {tx.dealerName}
                      </a>
                    ) : (
                      <span className="font-semibold text-paper">{tx.dealerName}</span>
                    )}
                  </div>
                </td>
                <td className="td text-paper-dim">
                  {tx.type === 'package'
                    ? `Buy Package ${tx.package ?? '—'}`
                    : tx.type === 'adjustment'
                      ? 'Adjustment'
                      : 'Regular Top-up'}
                </td>
                <td className="td">
                  <StatusDot
                    color={tx.status === 'verified' ? 'jade-bright' : tx.status === 'flagged' ? 'clay-bright' : 'brass-bright'}
                    label={tx.status === 'verified' ? 'Verified' : tx.status === 'flagged' ? 'Flagged' : 'Pending'}
                    pulse={tx.status === 'pending'}
                  />
                </td>
                <td className="td figure-points text-right">{tx.points.toLocaleString()}</td>
                <td className="td figure-money text-right">{formatMYR(tx.money_rm)}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-paper-dim">
                  {rows.length ? 'No transactions match that dealer name.' : 'No transactions recorded yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollFade>
    </div>
  )
}
