'use client'

import { useState, useTransition } from 'react'
import { StatusDot } from '../status-dot'
import { markDelivered, bulkMarkDelivered } from './actions'
import { ConfirmSubmitButton } from '../confirm-submit-button'
import { Modal } from '../modal'
import { ScrollFade } from '../scroll-fade'
import { deliverySimLabel, deliveryWhat } from '@/lib/delivery-labels'

export type DeliveryRow = {
  id: string
  tx_date: string
  company_name: string
  address: string | null
  package: string | null
  sim_type: 'physical' | 'physical_no_number' | 'esim' | null
  /** A package sale, or a direct SIM card order (0052). Absent means a sale. */
  source?: 'sale' | 'order'
  quantity?: number | null
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
              <th className="th">Item</th>
              <th className="th">SIM Type</th>
              <th className="th">Status</th>
              {/* The age was jammed into Status as "Pending · 58d". Those two
                  answer different questions — one is the state, one is how
                  long it has been in that state — and the age is the one you
                  sort by and act on. Given its own right-aligned column the
                  numbers line up, so the worst row is found by scanning
                  straight down instead of reading every cell. */}
              <th className="th text-right">Waiting</th>
              {/* Right-aligned, like the Action column on Transactions and
                  like the last column of every table in the app. Left-aligned
                  it put the button in the middle of a 100px cell and left 51px
                  of blank between the row's last ink and the table's edge —
                  the "旁边的空位" complaint, measured by qa-probe-ink.mjs. */}
              <th className="th text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {/* No urgency stripe on the row any more. An overdue row used to
                carry a red left edge, a red dot and red text — three signals
                for one fact, which is what made two late rows read as an
                emergency. The Waiting cell says it once. */}
            {rows.map((row) => (
              <tr key={row.id} className="tr-row h-[51px]">
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
                <td className="td whitespace-nowrap text-paper-dim">{row.tx_date}</td>
                {/* One line, cut off with the full name on hover: a long name wrapping to two
                    lines made its row 30px taller than every other row in the queue. */}
                <td className="td max-w-[260px] truncate font-semibold text-paper" title={row.company_name}>
                  {row.company_name}
                </td>
                <td className="td max-w-[220px] truncate text-paper-dim" title={row.address ?? undefined}>
                  {row.address ?? '—'}
                </td>
                <td className="td whitespace-nowrap text-paper-dim">{deliveryWhat(row)}</td>
                <td className="td whitespace-nowrap">
                  <span className="pill pill-neutral">{deliverySimLabel(row)}</span>
                </td>
                {/* Status is the state and nothing else now, so pending is
                    always brass — the same treatment it has on every other
                    page. Lateness is the Waiting column's job. */}
                <td className="td">
                  {row.delivery_status === 'sent' ? (
                    <StatusDot color="jade-bright" label="Sent" />
                  ) : row.delivery_status === 'pending' ? (
                    <StatusDot color="brass-bright" label="Pending" pulse />
                  ) : (
                    <StatusDot color="slate-bright" label="Instant" />
                  )}
                </td>
                {/* The one place on the row that carries urgency: dim while
                    it is on time, brass once it is worth noticing, clay once
                    it is past the stalled mark. Saying it once is what lets
                    the colour still mean something. */}
                <td
                  className={`td whitespace-nowrap text-right ${
                    row.delivery_status !== 'pending'
                      ? 'text-paper-dim/50'
                      : row.urgent
                        ? 'font-semibold text-clay-bright'
                        : row.warn
                          ? 'font-semibold text-brass-bright'
                          : 'text-paper-dim'
                  }`}
                >
                  {/* .figure on the digits only. Applied to the whole cell
                      the mono space between "58" and "days" takes a full
                      character advance and the two read as separate words. */}
                  {row.delivery_status === 'pending' ? (
                    <>
                      <span className="figure">{row.days}</span> day{row.days === 1 ? '' : 's'}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="td text-right">
                  {row.delivery_status === 'pending' ? (
                    <form action={markDelivered}>
                      <input type="hidden" name="id" value={row.id} />
                      <ConfirmSubmitButton className="btn-jade" confirmMessage="Mark this SIM as sent? This cannot be undone.">
                        Mark as sent
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
