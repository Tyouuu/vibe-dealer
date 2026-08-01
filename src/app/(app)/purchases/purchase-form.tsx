'use client'

import { useState } from 'react'
import { recordCreditPurchase } from './actions'
import { CREDIT_PURCHASE_RATE } from '@/lib/packages'
import { DatePicker } from '../date-picker'
import { Modal } from '../modal'
import { formatMYR } from '@/lib/money'

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
      {/* One row of fields, not a stacked column.
          This form was the right-hand panel of a two-up row, so it ran ~580px
          tall next to a history card that is ~190px when there is one
          purchase on record. Two panels whose heights can never match should
          not be a row — taste-redesign lists exactly this as "inconsistent
          vertical rhythm in side-by-side elements". Full width and horizontal
          instead, which is ~200px tall and leaves nothing beside it to fail
          to match. */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
          <div className="sm:col-span-3 lg:col-span-3">
            <label className="field-label">Date</label>
            <DatePicker name="purchase_date" max={today} todayIso={today} required />
          </div>
          <div className="sm:col-span-3 lg:col-span-3">
            <label htmlFor="cp-money" className="field-label">
              Amount paid (RM)
            </label>
            <input
              id="cp-money"
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
          <div className="sm:col-span-3 lg:col-span-3">
            <label htmlFor="cp-points" className="field-label">
              Points / credit received
            </label>
            <input
              id="cp-points"
              type="number"
              step="0.01"
              min="0"
              required
              value={pointsOverride}
              onChange={(e) => setPointsOverride(e.target.value)}
              placeholder={moneyRm ? String(suggestedPoints) : 'Auto-calculated'}
              className="field-input"
            />
          </div>
          <div className="sm:col-span-3 lg:col-span-3">
            <label htmlFor="cp-note" className="field-label">
              Note (optional)
            </label>
            <input id="cp-note" name="note" type="text" className="field-input" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-ink-800 pt-4">
          <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-60">
            {submitting ? 'Saving…' : 'Save purchase'}
          </button>
          <span className="text-[12px] text-paper-dim">
            Points are auto-calculated at the usual rate — edit them if Vibe charged something else this time.
          </span>
        </div>
      </form>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <p className="text-sm font-semibold text-paper">Confirm this purchase</p>
        <div className="mt-3 flex flex-col text-sm">
          <div className="docket-row">
            <span className="text-paper-dim">Amount Paid</span>
            <b className="figure-money text-paper">{formatMYR((Number(moneyRm) || 0))}</b>
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
