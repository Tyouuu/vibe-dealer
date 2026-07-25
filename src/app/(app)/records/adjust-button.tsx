'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { adjustTransaction } from './actions'

export function AdjustButton({
  transactionId,
  currentPoints,
  currentMoneyRm,
}: {
  transactionId: string
  currentPoints: number
  currentMoneyRm: number
}) {
  const [open, setOpen] = useState(false)
  const [points, setPoints] = useState(String(currentPoints))
  const [moneyRm, setMoneyRm] = useState(String(currentMoneyRm))
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const unchanged = Number(points) === currentPoints && Number(moneyRm) === currentMoneyRm

  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" className="btn-ghost" onClick={() => setOpen((o) => !o)}>
        Adjust
      </button>
      {open && (
        <div className="dropdown-panel w-80 p-3">
          <p className="mb-0.5 text-xs font-semibold text-paper">Correct this transaction</p>
          <p className="mb-2 text-[11px] text-paper-dim">
            Currently on record: {currentPoints.toLocaleString()} pts · RM {currentMoneyRm.toLocaleString()}. This posts a new, linked
            correction — the original row stays untouched.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              startTransition(() => {
                adjustTransaction(formData)
              })
            }}
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="original_id" value={transactionId} />
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="field-label">Correct points</span>
                <input
                  name="new_points"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  className="field-input"
                />
              </label>
              <label className="flex-1">
                <span className="field-label">Correct RM</span>
                <input
                  name="new_money_rm"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={moneyRm}
                  onChange={(e) => setMoneyRm(e.target.value)}
                  className="field-input"
                />
              </label>
            </div>
            <textarea
              name="reason"
              required
              rows={2}
              placeholder="Why is this being corrected?"
              className="field-input resize-none"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex items-center gap-1.5">
              <button type="submit" disabled={!reason.trim() || unchanged || pending} className="btn-primary flex-1">
                {pending ? 'Saving…' : 'Save Correction'}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-paper-dim">Still needs to be verified before it counts toward reports.</p>
          </form>
        </div>
      )}
    </div>
  )
}
