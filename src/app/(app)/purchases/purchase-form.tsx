'use client'

import { useState } from 'react'
import { recordCreditPurchase } from './actions'
import { CREDIT_PURCHASE_RATE } from '@/lib/packages'
import { DatePicker } from '../date-picker'
import { Modal } from '../modal'

export function PurchaseForm({ today }: { today: string }) {
  const [moneyRm, setMoneyRm] = useState('')
  // Suggested from the money paid, at the one rate this has ever used (see
  // packages.ts) — still editable for the rare case Vibe actually charged
  // something else for this particular batch.
  const [pointsOverride, setPointsOverride] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const suggestedPoints = Math.round((Number(moneyRm) || 0) / (1 - CREDIT_PURCHASE_RATE))
  const points = pointsOverride ? Number(pointsOverride) : suggestedPoints

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set('points', String(points))
    setPendingFormData(formData)
    setConfirmOpen(true)
  }

  function doSubmit() {
    if (!pendingFormData) return
    setConfirmOpen(false)
    setSubmitting(true)
    recordCreditPurchase(pendingFormData)
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div>
          <label className="field-label">Date</label>
          <DatePicker name="purchase_date" max={today} todayIso={today} required />
        </div>
        <div>
          <label className="field-label">Amount Paid (RM)</label>
          <input
            name="money_rm"
            type="number"
            step="0.01"
            min="0"
            required
            value={moneyRm}
            onChange={(e) => setMoneyRm(e.target.value)}
            className="field-input"
          />
        </div>
        <div>
          <label className="field-label">Points/Credit Received</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            value={pointsOverride}
            onChange={(e) => setPointsOverride(e.target.value)}
            placeholder={moneyRm ? String(suggestedPoints) : 'Auto-calculated from amount paid, editable'}
            className="field-input"
          />
          <span className="hint">Auto-calculated at the usual rate — editable if Vibe charged something else this time.</span>
        </div>
        <div>
          <label className="field-label">Note (optional)</label>
          <input name="note" type="text" className="field-input" />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-60">
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </form>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <p className="text-sm font-bold text-paper">Confirm this purchase</p>
        <div className="mt-3 flex flex-col text-sm">
          <div className="docket-row">
            <span className="text-paper-dim">Amount Paid</span>
            <b className="figure-money text-paper">RM {(Number(moneyRm) || 0).toLocaleString()}</b>
          </div>
          <div className="docket-row">
            <span className="text-paper-dim">Points Received</span>
            <b className="figure-points text-paper">{points.toLocaleString()}</b>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => setConfirmOpen(false)} className="btn-ghost flex-1">
            Back
          </button>
          <button type="button" onClick={doSubmit} disabled={submitting} className="btn-primary flex-1">
            {submitting ? 'Saving…' : 'Confirm & Save'}
          </button>
        </div>
      </Modal>
    </>
  )
}
