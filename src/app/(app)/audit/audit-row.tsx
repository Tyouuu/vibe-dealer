'use client'

import { useState } from 'react'
import { type PackageCode } from '@/lib/packages'
import { StatusDot } from '../status-dot'

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

// A compact variant of the standard chip, used only inside an audit row.
//
// The standard .pill is 24px tall (py-[3px] + a 12px line box + border). A
// plain text cell in this table is 21px, so a row containing a chip came out
// 46px against 41px for every other row. Measured before and after: two
// distinct row heights, then one. h-[18px] with leading-none keeps the chip
// inside the text line box, so the chip costs the row nothing.
function PackagePill({ code }: { code: PackageCode | null }) {
  const base = 'inline-flex h-[18px] items-center gap-1 rounded border px-1.5 text-[11px] font-medium leading-none'
  if (!code) return <span className={`${base} border-ink-800 bg-ink-900 text-paper-dim`}>Not set</span>
  return <span className={`${base} border-ink-800 bg-ink-900 text-paper`}>{code}</span>
}

export function AuditRow({ row }: { row: AuditRowData }) {
  const [open, setOpen] = useState(false)

  // Every cell on this row is single-line, and that is the whole point.
  //
  // Rows used to come in two heights: 67px for a transaction, 79px for a
  // package change, measured on the live page. Two cells were responsible.
  // The Event cell put the package change on a second line under the event
  // name, and the Amount cell stacked money over points. So half the rows
  // were one line tall and half were two, and a table whose row pitch keeps
  // changing reads as untidy however well the individual cells are styled.
  //
  // Money and points are now separate columns — they are different units and
  // a table already has a mechanism for that — and the package change sits
  // inline after the event name.
  return (
    <>
      <tr className="tr-row cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <td className="td whitespace-nowrap figure text-paper-dim">{row.time}</td>
        <td className="td truncate whitespace-nowrap font-semibold text-paper">{row.actor}</td>
        <td className="td">
          <div className="flex items-center gap-2 whitespace-nowrap text-paper">
            {row.event}
            {row.packageChange && (
              <span className="flex items-center gap-1.5">
                <PackagePill code={row.packageChange.before} />
                <span className="text-paper-dim">&rarr;</span>
                <PackagePill code={row.packageChange.after} />
              </span>
            )}
          </div>
        </td>
        <td className="td truncate text-paper-dim">{row.dealer ?? '—'}</td>
        <td className="td figure-money whitespace-nowrap text-right">
          {row.packageChange ? <span className="text-paper-dim/50">&mdash;</span> : row.amount}
        </td>
        <td className="td figure whitespace-nowrap text-right text-paper-dim">
          {row.packageChange || !row.points ? <span className="text-paper-dim/50">&mdash;</span> : row.points}
        </td>
        <td className="td">
          {row.status && (
            <StatusDot
              color={row.status === 'verified' ? 'jade-bright' : row.status === 'flagged' ? 'clay-bright' : 'brass-bright'}
              label={row.status === 'verified' ? 'Verified' : row.status === 'flagged' ? 'Flagged' : 'Pending'}
            />
          )}
        </td>
        <td className="td text-right text-paper-dim">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`inline-block h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-ink-800 bg-ink-850/60">
          <td colSpan={8} className="px-4 py-3.5">
            {/* A fixed grid (not flex-wrap) so every label starts at the same
                x position instead of a ragged layout driven by each value's
                own text length — that raggedness plus the tight gap-2.5 is
                what actually read as "cramped", not the amount of detail
                itself. The bordered card gives the block its own visual
                boundary instead of floating loose in the dark row strip. */}
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl border border-ink-800 bg-ink-900/60 p-4 sm:grid-cols-3 lg:grid-cols-4">
              {row.detail.map((d) => (
                <div key={d.label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-paper-dim">{d.label}</dt>
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
