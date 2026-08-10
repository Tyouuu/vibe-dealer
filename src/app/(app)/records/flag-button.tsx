'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { flagTransaction } from './actions'

export function FlagButton({ transactionId }: { transactionId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  function closePanel() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="relative inline-block" ref={ref} onKeyDown={(e) => e.key === 'Escape' && closePanel()}>
      {/* The overflow, not a second button.
          It was a filled clay button reading "Flag ✕" sitting beside Verify,
          which gave the irreversible action the same weight as the routine
          one and made every pending row two buttons wide while a verified row
          was one — the ragged column the owner called messy. Carbon's rule is
          to keep actions inline below three and push the rest into an
          overflow; there are two here and they are not equals.

          Still always rendered rather than revealed on hover: an action nobody
          can find is worse than one that is quiet, and a touch screen has no
          hover to reveal it with. */}
      <button
        ref={triggerRef}
        type="button"
        aria-label="More actions for this transaction"
        aria-haspopup="true"
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
      {open && (
        <div className="dropdown-panel w-72 p-3">
          <p className="mb-2 text-xs font-semibold text-paper">Flag this transaction</p>
          <p className="mb-2 text-[12px] leading-relaxed text-paper-dim">Why? The audit log is only useful for tracing a dispute if it says.</p>
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
        </div>
      )}
    </div>
  )
}
