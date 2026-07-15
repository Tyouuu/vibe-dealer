'use client'

import { useMemo, useState } from 'react'
import { IconSearch } from '../icons'

export type RecentTxRow = {
  id: string
  tx_date: string
  type: 'package' | 'topup'
  package: string | null
  points: number
  money_rm: number
  status: 'pending' | 'verified' | 'flagged'
  dealerName: string
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
            {filtered.map((tx) => (
              <tr key={tx.id} className="tr-row">
                <td className="td text-paper-dim">{tx.tx_date}</td>
                <td className="td font-semibold text-paper">{tx.dealerName}</td>
                <td className="td text-paper-dim">{tx.type === 'package' ? `Package ${tx.package ?? '—'}` : 'Top-up'}</td>
                <td className="td figure-points text-right">{tx.points.toLocaleString()}</td>
                <td className="td">
                  <span
                    className={
                      tx.status === 'verified' ? 'pill pill-jade' : tx.status === 'flagged' ? 'pill pill-clay' : 'pill pill-brass'
                    }
                  >
                    {tx.status === 'verified' ? 'Verified' : tx.status === 'flagged' ? 'Flagged' : 'Pending'}
                  </span>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-paper-dim">
                  {rows.length ? 'No transactions match that dealer name.' : 'No transactions recorded yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
