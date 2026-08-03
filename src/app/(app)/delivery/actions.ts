'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { friendlyDbError } from '@/lib/db-error'

function fail(message: string): never {
  redirect('/delivery?error=' + encodeURIComponent(message))
}

// Both actions used to discard the RPC result entirely — `await
// supabase.rpc(...)` with no error check — and return silently when the role
// was wrong. Either way the page just re-rendered with the row still pending
// and nothing on screen to say why, which reads as "the click didn't
// register" and invites a second and third attempt at something that will
// keep failing.
export async function markDelivered(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') fail('You do not have permission to mark deliveries.')

  const id = String(formData.get('id') ?? '')
  if (!id) fail('Missing delivery id.')

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_delivered', { p_tx_id: id })
  if (error) fail(friendlyDbError(error.message))

  // delivery_queue (not transactions — cs has no SELECT on the base table) to
  // find which dealer detail page also needs its cached delivery table refreshed.
  const { data } = await supabase.from('delivery_queue').select('dealer_id').eq('id', id).maybeSingle()

  revalidatePath('/delivery')
  if (data?.dealer_id) revalidatePath(`/dealers/${data.dealer_id}`)
}

export async function bulkMarkDelivered(ids: string[]) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') fail('You do not have permission to mark deliveries.')
  if (!ids.length) return

  const supabase = await createClient()
  const results = await Promise.all(ids.map((id) => supabase.rpc('mark_delivered', { p_tx_id: id })))

  // Partial failure is the case worth naming: some rows moved and some did
  // not, and a silent return would leave the operator believing all of them
  // did. The ones that succeeded stay succeeded — mark_delivered is per-row
  // and there is no transaction spanning them to roll back.
  const failed = results.filter((r) => r.error)
  if (failed.length) {
    const detail = friendlyDbError(failed[0].error?.message)
    fail(
      failed.length === ids.length
        ? detail
        : `${ids.length - failed.length} of ${ids.length} marked as delivered. The rest failed — ${detail}`
    )
  }

  const { data } = await supabase.from('delivery_queue').select('dealer_id').in('id', ids)

  revalidatePath('/delivery')
  for (const dealerId of new Set((data ?? []).map((r) => r.dealer_id))) {
    revalidatePath(`/dealers/${dealerId}`)
  }
}
