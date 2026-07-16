'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

function assertCanManage(role: string) {
  if (role !== 'cs' && role !== 'master') {
    throw new Error('Not authorized to change dealer status.')
  }
}

export async function setDealerStatus(id: string, status: 'active' | 'inactive') {
  const user = await requireUser()
  assertCanManage(user.role)

  const supabase = await createClient()
  await supabase.from('dealers').update({ status }).eq('id', id)

  revalidatePath('/dealers')
  revalidatePath(`/dealers/${id}`)
}

export async function bulkSetDealerStatus(ids: string[], status: 'active' | 'inactive') {
  const user = await requireUser()
  assertCanManage(user.role)
  if (!ids.length) return

  const supabase = await createClient()
  await supabase.from('dealers').update({ status }).in('id', ids)

  revalidatePath('/dealers')
}
