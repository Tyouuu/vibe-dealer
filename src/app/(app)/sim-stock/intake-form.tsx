'use client'

import { useState, useTransition } from 'react'
import { recordSimIntake } from './actions'
import { ReceiptField } from '../receipt-field'
import { SIM_BOX_SIZE, SIM_STOCK_TYPES, SIM_TYPE_LABEL, SIM_UNIT_COST_RM, type SimStockType } from '@/lib/sim-stock'
import { DatePicker } from '../date-picker'
import { Modal } from '../modal'
import { formatMYR } from '@/lib/money'

export function IntakeForm({ today }: { today: string }) {
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
    // Five fields in one column made a card roughly 700px tall. It used to
    // stand beside a three-row log, so the page's largest empty space sat
    // directly under that log; the card now runs the full width of the band
    // below the log instead, and the fields sit on the same 12-column grid
    // the Onboard form uses. Four short fields read as short fields rather
    // than as five identical full-width bars.
    //
    // The spans are written out at the call site, not behind an @apply
    // alias: Tailwind does not resolve responsive grid utilities through
    // @apply and silently compiles grid-template-columns to `none`.
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
        <div className="sm:col-span-6 lg:col-span-5">
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
        <div className="sm:col-span-3 lg:col-span-3">
          <label className="field-label">Intake Date</label>
          {/* todayIso and max, like the other four pickers in the app. Without
              them this calendar had no Today button and did not even mark
              which day today was — on the one form where today is nearly
              always the answer, because you book a box in as it arrives. It
              also let a future date be chosen and left the server to refuse
              it afterwards. */}
          <DatePicker name="intake_date" max={today} todayIso={today} required />
        </div>
        <div className="sm:col-span-3 lg:col-span-2">
          <label htmlFor="si-qty" className="field-label">
            Quantity (cards)
          </label>
          <input id="si-qty" name="quantity" type="number" min="1" step="1" required placeholder={`e.g. ${SIM_BOX_SIZE} for one box`} className="field-input" />
        </div>
        <div className="sm:col-span-3 lg:col-span-2">
          <label htmlFor="si-cost" className="field-label">
            Cost per unit (RM)
          </label>
          <input id="si-cost" name="cost_per_unit_rm" type="number" step="0.01" min="0" defaultValue={SIM_UNIT_COST_RM} required className="field-input" />
        </div>
        {/* Its own field, not a hint inside the note. This box has been
            prompting for "invoice #1234" since day one with nowhere structured
            to put it, so the one value worth searching by lived in free text
            beside "4 boxes". Every receiving-form guide names it. */}
        <div className="sm:col-span-3 lg:col-span-3">
          <label htmlFor="si-ref" className="field-label">
            Invoice no. <span className="font-normal text-paper-dim">(optional)</span>
          </label>
          <input id="si-ref" name="reference" type="text" maxLength={80} placeholder="e.g. VM-1234" className="field-input" />
        </div>
        <div className="sm:col-span-3 lg:col-span-3">
          <label className="field-label">
            Note <span className="font-normal text-paper-dim">(optional)</span>
          </label>
          <input name="note" type="text" placeholder="e.g. 4 boxes from the Ipoh run" className="field-input" />
        </div>
        {/* Inside the grid and six columns wide, the same as the order form's
            below. It sat outside the grid at full bleed, so the two forms on
            this page had upload boxes of different widths, different labels
            and different wording — which is most of why they did not read as
            one page. */}
        <div className="sm:col-span-6 lg:col-span-6">
          <ReceiptField hint="The invoice for this intake. Image or PDF." />
        </div>
      </div>
      {/* The footer shape Onboard Dealer uses: the action sits on the rule
          that closes its section, left-aligned, with one line of guidance
          beside it rather than a full-width bar. */}
      <div className="flex flex-wrap items-center gap-4 border-t border-ink-800 pt-6">
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
          {pending ? 'Saving…' : 'Save intake'}
        </button>
        <span className="text-[12px] text-paper-dim">Adds to the pool you picked. Nothing leaves stock.</span>
      </div>

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
