'use client'

import { useState } from 'react'

export type AuditRowData = {
  id: string
  time: string
  actor: string
  event: string
  dealer: string | null
  amount: string
  status: 'verified' | 'flagged' | 'pending' | null
  detail: { label: string; value: string }[]
}

export function AuditRow({ row }: { row: AuditRowData }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <tr className="tr-row cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <td className="td whitespace-nowrap text-paper-dim">{row.time}</td>
        <td className="td whitespace-nowrap font-semibold text-paper">{row.actor}</td>
        <td className="td text-paper">{row.event}</td>
        <td className="td text-paper-dim">{row.dealer ?? '—'}</td>
        <td className="td text-right font-semibold text-paper">{row.amount}</td>
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
          <td colSpan={7} className="px-4 py-3">
            <div className="flex flex-wrap gap-x-7 gap-y-2.5">
              {row.detail.map((d) => (
                <div key={d.label} className="min-w-[100px]">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-paper-dim">{d.label}</div>
                  <div className="text-[12.5px] font-semibold text-paper">{d.value}</div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
