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

  // An event, not a table row.
  //
  // The table forced every event into eight columns sized for the fullest
  // kind. Most events are not that kind: on a typical screen seven of
  // thirteen rows had an em-dash in Amount, an em-dash in Points and nothing
  // at all in Status — three empty cells each, printed only because the grid
  // demanded a value. A log is a sequence of things that happened, and the
  // facts each one carries differ; a list of facts can simply omit what does
  // not apply, which a column cannot.
  //
  // So each event is a sentence with its values inline, on a rail. Absent
  // values leave no trace instead of leaving a dash.
  const facts: React.ReactNode[] = []
  if (row.dealer) facts.push(row.dealer)
  if (row.packageChange) {
    facts.push(
      <span key="pkg" className="inline-flex items-center gap-1.5">
        <PackagePill code={row.packageChange.before} />
        <span className="text-paper-dim">&rarr;</span>
        <PackagePill code={row.packageChange.after} />
      </span>,
    )
  }
  if (!row.packageChange && row.amount) facts.push(<span key="amt" className="figure-money">{row.amount}</span>)
  if (!row.packageChange && row.points) facts.push(<span key="pts" className="figure">{row.points}</span>)

  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className="absolute -left-[25px] top-[19px] grid h-[13px] w-[13px] place-items-center rounded-full border-2 border-ink-800 bg-ink-900"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            row.status === 'flagged' ? 'bg-clay' : row.status === 'pending' ? 'bg-brass' : row.status === 'verified' ? 'bg-jade' : 'bg-slate'
          }`}
        />
      </span>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-ink-850"
      >
        <span className="figure shrink-0 text-[12px] text-paper-dim">{row.time}</span>
        <span className="text-[13px] font-semibold text-paper">{row.actor}</span>
        <span className="text-[13px] text-paper-dim">{row.event.toLowerCase()}</span>
        {facts.length > 0 && (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-paper">
            <span className="text-paper-dim">&middot;</span>
            {facts.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-2">
                {i > 0 && <span className="text-paper-dim">&middot;</span>}
                {f}
              </span>
            ))}
          </span>
        )}
        {row.status && (
          <span className="ml-auto shrink-0">
            <StatusDot
              color={row.status === 'verified' ? 'jade-bright' : row.status === 'flagged' ? 'clay-bright' : 'brass-bright'}
              label={row.status === 'verified' ? 'Verified' : row.status === 'flagged' ? 'Flagged' : 'Pending'}
            />
          </span>
        )}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 shrink-0 text-paper-dim transition-transform ${open ? 'rotate-90' : ''} ${row.status ? '' : 'ml-auto'}`}
          aria-hidden="true"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>

      {open && (
        <dl className="mx-2 mb-3 grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl border border-ink-800 bg-ink-850 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {row.detail.map((d) => (
            <div key={d.label}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-paper-dim">{d.label}</dt>
              <dd className="mt-1 text-[13px] font-semibold text-paper">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}
