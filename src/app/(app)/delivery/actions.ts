'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

export async function markDelivered(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') return

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase.rpc('mark_delivered', { p_tx_id: id })

  // delivery_queue (not transactions — cs has no SELECT on the base table) to
  // find which dealer detail page also needs its cached delivery table refreshed.
  const { data } = await supabase.from('delivery_queue').select('dealer_id').eq('id', id).maybeSingle()

  revalidatePath('/delivery')
  if (data?.dealer_id) revalidatePath(`/dealers/${data.dealer_id}`)
}

export async function bulkMarkDelivered(ids: string[]) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') return
  if (!ids.length) return

  const supabase = await createClient()
  await Promise.all(ids.map((id) => supabase.rpc('mark_delivered', { p_tx_id: id })))

  const { data } = await supabase.from('delivery_queue').select('dealer_id').in('id', ids)

  revalidatePath('/delivery')
  for (const dealerId of new Set((data ?? []).map((r) => r.dealer_id))) {
    revalidatePath(`/dealers/${dealerId}`)
  }
}
