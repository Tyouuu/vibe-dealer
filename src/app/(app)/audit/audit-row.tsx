'use client'

import { useState } from 'react'
import { PACKAGE_PILL_CLASS, type PackageCode } from '@/lib/packages'

export type AuditRowData = {
  id: string
  time: string
  actor: string
  event: string
  dealer: string | null
  amount: string
  // Money and points are different units — kept separate so the cell can
  // show both stacked instead of picking one and hiding the other.
  points: string | null
  // A package assignment has no money or points value — rendered as
  // colored tier pills next to the event instead of falling back to
  // `amount`'s plain "Not set → B" text, which only ever existed to give
  // the Amount/Points column *something* to show and read like a broken
  // currency figure sitting in a numeric, right-aligned column.
  packageChange: { before: PackageCode | null; after: PackageCode | null } | null
  status: 'verified' | 'flagged' | 'pending' | null
  detail: { label: string; value: string }[]
}

function PackagePill({ code }: { code: PackageCode | null }) {
  if (!code) return <span className="pill pill-neutral">Not set</span>
  return <span className={`pill ${PACKAGE_PILL_CLASS[code]}`}>{code}</span>
}

export function AuditRow({ row }: { row: AuditRowData }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <tr className="tr-row cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <td className="td whitespace-nowrap text-paper-dim">{row.time}</td>
        <td className="td whitespace-nowrap font-semibold text-paper">{row.actor}</td>
        <td className="td text-paper">
          <div>{row.event}</div>
          {row.packageChange && (
            <div className="mt-1 flex items-center gap-1.5">
              <PackagePill code={row.packageChange.before} />
              <span className="text-paper-dim">→</span>
              <PackagePill code={row.packageChange.after} />
            </div>
          )}
        </td>
        <td className="td text-paper-dim">{row.dealer ?? '—'}</td>
        <td className="td text-right">
          {row.packageChange ? (
            <span className="text-paper-dim/50">—</span>
          ) : (
            <>
              <div className="font-semibold text-paper">{row.amount}</div>
              {row.points && <div className="mt-0.5 text-[11px] font-medium text-paper-dim">{row.points}</div>}
            </>
          )}
        </td>
        <td className="td">
          {row.status && (
            <span
              className={`pill ${row.status === 'verified' ? 'pill-jade' : row.status === 'flagged' ? 'pill-clay' : 'pill-brass'}`}
            >
              {row.status === 'verified' ? 'Verified' : row.status === 'flagged' ? 'Flagged' : 'Pending'}
            </span>
          )}
        </td>
        <td className="td w-4 text-paper-dim">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-ink-800 bg-ink-850/60">
          <td colSpan={7} className="px-4 py-3.5">
            {/* A fixed grid (not flex-wrap) so every label starts at the same
                x position instead of a ragged layout driven by each value's
                own text length — that raggedness plus the tight gap-2.5 is
                what actually read as "cramped", not the amount of detail
                itself. The bordered card gives the block its own visual
                boundary instead of floating loose in the dark row strip. */}
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl border border-ink-800 bg-ink-900/60 p-4 sm:grid-cols-3 lg:grid-cols-4">
              {row.detail.map((d) => (
                <div key={d.label}>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-paper-dim">{d.label}</dt>
                  <dd className="mt-1 text-[13px] font-semibold text-paper">{d.value}</dd>
                </div>
              ))}
            </dl>
          </td>
        </tr>
      )}
    </>
  )
}
