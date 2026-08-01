'use client'

import { useState, useTransition } from 'react'
import { StatusDot } from '../status-dot'
import { markDelivered, bulkMarkDelivered } from './actions'
import { ConfirmSubmitButton } from '../confirm-submit-button'
import { Modal } from '../modal'
import { ScrollFade } from '../scroll-fade'

export type DeliveryRow = {
  id: string
  tx_date: string
  company_name: string
  address: string | null
  package: string | null
  sim_type: 'physical' | 'esim' | null
  delivery_status: 'na' | 'pending' | 'sent'
  days: number
  warn: boolean
  urgent: boolean
}

export function DeliveryTable({ rows }: { rows: DeliveryRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const pendingRows = rows.filter((r) => r.delivery_status === 'pending')

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      const allSelected = pendingRows.every((r) => prev.has(r.id))
      const next = new Set(prev)
      if (allSelected) pendingRows.forEach((r) => next.delete(r.id))
      else pendingRows.forEach((r) => next.add(r.id))
      return next
    })
  }

  function runBulk() {
    setConfirmOpen(false)
    const ids = [...selected]
    startTransition(async () => {
      await bulkMarkDelivered(ids)
      setSelected(new Set())
    })
  }

  return (
    <div className="relative">
      <ScrollFade label="SIM delivery queue">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr>
              {pendingRows.length > 0 && (
                <th className="th w-8">
                  {/* -m-1.5 p-1.5 grows the tappable area to 28px around the
                      16px box without taking any extra layout space. Unlike
                      the checkboxes on Account Settings — which sit inside a
                      full-width <label> row and so are already easy to hit —
                      these are bare inputs in a table cell, where the 16px
                      box was the entire target. The empty <label> carries no
                      text, so the input's own aria-label stays its
                      accessible name. */}
                  <label className="-m-1.5 inline-flex cursor-pointer p-1.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={pendingRows.every((r) => selected.has(r.id))}
                      onChange={toggleAll}
                      aria-label="Select all pending"
                    />
                  </label>
                </th>
              )}
              <th className="th">Date</th>
              <th className="th">Dealer</th>
              <th className="th">Ship To</th>
              <th className="th">Package</th>
              <th className="th">SIM Type</th>
              <th className="th">Status</th>
              <th className="th">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={`tr-row ${row.urgent ? 'tr-urgent' : row.warn ? 'tr-warn' : ''}`}>
                {pendingRows.length > 0 && (
                  <td className="td">
                    {row.delivery_status === 'pending' && (
                      <label className="-m-1.5 inline-flex cursor-pointer p-1.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={selected.has(row.id)}
                          onChange={() => toggle(row.id)}
                          aria-label={`Select ${row.company_name}`}
                        />
                      </label>
                    )}
                  </td>
                )}
                <td className="td text-paper-dim">{row.tx_date}</td>
                <td className="td font-semibold text-paper">{row.company_name}</td>
                <td className="td max-w-[220px] truncate text-paper-dim" title={row.address ?? undefined}>
                  {row.address ?? '—'}
                </td>
                <td className="td text-paper-dim">{row.package ? `Package ${row.package}` : '—'}</td>
                <td className="td">
                  {row.sim_type === 'esim' ? (
                    <span className="pill pill-neutral">eSIM</span>
                  ) : (
                    <span className="pill pill-neutral">Physical SIM</span>
                  )}
                </td>
                <td className="td">
                  {row.delivery_status === 'sent' ? (
                    <StatusDot color="jade-bright" label="Sent" />
                  ) : row.delivery_status === 'pending' ? (
                    <StatusDot color={row.urgent ? 'clay-bright' : 'brass-bright'} label={row.warn ? `Pending · ${row.days}d` : 'Pending'} pulse />
                  ) : (
                    <StatusDot color="slate-bright" label="Instant" />
                  )}
                </td>
                <td className="td">
                  {row.delivery_status === 'pending' ? (
                    <form action={markDelivered}>
                      <input type="hidden" name="id" value={row.id} />
                      <ConfirmSubmitButton className="btn-jade" confirmMessage="Mark this SIM as sent? This cannot be undone.">
                        Mark as Sent
                      </ConfirmSubmitButton>
                    </form>
                  ) : (
                    <span className="text-paper-dim/50">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollFade>

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 mt-3 flex items-center gap-3 rounded-xl border border-primary bg-primary-soft px-4 py-3 shadow-2xl">
          <span className="text-sm font-semibold text-primary-deep">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" disabled={pending} onClick={() => setConfirmOpen(true)} className="btn-jade">
              Mark {selected.size} as Sent
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-semibold text-primary-deep/70 hover:text-primary-deep">
              Clear
            </button>
          </div>
        </div>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <p className="text-sm font-semibold text-paper">
          Mark {selected.size} SIM{selected.size === 1 ? '' : 's'} as sent? This cannot be undone.
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setConfirmOpen(false)} className="btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={runBulk} className="btn-jade">
            Confirm
          </button>
        </div>
      </Modal>
    </div>
  )
}
