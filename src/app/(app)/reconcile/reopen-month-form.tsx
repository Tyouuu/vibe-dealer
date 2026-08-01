'use client'

import { useState, useTransition } from 'react'
import { reopenMonth } from './actions'

// Shown only on an already-reconciled month, and only to a master. This is
// the one sanctioned way past the period lock (migration 0031): a closed
// month's totals can't move, so a genuine late correction has to reopen the
// month, get made, and then be reconciled again.
//
// Two-step rather than a single button — reopening invalidates a sign-off
// that was already given, so it shouldn't be one stray click away, and the
// reason is what makes the resulting audit entry worth reading.
export function ReopenMonthForm({ month }: { month: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[12px] font-semibold text-paper-dim hover:text-paper hover:underline">
        Reopen this month to make a correction
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        startTransition(() => {
          reopenMonth(formData)
        })
      }}
      className="w-full rounded-lg border border-ink-800 bg-ink-850/50 p-3"
    >
      <input type="hidden" name="month" value={month} />
      <label className="field-label">Why are you reopening {month}?</label>
      <input
        name="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. A June top-up was missed and Vibe agreed to a revised statement"
        className="field-input"
        required
      />
      <p className="mt-2 text-[12px] text-paper-dim">
        This unlocks {month} so its transactions can change again. It&apos;s recorded in the audit log, and you&apos;ll need to mark the month
        reconciled again afterwards.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button type="submit" disabled={pending || !reason.trim()} className="btn-ghost py-1.5 text-xs disabled:opacity-50">
          {pending ? 'Reopening…' : 'Reopen month'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] font-semibold text-paper-dim hover:text-paper">
          Cancel
        </button>
      </div>
    </form>
  )
}
