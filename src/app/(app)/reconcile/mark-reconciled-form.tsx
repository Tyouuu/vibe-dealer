'use client'

import { useState, useTransition } from 'react'
import { markReconciled } from './actions'

// diff !== 0 needs a typed override reason before this can submit — Mark
// Reconciled used to only check that a statement existed at all, so a month
// could be closed while the system and Vibe totals visibly disagreed.
export function MarkReconciledForm({
  month,
  monthLabel,
  hasStatement,
  diff,
}: {
  month: string
  monthLabel: string
  hasStatement: boolean
  diff: number | null
}) {
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
      {/* Sized to its content and with no glyph in the label. It was
          full-width with a literal ✓ in the string — no other button in the
          app does either, which is part of why this page read as foreign.
          The label keeps its verb on the pending state (Geist: "show a
          loading indicator & keep the original label") rather than swapping
          to a different word. */}
      <button
        type="submit"
        disabled={!hasStatement || (mismatched && !reason.trim()) || pending}
        className="btn-primary disabled:opacity-60"
      >
        {pending ? `Closing ${monthLabel}…` : mismatched ? `Close ${monthLabel} anyway` : `Close ${monthLabel}`}
      </button>
    </form>
  )
}
