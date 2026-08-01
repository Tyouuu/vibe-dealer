'use client'

import { useState } from 'react'
import { type PackageCode } from '@/lib/packages'

export type AuditRowData = {
  id: string
  time: string
  actor: string
  event: string
  dealer: string | null
  amount: string
  points: string | null
  packageChange: { before: PackageCode | null; after: PackageCode | null } | null
  status: 'verified' | 'flagged' | 'pending' | null
  detail: { label: string; value: string }[]
}

// One event, on two lines.
//
// Third shape for this row, and the previous two failed the same way. Eight
// table columns sized for the fullest kind of event made most events print
// em-dashes in three of them. Collapsing that to one line of middot-separated
// fragments — bold name, grey verb, dark object, mono figures — was worse:
// four type treatments on one baseline and no alignment at all.
//
// The problem in both was cramming. Two lines solves it: a plain sentence
// anyone can read, then everything that is metadata on a quiet second line.
// Nothing competes for the same baseline, so no chips, no arrows and no mono
// are needed inside the sentence.
//
// The package sentence follows the standard audit-log distinction between
// Insert and Update. "Not set -> B" is not an update, it is an insert, and
// rendering it with a from/to arrow announced "there was nothing before" on
// every row of a seven-row burst. The verb carries it instead: "joined" means
// there was no package, "moved to" means there was, and only the second kind
// mentions the old value at all.
function sentence(row: AuditRowData) {
  const who = row.dealer ?? 'This account'
  if (row.packageChange) {
    const { before, after } = row.packageChange
    const to = after ? `Package ${after}` : 'no package'
    return before ? `${who} moved to ${to}` : `${who} joined ${to}`
  }
  return row.dealer ? `${row.event} · ${row.dealer}` : row.event
}

// The quiet second line: only the particulars this event actually has.
function particulars(row: AuditRowData) {
  const bits: string[] = []
  if (row.packageChange) {
    bits.push(row.packageChange.before ? `Was Package ${row.packageChange.before}` : 'First package')
  } else {
    if (row.amount) bits.push(row.amount)
    if (row.points) bits.push(row.points)
  }
  if (row.status) bits.push(row.status === 'verified' ? 'Verified' : row.status === 'flagged' ? 'Flagged' : 'Pending')
  return bits
}

const DOT: Record<string, string> = { verified: 'bg-jade', flagged: 'bg-clay', pending: 'bg-brass' }

export function AuditRow({ row }: { row: AuditRowData }) {
  const [open, setOpen] = useState(false)
  const bits = particulars(row)

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-ink-850"
      >
        {/* A package move gets brass because it can change what the dealer
            earns; a first assignment cannot, so it stays neutral. */}
        <span
          aria-hidden="true"
          className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${
            row.packageChange ? (row.packageChange.before ? 'bg-brass' : 'bg-slate') : (row.status && DOT[row.status]) || 'bg-slate'
          }`}
        />
        <span className="min-w-0 flex-1">
          {/* block, not inline. As two inline spans these ran together and the
              sentence collided with its own particulars. */}
          <span className="block text-[13px] font-semibold leading-snug text-paper">{sentence(row)}</span>
          {bits.length > 0 && <span className="mt-0.5 block truncate text-[12px] text-paper-dim">{bits.join(' · ')}</span>}
        </span>
        <span className="figure mt-px shrink-0 text-[12px] text-paper-dim">{row.time}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`mt-[3px] h-3.5 w-3.5 shrink-0 text-paper-dim transition-transform ${open ? 'rotate-90' : ''}`}
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
