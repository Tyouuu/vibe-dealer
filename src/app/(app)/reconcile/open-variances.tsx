'use client'

import { useState } from 'react'
import { resolveVariance } from './actions'
import { formatMonthLabel } from '@/lib/month'

export type OpenVariance = {
  id: string
  month: string
  gap_points: number
  reason: string
  openedByName: string
  createdAt: string
  daysOpen: number
}

// Every month that closed over a gap and has not been answered since.
//
// markReconciled has always refused to close a mismatched month without a
// typed reason, and that reason went into the revisions log as prose. It
// recorded who accepted the gap; it could not answer the question that
// actually costs money — which gaps are still open, how much they come to,
// and whether Vibe ever came back on them. Three months on, "we queried the
// 3,700 pts" was a sentence you had to go looking for.
//
// Deliberately not scoped to the month on screen. An open variance is
// outstanding work wherever you happen to be standing, and the whole failure
// this addresses is one going quiet.
export function OpenVariances({ items, month }: { items: OpenVariance[]; month: string }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (!items.length) return null

  const total = items.reduce((s, v) => s + Math.abs(Number(v.gap_points)), 0)
  const oldest = Math.max(...items.map((v) => v.daysOpen))

  return (
    <div className="page-band">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-paper">
          {items.length} unresolved {items.length === 1 ? 'variance' : 'variances'}
        </h2>
        <span className="text-[12px] text-paper-dim">
          {total.toLocaleString()} pts in total{oldest > 0 && ` · oldest opened ${oldest} day${oldest === 1 ? '' : 's'} ago`}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-paper-dim">
        Months closed with a gap against Vibe&apos;s statement. Each stays here until someone records what came of it.
      </p>

      <ul className="mt-4 flex flex-col">
        {items.map((v) => {
          const gap = Number(v.gap_points)
          const open = openId === v.id
          return (
            <li key={v.id} className="border-t border-ink-800 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <span className="text-[13px] font-semibold text-paper">{formatMonthLabel(v.month.slice(0, 7))}</span>
                  <span className="ml-2 figure-points text-[13px] font-semibold text-clay-bright">
                    {gap > 0 ? '+' : ''}
                    {gap.toLocaleString()} pts
                  </span>
                  {/* Whose gap it is: ours if we recorded more than they did. */}
                  <span className="ml-2 text-[12px] text-paper-dim">
                    {gap > 0 ? 'we recorded more than Vibe' : 'Vibe recorded more than us'}
                  </span>
                </div>
                <button type="button" onClick={() => setOpenId(open ? null : v.id)} className="btn-ghost py-1 text-xs">
                  {open ? 'Cancel' : 'Record outcome'}
                </button>
              </div>
              <p className="mt-1 text-[12px] text-paper-dim">
                {v.reason} — {v.openedByName}, {v.daysOpen === 0 ? 'today' : `${v.daysOpen} day${v.daysOpen === 1 ? '' : 's'} ago`}
              </p>

              {open && (
                <form action={resolveVariance} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={v.id} />
                  {/* The page reloads onto whichever month is on screen, not
                      the variance's own — you resolve these from wherever you
                      are and should stay there. */}
                  <input type="hidden" name="month" value={month} />
                  <div className="min-w-[240px] flex-1">
                    <label htmlFor={`res-${v.id}`} className="field-label">
                      What came of it<span className="req"> *</span>
                    </label>
                    <input
                      id={`res-${v.id}`}
                      name="resolution"
                      required
                      className="field-input"
                      placeholder="e.g. Vibe confirmed 3,700 pts was a July top-up posted in August"
                    />
                  </div>
                  <button type="submit" className="btn-primary py-2">
                    Mark resolved
                  </button>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
