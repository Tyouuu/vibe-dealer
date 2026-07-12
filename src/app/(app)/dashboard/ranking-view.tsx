'use client'

import { useState } from 'react'

export type RankingItem = { name: string; points: number }

export function RankingView({ items }: { items: RankingItem[] }) {
  const [view, setView] = useState<'list' | 'bar'>('list')
  const maxPoints = Math.max(1, ...items.map((d) => d.points))

  return (
    <div>
      <div className="mb-3 flex gap-1.5">
        <button
          onClick={() => setView('list')}
          className={`rounded px-2.5 py-1 text-[11px] font-semibold ${view === 'list' ? 'bg-ink-700 text-paper' : 'text-paper-dim hover:text-paper'}`}
        >
          List
        </button>
        <button
          onClick={() => setView('bar')}
          className={`rounded px-2.5 py-1 text-[11px] font-semibold ${view === 'bar' ? 'bg-ink-700 text-paper' : 'text-paper-dim hover:text-paper'}`}
        >
          Bar
        </button>
      </div>

      {view === 'list' ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="th">#</th>
              <th className="th">Dealer</th>
              <th className="th text-right">This Month&apos;s Top-up</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d, i) => (
              <tr key={d.name + i} className="tr-row">
                <td className="td">
                  <span className={`grid h-6 w-6 place-items-center rounded text-xs font-extrabold ${i < 3 ? 'bg-brass/20 text-brass-bright' : 'bg-ink-800 text-paper-dim'}`}>
                    {i + 1}
                  </span>
                </td>
                <td className="td font-semibold text-paper">{d.name}</td>
                <td className="td figure-points text-right">{d.points.toLocaleString()} pts</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((d, i) => {
            const pct = Math.max(4, (d.points / maxPoints) * 100)
            return (
              <div key={d.name + i} className="flex items-center gap-2.5">
                <div className="w-28 shrink-0 truncate text-xs font-semibold text-paper" title={d.name}>
                  {d.name}
                </div>
                <div className="relative h-4 flex-1">
                  <div
                    className="h-full rounded-r bg-jade-bright transition-[width]"
                    style={{ width: `${pct}%`, borderRadius: '2px 4px 4px 2px' }}
                  />
                </div>
                <div className="figure-points w-16 shrink-0 text-right text-xs">{d.points.toLocaleString()}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
