'use client'

import { useState } from 'react'
import { recordSimIntake } from './actions'
import { SIM_BOX_SIZE, SIM_TYPE_LABEL, SIM_UNIT_COST_RM, type SimStockType } from '@/lib/sim-stock'

export function IntakeForm() {
  const [simType, setSimType] = useState<SimStockType>('physical')

  return (
    <form action={recordSimIntake} className="flex flex-col gap-3.5">
      <div>
        <label className="field-label">SIM Type</label>
        <input type="hidden" name="sim_type" value={simType} />
        <div className="segmented w-full">
          <button type="button" onClick={() => setSimType('physical')} className={`segmented-btn flex-1 ${simType === 'physical' ? 'active' : ''}`}>
            {SIM_TYPE_LABEL.physical}
          </button>
          <button type="button" onClick={() => setSimType('esim')} className={`segmented-btn flex-1 ${simType === 'esim' ? 'active' : ''}`}>
            {SIM_TYPE_LABEL.esim}
          </button>
        </div>
      </div>
      <div>
        <label className="field-label">Intake Date</label>
        <input name="intake_date" type="date" required className="field-input" />
      </div>
      <div>
        <label className="field-label">Quantity (cards)</label>
        <input name="quantity" type="number" min="1" step="1" required placeholder={`e.g. ${SIM_BOX_SIZE} for one box`} className="field-input" />
      </div>
      <div>
        <label className="field-label">Cost per Unit (RM)</label>
        <input name="cost_per_unit_rm" type="number" step="0.01" min="0" defaultValue={SIM_UNIT_COST_RM} required className="field-input" />
      </div>
      <div>
        <label className="field-label">Note (optional)</label>
        <input name="note" type="text" placeholder="e.g. 4 boxes, invoice #1234" className="field-input" />
      </div>
      <button type="submit" className="btn-primary w-full">
        Save Intake
      </button>
    </form>
  )
}
