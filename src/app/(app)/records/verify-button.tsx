'use client'

import { useState, useTransition } from 'react'
import { verifyTransaction } from './actions'
import { Modal } from '../modal'

// Verifying your own ordinary entry isn't blocked — with 3 staff, whoever's
// on duty that day needs to be able to close out their own work, and a hard
// block would just mean nothing gets verified when only one accountant is
// around. A confirm dialog is the cheap, real middle ground: it surfaces the
// maker-checker gap in the moment instead of silently letting it slide by.
//
// A correction (adjustment) is held to a stricter rule: it's the one entry
// type that exists purely to change a number already on record, with no
// receipt/formula constraint behind it (see AdjustButton) — the one real
// safeguard against a single person quietly fabricating one is requiring a
// second person to check it, so self-verifying one is refused outright
// rather than just nudged past. verifyTransaction enforces this server-side
// too — this button state is the UX for that, not the actual gate.
export function VerifyButton({
  transactionId,
  isSelfRecorded,
  isAdjustment,
}: {
  transactionId: string
  isSelfRecorded: boolean
  isAdjustment: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const blocked = isSelfRecorded && isAdjustment

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    if (isSelfRecorded && !isAdjustment) {
      setConfirmOpen(true)
      return
    }
    const formData = new FormData(e.currentTarget.closest('form') as HTMLFormElement)
    startTransition(() => {
      verifyTransaction(formData)
    })
  }

  if (blocked) {
    return (
      <span
        className="btn-jade cursor-not-allowed opacity-40"
        title="You posted this correction — a different accountant or master needs to verify it."
      >
        Verify ✓
      </span>
    )
  }

  return (
    <form>
      <input type="hidden" name="id" value={transactionId} />
      <button type="submit" onClick={handleClick} disabled={pending} className="btn-jade disabled:opacity-60">
        {pending ? 'Verifying…' : 'Verify ✓'}
      </button>
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <p className="text-sm font-semibold text-paper">You recorded this transaction yourself — verify it anyway?</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setConfirmOpen(false)} className="btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmOpen(false)
              const fd = new FormData()
              fd.set('id', transactionId)
              startTransition(() => {
                verifyTransaction(fd)
              })
            }}
            className="btn-jade"
          >
            Verify Anyway
          </button>
        </div>
      </Modal>
    </form>
  )
}
