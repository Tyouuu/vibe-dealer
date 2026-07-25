'use client'

import { useState, useTransition } from 'react'
import { markReconciled } from './actions'

// diff !== 0 needs a typed override reason before this can submit — Mark
// Reconciled used to only check that a statement existed at all, so a month
// could be closed while the system and Vibe totals visibly disagreed.
export function MarkReconciledForm({ month, hasStatement, diff }: { month: string; hasStatement: boolean; diff: number | null }) {
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const mismatched = diff != null && diff !== 0

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        startTransition(() => {
          markReconciled(formData)
        })
      }}
      className="w-full"
    >
      <input type="hidden" name="month" value={month} />
      {mismatched && (
        <div className="mb-2.5">
          <label className="field-label">Override reason — numbers don&apos;t match</label>
          <input
            name="override_reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Vibe confirmed their statement is correct by phone"
            className="field-input"
            required
          />
        </div>
      )}
      <button
        type="submit"
        disabled={!hasStatement || (mismatched && !reason.trim()) || pending}
        className="btn-primary w-full disabled:opacity-60"
      >
        {pending ? 'Marking…' : mismatched ? 'Mark Reconciled Anyway ✓' : 'Mark Reconciled ✓'}
      </button>
    </form>
  )
}
