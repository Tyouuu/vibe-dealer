'use client'

import { useState, useTransition } from 'react'
import { adjustTransaction } from './actions'
import { computeAdjustmentDelta } from '@/lib/adjustment'
import { Modal } from '../modal'

export function AdjustButton({
  transactionId,
  currentPoints,
  currentMoneyRm,
  rate,
}: {
  transactionId: string
  currentPoints: number
  currentMoneyRm: number
  rate: number | null
}) {
  const [open, setOpen] = useState(false)
  const [points, setPoints] = useState(String(currentPoints))
  const [moneyRm, setMoneyRm] = useState(String(currentMoneyRm))
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const pointsNum = Number(points) || 0
  const moneyNum = Number(moneyRm) || 0
  const unchanged = pointsNum === currentPoints && moneyNum === currentMoneyRm
  const { deltaPoints, deltaMoneyRm } = computeAdjustmentDelta(
    { points: currentPoints, money_rm: currentMoneyRm },
    { points: pointsNum, money_rm: moneyNum }
  )

  // Informational only, never blocking — a correction exists precisely for
  // the cases a normal top-up's auto-calc can't cover (partial refund,
  // rounding the dealer and CS agreed to on the spot, etc.), so this can't
  // be a hard rule the way it is on New Transaction. It's here so whoever's
  // reviewing this later (see verifyTransaction's separate-approver rule)
  // can see at a glance whether the numbers line up with the dealer's rate
  // or diverge for a reason the note field should explain.
  const expectedMoneyAtRate = rate != null ? Math.round(pointsNum * (1 - rate / 100) * 100) / 100 : null
  const rateMismatch = expectedMoneyAtRate != null && Math.abs(expectedMoneyAtRate - moneyNum) > 0.5

  function close() {
    setOpen(false)
    setPoints(String(currentPoints))
    setMoneyRm(String(currentMoneyRm))
    setReason('')
  }

  function submit() {
    const fd = new FormData()
    fd.set('original_id', transactionId)
    fd.set('new_points', points)
    fd.set('new_money_rm', moneyRm)
    fd.set('reason', reason)
    startTransition(() => {
      adjustTransaction(fd)
    })
  }

  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        Adjust
      </button>
      <Modal open={open} onClose={close} className="max-w-md">
        <p className="text-sm font-bold text-paper">Correct this transaction</p>
        <p className="mt-1 text-xs text-paper-dim">
          Currently on record: {currentPoints.toLocaleString()} pts · RM {currentMoneyRm.toLocaleString()}. This posts a new, linked
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
              {deltaPoints.toLocaleString()} pts · {deltaMoneyRm >= 0 ? '+' : ''}RM {deltaMoneyRm.toLocaleString()}
            </div>
          )}

          {rateMismatch && (
            <div className="rounded-lg bg-brass/12 px-3 py-2 text-xs font-semibold text-brass-bright">
              Heads up: at this dealer&apos;s {rate}% rate, {pointsNum.toLocaleString()} pts would normally collect RM{' '}
              {expectedMoneyAtRate!.toLocaleString()} — you entered RM {moneyNum.toLocaleString()}. Fine if that&apos;s the actual
              reason for the correction, just make sure the note below says why.
            </div>
          )}

          <label>
            <span className="field-label">
              Why is this being corrected?<span className="req"> *</span>
            </span>
            <textarea
              required
              rows={2}
              placeholder="e.g. dealer paid RM56 more by bank transfer, receipt attached to the original entry"
              className="field-input resize-none"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>

          <p className="text-[11px] text-paper-dim">
            Still needs to be verified before it counts toward reports — by a different accountant or master, not you.
          </p>

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
