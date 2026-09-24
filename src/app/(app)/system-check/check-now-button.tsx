'use client'

import { useFormStatus } from 'react-dom'
import { runCheckNow } from './actions'

// A form of its own so the button knows when the check is running. The run reads every ledger row, which
// is a second or two on a big month — long enough that a button that does nothing visible gets pressed
// twice, and the second press is a second full pass of the ledger.
function Button() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary shrink-0">
      {pending ? 'Checking…' : 'Check now'}
    </button>
  )
}

export function CheckNowButton() {
  return (
    <form action={runCheckNow}>
      <Button />
    </form>
  )
}
