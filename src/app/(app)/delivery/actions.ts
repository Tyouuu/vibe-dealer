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

  revalidatePath('/delivery')
}
