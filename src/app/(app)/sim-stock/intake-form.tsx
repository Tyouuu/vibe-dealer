'use client'

import { useState, useTransition } from 'react'
import { recordSimIntake } from './actions'
import { SIM_BOX_SIZE, SIM_STOCK_TYPES, SIM_TYPE_LABEL, SIM_UNIT_COST_RM, type SimStockType } from '@/lib/sim-stock'
import { DatePicker } from '../date-picker'
import { Modal } from '../modal'
import { formatMYR } from '@/lib/money'

export function IntakeForm() {
  const [simType, setSimType] = useState<SimStockType>('physical')
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPendingFormData(new FormData(e.currentTarget))
    setConfirmOpen(true)
  }

  function doSubmit() {
    if (!pendingFormData) return
    setConfirmOpen(false)
    startTransition(() => {
      recordSimIntake(pendingFormData)
    })
  }

  const quantity = pendingFormData ? Number(pendingFormData.get('quantity')) : 0
  const costPerUnit = pendingFormData ? Number(pendingFormData.get('cost_per_unit_rm')) : 0

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div>
        <label className="field-label">SIM Type</label>
        <input type="hidden" name="sim_type" value={simType} />
        <div className="segmented w-full">
          {SIM_STOCK_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => setSimType(t)} className={`segmented-btn flex-1 ${simType === t ? 'active' : ''}`}>
              {SIM_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="field-label">Intake Date</label>
        <DatePicker name="intake_date" required />
      </div>
      <div>
        <label htmlFor="si-qty" className="field-label">
          Quantity (cards)
        </label>
        <input id="si-qty" name="quantity" type="number" min="1" step="1" required placeholder={`e.g. ${SIM_BOX_SIZE} for one box`} className="field-input" />
      </div>
      <div>
        <label htmlFor="si-cost" className="field-label">
          Cost per unit (RM)
        </label>
        <input id="si-cost" name="cost_per_unit_rm" type="number" step="0.01" min="0" defaultValue={SIM_UNIT_COST_RM} required className="field-input" />
      </div>
      <div>
        <label className="field-label">Note (optional)</label>
        <input name="note" type="text" placeholder="e.g. 4 boxes, invoice #1234" className="field-input" />
      </div>
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? 'Saving…' : 'Save Intake'}
      </button>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <p className="text-sm font-semibold text-paper">Confirm this stock intake</p>
        <div className="mt-3 flex flex-col text-sm">
          <div className="docket-row">
            <span className="text-paper-dim">SIM Type</span>
            <b className="text-paper">{SIM_TYPE_LABEL[simType]}</b>
          </div>
          <div className="docket-row">
            <span className="text-paper-dim">Quantity</span>
            <b className="figure text-paper">{quantity.toLocaleString()} cards</b>
          </div>
          <div className="docket-row">
            <span className="text-paper-dim">Total Cost</span>
            <b className="figure-money text-paper">{formatMYR((quantity * costPerUnit))}</b>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => setConfirmOpen(false)} className="btn-ghost flex-1">
            Back
          </button>
          <button type="button" onClick={doSubmit} disabled={pending} className="btn-primary flex-1">
            {pending ? 'Saving…' : 'Confirm & Save'}
          </button>
        </div>
      </Modal>
    </form>
  )
}
