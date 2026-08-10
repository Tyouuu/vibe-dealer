'use client'

import { useState, useTransition } from 'react'
import { rejectRequest } from './actions'

// Two-step, and the reason is required. The dealer reads whatever is typed
// here on their own link — a rejection with no reason is the one that starts
// a phone call, which is the work this whole feature exists to avoid.
export function RejectForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost py-1.5 text-xs">
        Turn down
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        startTransition(() => {
          rejectRequest(formData)
        })
      }}
      className="w-full rounded-lg border border-ink-800 bg-ink-850/50 p-3"
    >
      <input type="hidden" name="id" value={id} />
      <label className="field-label">What should the dealer be told?</label>
      <input
        name="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. No transfer found for this amount — please send the slip"
        className="field-input"
        maxLength={500}
        required
      />
      <p className="mt-2 text-[12px] text-paper-dim">This appears on their link, so write it to them.</p>
      <div className="mt-3 flex items-center gap-2">
        <button type="submit" disabled={pending || !reason.trim()} className="btn-ghost py-1.5 text-xs disabled:opacity-50">
          {pending ? 'Sending…' : 'Turn it down'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] font-semibold text-paper-dim hover:text-paper">
          Cancel
        </button>
      </div>
    </form>
  )
}
