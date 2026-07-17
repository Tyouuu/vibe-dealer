'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

export async function recordCreditPurchase(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') {
    redirect('/purchases?error=' + encodeURIComponent('You do not have permission to log credit purchases.'))
  }

  const purchaseDate = String(formData.get('purchase_date') ?? '').trim()
  const moneyRm = Number(formData.get('money_rm'))
  const points = Number(formData.get('points'))
  const note = String(formData.get('note') ?? '').trim() || null

  if (!purchaseDate) redirect('/purchases?error=' + encodeURIComponent('Please choose a date.'))
  if (!Number.isFinite(moneyRm) || moneyRm < 0) redirect('/purchases?error=' + encodeURIComponent('Please enter a valid amount.'))
  if (!Number.isFinite(points) || points < 0) redirect('/purchases?error=' + encodeURIComponent('Please enter a valid points amount.'))

  const supabase = await createClient()
  const { error } = await supabase.from('credit_purchases').insert({
    purchase_date: purchaseDate,
    money_rm: moneyRm,
    points,
    note,
    recorded_by: user.id,
  })

  if (error) redirect('/purchases?error=' + encodeURIComponent(error.message))

  revalidatePath('/purchases')
  redirect('/purchases?saved=1')
}
