'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { friendlyDbError } from '@/lib/db-error'

function fail(message: string): never {
  redirect('/requests?error=' + encodeURIComponent(message))
}

// Turning a dealer's claim down, with the reason they will read.
//
// There is no matching `acceptRequest`. Accepting is not a decision that can
// be taken on this page — it means recording a transaction, and that has one
// front door: /entry, with its balance check, its period lock, its duplicate
// warning and its second-person sign-off. So "Accept" is a link that opens
// that form pre-filled, and the request is marked accepted by the transaction
// actually landing. A button here that flipped a status would be a second way
// to record money, and there is deliberately only one.
export async function rejectRequest(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') {
    fail('You do not have permission to review dealer requests.')
  }

  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (!id) fail('That request could not be found.')
  // The database enforces this too (0042). Checked here so the person gets a
  // sentence rather than a constraint name.
  if (!reason) fail('Please say why, so the dealer knows what to do next.')

  const { error } = await (await createClient())
    .from('topup_requests')
    .update({
      status: 'rejected',
      reject_reason: reason.slice(0, 500),
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')

  if (error) fail(friendlyDbError(error.message))

  revalidatePath('/requests')
  redirect('/requests?rejected=1')
}
