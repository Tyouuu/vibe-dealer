'use client'

import { useState } from 'react'
import { flagTransaction } from './actions'

export function FlagButton({ transactionId }: { transactionId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  return (
    <div className="relative inline-block">
      <button type="button" className="btn-clay" onClick={() => setOpen((o) => !o)}>
        Flag ✕
      </button>
      {open && (
        <div className="dropdown-panel w-72 p-3">
          <p className="mb-2 text-xs font-semibold text-paper">Why are you flagging this transaction?</p>
          <form action={flagTransaction} className="flex flex-col gap-2">
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
              <button type="submit" disabled={!reason.trim()} className="btn-clay flex-1">
                Confirm Flag
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-paper-dim">Excluded from reports and reconciliation. Cannot be undone.</p>
          </form>
        </div>
      )}
    </div>
  )
}
