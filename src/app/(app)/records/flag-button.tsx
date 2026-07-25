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
      <button ref={triggerRef} type="button" className="btn-clay" onClick={() => setOpen((o) => !o)}>
        Flag ✕
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
            <p className="text-[11px] text-paper-dim">Excluded from reports and reconciliation. Cannot be undone.</p>
          </form>
        </div>
      )}
    </div>
  )
}
