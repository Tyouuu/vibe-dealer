'use client'

import { useTransition } from 'react'
import { verifyTransaction } from './actions'

// Verifying your own entry isn't blocked — with 3 staff, whoever's on duty
// that day needs to be able to close out their own work, and a hard block
// would just mean nothing gets verified when only one accountant is around.
// A confirm dialog is the cheap, real middle ground: it surfaces the
// maker-checker gap in the moment instead of silently letting it slide by.
export function VerifyButton({ transactionId, isSelfRecorded }: { transactionId: string; isSelfRecorded: boolean }) {
  const [pending, startTransition] = useTransition()

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (isSelfRecorded && !confirm('You recorded this transaction yourself — verify it anyway?')) {
      e.preventDefault()
      return
    }
    const formData = new FormData(e.currentTarget.closest('form') as HTMLFormElement)
    e.preventDefault()
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
    </form>
  )
}
