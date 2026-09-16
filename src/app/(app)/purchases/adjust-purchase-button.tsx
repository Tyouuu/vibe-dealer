'use client'

import { useState, useTransition } from 'react'
import { adjustCreditPurchase } from './actions'
import { Modal } from '../modal'
import { formatMYR } from '@/lib/money'

// Same shape as records/adjust-button.tsx (Transactions' correction modal) —
// a credit purchase has no pending/verified lifecycle to flag instead, so
// this is its only correction path, and it works the same way: post a new,
// linked delta rather than touching the original.
export function AdjustPurchaseButton({
  purchaseId,
  currentPoints,
  currentMoneyRm,
}: {
  purchaseId: string
  currentPoints: number
  currentMoneyRm: number
}) {
  const [open, setOpen] = useState(false)
  const [points, setPoints] = useState(String(currentPoints))
  const [moneyRm, setMoneyRm] = useState(String(currentMoneyRm))
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const pointsNum = Number(points) || 0
  const moneyNum = Number(moneyRm) || 0
  const unchanged = pointsNum === currentPoints && moneyNum === currentMoneyRm
  const deltaPoints = Math.round((pointsNum - currentPoints) * 100) / 100
  const deltaMoneyRm = Math.round((moneyNum - currentMoneyRm) * 100) / 100

  function close() {
    setOpen(false)
    setPoints(String(currentPoints))
    setMoneyRm(String(currentMoneyRm))
    setReason('')
  }

  function submit() {
    const fd = new FormData()
    fd.set('original_id', purchaseId)
    fd.set('new_points', points)
    fd.set('new_money_rm', moneyRm)
    fd.set('reason', reason)
    startTransition(() => {
      adjustCreditPurchase(fd)
    })
  }

  return (
    <>
      <button type="button" className="btn-ghost px-2.5 py-1 text-[12px]" onClick={() => setOpen(true)}>
        Adjust
      </button>
      <Modal open={open} onClose={close} className="max-w-md">
        <p className="text-sm font-semibold text-paper">Correct this purchase</p>
        <p className="mt-1 text-xs text-paper-dim">
          Currently on record: {currentPoints.toLocaleString()} pts · {formatMYR(currentMoneyRm)}. This posts a new, linked
          correction — the original row stays untouched.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex gap-3">
            <label className="flex-1">
              <span className="field-label">Correct points</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                className="field-input"
              />
            </label>
            <label className="flex-1">
              <span className="field-label">Correct RM</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={moneyRm}
                onChange={(e) => setMoneyRm(e.target.value)}
                className="field-input"
              />
            </label>
          </div>

          {!unchanged && (
            <div className="rounded-lg bg-primary-soft px-3 py-2 text-xs font-semibold text-primary-deep">
              Posts a correction of {deltaPoints >= 0 ? '+' : ''}
              {deltaPoints.toLocaleString()} pts · {deltaMoneyRm >= 0 ? '+' : ''}{formatMYR(deltaMoneyRm)}
            </div>
          )}

          <label>
            <span className="field-label">
              Why is this being corrected?<span className="req"> *</span>
            </span>
            <textarea
              required
              rows={2}
              placeholder="e.g. entered 400,000 pts instead of 40,000 — invoice attached to the original entry"
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
