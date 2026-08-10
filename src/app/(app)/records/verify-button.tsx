'use client'

import { useState, useTransition } from 'react'
import { verifyTransaction } from './actions'
import { Modal } from '../modal'

// Verifying your own entry is allowed, and always was for ordinary sales:
// whoever is on duty that day needs to be able to close out their own work,
// and a hard block just means nothing gets verified when one person is around.
//
// Corrections used to be the exception — refused outright until a second
// person signed them. 0043 dropped that rule, because this business does not
// have a second person on most days and the rule was producing corrections
// that sat pending while the reports kept showing the figure they were meant
// to fix. What is left is this dialog: it names the gap in the moment instead
// of pretending there isn't one, and the ledger still records both who posted
// the row and who signed it.
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

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    if (isSelfRecorded) {
      setConfirmOpen(true)
      return
    }
    const formData = new FormData(e.currentTarget.closest('form') as HTMLFormElement)
    startTransition(() => {
      verifyTransaction(formData)
    })
  }

  return (
    <form>
      <input type="hidden" name="id" value={transactionId} />
      <button type="submit" onClick={handleClick} disabled={pending} className="btn-jade disabled:opacity-60">
        {pending ? 'Verifying…' : 'Verify ✓'}
      </button>
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <p className="text-sm font-semibold text-paper">
          {isAdjustment
            ? 'You posted this correction yourself — sign it off anyway?'
            : 'You recorded this transaction yourself — verify it anyway?'}
        </p>
        {/* Only for a correction. An ordinary sale has a receipt and a formula
            behind it; a correction has neither, so it is worth saying out loud
            that the ledger will show one name in both columns. */}
        {isAdjustment && (
          <p className="mt-2 text-[13px] leading-relaxed text-paper-dim">
            The record will show you as both the person who posted it and the person who signed it.
          </p>
        )}
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
            {isAdjustment ? 'Sign it off' : 'Verify anyway'}
          </button>
        </div>
      </Modal>
    </form>
  )
}
