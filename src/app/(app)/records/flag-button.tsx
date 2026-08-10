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
      {/* Quiet, and no ✕.
          It was a filled clay button reading "Flag ✕", which gave it the same
          visual weight as Verify beside it — the routine action and the
          irreversible one presented as two equal choices — and put a third
          colour family in a cell that already had a status dot and a bordered
          button. Flag is rare; it reads as rare now, and the clay only appears
          on hover, once you are actually reaching for it.

          Still always visible rather than revealed on hover: an action nobody
          can find is worse than one that is merely quiet, and on a touch
          screen there is no hover to reveal it with. */}
      <button
        ref={triggerRef}
        type="button"
        className="btn-ghost text-paper-dim hover:border-clay/40 hover:text-clay-bright"
        onClick={() => setOpen((o) => !o)}
      >
        Flag
      </button>
      {open && (
        <div className="dropdown-panel w-72 p-3">
          <p className="mb-2 text-xs font-semibold text-paper">Why are you flagging this transaction?</p>
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
