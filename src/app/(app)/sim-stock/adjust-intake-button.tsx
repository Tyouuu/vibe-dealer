'use client'

import { useState, useTransition } from 'react'
import { adjustSimStockIntake } from './actions'
import { Modal } from '../modal'

// Same shape as purchases/adjust-purchase-button.tsx — a stock intake has no
// pending/verified lifecycle either, so this is its only correction path.
// Quantity only: cost_per_unit_rm is copied from the original row server-side
// (see adjustSimStockIntake), the same way a transaction correction carries
// the original's own rate rather than asking for it again.
export function AdjustIntakeButton({ intakeId, currentQuantity }: { intakeId: string; currentQuantity: number }) {
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState(String(currentQuantity))
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const quantityNum = Number(quantity) || 0
  const unchanged = quantityNum === currentQuantity
  const delta = Math.round(quantityNum - currentQuantity)

  function close() {
    setOpen(false)
    setQuantity(String(currentQuantity))
    setReason('')
  }

  function submit() {
    const fd = new FormData()
    fd.set('original_id', intakeId)
    fd.set('new_quantity', quantity)
    fd.set('reason', reason)
    startTransition(() => {
      adjustSimStockIntake(fd)
    })
  }

  return (
    <>
      <button type="button" className="btn-ghost px-2.5 py-1 text-[12px]" onClick={() => setOpen(true)}>
        Adjust
      </button>
      <Modal open={open} onClose={close} className="max-w-md">
        <p className="text-sm font-semibold text-paper">Correct this stock intake</p>
        <p className="mt-1 text-xs text-paper-dim">
          Currently on record: {currentQuantity.toLocaleString()} cards. This posts a new, linked correction — the
          original row stays untouched.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label>
            <span className="field-label">Correct quantity</span>
            <input
              type="number"
              step="1"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="field-input"
            />
          </label>

          {!unchanged && (
            <div className="rounded-lg bg-primary-soft px-3 py-2 text-xs font-semibold text-primary-deep">
              Posts a correction of {delta >= 0 ? '+' : ''}
              {delta.toLocaleString()} cards
            </div>
          )}

          <label>
            <span className="field-label">
              Why is this being corrected?<span className="req"> *</span>
            </span>
            <textarea
              required
              rows={2}
              placeholder="e.g. box counted as 500 but the invoice was for 250"
              className="field-input resize-none"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>

          <div className="flex items-center gap-2">
            <button type="button" onClick={close} className="btn-ghost flex-1">
              Cancel
            </button>
            <button type="button" disabled={!reason.trim() || unchanged || pending} onClick={submit} className="btn-primary flex-1">
              {pending ? 'Saving…' : 'Save Correction'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
