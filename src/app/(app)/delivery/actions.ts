'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { friendlyDbError } from '@/lib/db-error'

function fail(message: string): never {
  redirect('/delivery?error=' + encodeURIComponent(message))
}

// The queue holds two kinds of parcel (0052): a package sale with a physical SIM,
// marked sent through mark_delivered, and a direct SIM card order, marked sent
// through mark_sim_order_sent. Which one a row is gets looked up here, from the
// queue itself, rather than trusted from the page: every Mark as sent button in
// the app posts just an id, and an id that arrived in a form is not a claim about
// which table it lives in.
type Kind = 'sale' | 'order'
type Db = Awaited<ReturnType<typeof createClient>>
async function kindsOf(supabase: Db, ids: string[]) {
  const { data } = await supabase.from('delivery_queue').select('id, dealer_id, source').in('id', ids)
  const rows = (data ?? []) as { id: string; dealer_id: string; source: Kind }[]
  return new Map(rows.map((r) => [r.id, r]))
}
function markSent(supabase: Db, id: string, kind: Kind | undefined) {
  return kind === 'order' ? supabase.rpc('mark_sim_order_sent', { p_order_id: id }) : supabase.rpc('mark_delivered', { p_tx_id: id })
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
  // delivery_queue (not transactions — cs has no SELECT on the base table) also
  // says which dealer detail page needs its cached delivery table refreshed.
  const row = (await kindsOf(supabase, [id])).get(id)
  const { error } = await markSent(supabase, id, row?.source)
  if (error) fail(friendlyDbError(error.message))

  revalidatePath('/delivery')
  revalidatePath('/dashboard')
  if (row?.source === 'order') revalidatePath('/sim-stock')
  if (row?.dealer_id) revalidatePath(`/dealers/${row.dealer_id}`)
}

export async function bulkMarkDelivered(ids: string[]) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') fail('You do not have permission to mark deliveries.')
  if (!ids.length) return

  const supabase = await createClient()
  const kinds = await kindsOf(supabase, ids)
  const results = await Promise.all(ids.map((id) => markSent(supabase, id, kinds.get(id)?.source)))

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

  revalidatePath('/delivery')
  revalidatePath('/dashboard')
  if ([...kinds.values()].some((r) => r.source === 'order')) revalidatePath('/sim-stock')
  for (const dealerId of new Set([...kinds.values()].map((r) => r.dealer_id))) {
    revalidatePath(`/dealers/${dealerId}`)
  }
}
