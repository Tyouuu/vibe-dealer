'use client'

import { useState } from 'react'
import { recordCreditPurchase } from './actions'
import { CREDIT_PURCHASE_RATE } from '@/lib/packages'
import { DatePicker } from '../date-picker'
import { Modal } from '../modal'
import { formatMYR } from '@/lib/money'

export function PurchaseForm({ today, balance }: { today: string; balance: number }) {
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
      {/* Sections with a heading and a line of explanation, the shape Onboard
          Dealer and Log SIM Stock already use. This page was four bare fields
          stretched edge to edge under nothing, which is why it read as a strip
          floating on an empty page rather than as a form. */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="form-block">
        <h2 className="form-block-title">The purchase</h2>
        <p className="form-block-desc">
          What you paid Vibe Mobile, and how much credit they gave you for it. Points fill themselves in at the usual rate — overwrite them if this
          batch was priced differently.
        </p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
          <div className="sm:col-span-3 lg:col-span-3">
            <label className="field-label">Date<span className="req"> *</span></label>
            <DatePicker name="purchase_date" max={today} todayIso={today} required />
          </div>
          <div className="sm:col-span-3 lg:col-span-3">
            <label htmlFor="cp-money" className="field-label">
              Amount paid (RM)<span className="req"> *</span>
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

        </div>

        {/* What it will do, before you do it. The Place Order form already
            works this way — it prints how many cards are in the pool you are
            drawing from — and it is the one thing this page can say that the
            reader cannot work out in their head. */}
        <div className="form-block">
          <h2 className="form-block-title">After this purchase</h2>
          <p className="form-block-desc">The balance every sale is checked against, once this is saved.</p>
          {points > 0 ? (
            <div className="grid grid-cols-2 gap-x-10 gap-y-5 sm:grid-cols-4">
              <div>
                <div className="text-[12px] text-paper-dim">Balance now</div>
                <div className="figure-points mt-1 text-[20px]">{balance.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[12px] text-paper-dim">This purchase</div>
                <div className="figure-points mt-1 text-[20px]" style={{ color: 'var(--color-jade-bright)' }}>
                  +{points.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-paper-dim">Balance after</div>
                <div className="figure-points mt-1 text-[20px] font-semibold">{(balance + points).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[12px] text-paper-dim">Cost a point</div>
                <div className="figure-money mt-1 text-[20px] tracking-[-.02em]">
                  {Number(moneyRm) > 0 ? formatMYR(Number(moneyRm) / points) : '—'}
                </div>
                <div className="mt-1 text-[12px] text-paper-dim">
                  {Number(moneyRm) > 0 && Math.abs(Number(moneyRm) / points - (1 - CREDIT_PURCHASE_RATE)) > 0.005
                    ? `not the usual ${formatMYR(1 - CREDIT_PURCHASE_RATE)}`
                    : 'the usual rate'}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-paper-dim">
              Balance stands at <b className="figure-points font-semibold text-paper">{balance.toLocaleString()}</b> pts. Enter an amount above and
              this will show where it lands.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-ink-800 pt-6">
          <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-60">
            {submitting ? 'Saving…' : 'Save purchase'}
          </button>
          <span className="text-[12px] text-paper-dim">Nothing is saved until you confirm on the next step.</span>
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
