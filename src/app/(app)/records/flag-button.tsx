'use client'

import { useRef, useState, useTransition } from 'react'
import { flagTransaction } from './actions'
import { AnchoredPanel } from '../anchored-panel'

// Flagging a transaction, from the overflow beside Verify.
//
// The overflow, not a second button: it was a filled clay "Flag ✕" sitting
// next to Verify, which gave the irreversible action the same weight as the
// routine one and made every pending row two buttons wide while a verified row
// was one. Carbon's rule is to keep actions inline below three and push the
// rest into an overflow, and these two were never equals.
//
// Still always rendered rather than revealed on hover: an action nobody can
// find is worse than one that is quiet, and a touch screen has no hover.
//
// The panel is portalled — see AnchoredPanel. This trigger lives in a
// `position: sticky` cell inside an `overflow: auto` grid, and an absolutely
// positioned panel was both clipped by the scroller and painted over by the
// next row's sticky cell, which has the same z-index and comes later in the
// DOM. It opened cut in half with other rows' buttons on top of it.
export function FlagButton({ transactionId }: { transactionId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)

  function closePanel() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="More actions for this transaction"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="More actions"
        className="grid h-7 w-7 place-items-center rounded-lg border border-transparent text-paper-dim transition-colors hover:border-ink-800 hover:bg-ink-850 hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
          <circle cx="4" cy="10" r="1.5" fill="currentColor" />
          <circle cx="10" cy="10" r="1.5" fill="currentColor" />
          <circle cx="16" cy="10" r="1.5" fill="currentColor" />
        </svg>
      </button>

      <AnchoredPanel anchor={triggerRef} open={open} onClose={closePanel} width={296} label="Flag this transaction">
        <p className="text-xs font-semibold text-paper">Flag this transaction</p>
        <p className="mb-2.5 mt-1 text-[12px] leading-relaxed text-paper-dim">
          Why? The audit log is only useful for tracing a dispute if it says.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.currentTarget)
            startTransition(() => {
              flagTransaction(formData)
            })
          }}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="id" value={transactionId} />
          <textarea
            name="reason"
            required
            rows={2}
            placeholder="e.g. duplicate entry, wrong dealer, receipt doesn't match"
            className="field-input resize-none"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex items-center gap-1.5">
            <button type="submit" disabled={!reason.trim() || pending} className="btn-clay flex-1">
              {pending ? 'Flagging…' : 'Confirm Flag'}
            </button>
            <button type="button" onClick={closePanel} className="btn-ghost">
              Cancel
            </button>
          </div>
          <p className="text-[12px] text-paper-dim">Excluded from reports and reconciliation. Cannot be undone.</p>
        </form>
      </AnchoredPanel>
    </>
  )
}
