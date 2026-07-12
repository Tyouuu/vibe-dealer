'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

function fail(month: string, message: string): never {
  redirect(`/reconcile?month=${month}&error=${encodeURIComponent(message)}`)
}

export async function saveStatement(formData: FormData) {
  const user = await requireUser()
  const month = String(formData.get('month') ?? '')
  if (user.role !== 'accountant' && user.role !== 'master') fail(month, 'Not authorized.')
  if (!month) fail(month, 'Please select a month.')

  const totalPoints = Number(formData.get('company_total_points') ?? 0)
  const profitRm = Number(formData.get('company_profit_rm') ?? 0)
  const note = String(formData.get('note') ?? '').trim() || null
  const monthDate = `${month}-01`

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('company_statements')
    .select('id')
    .eq('month', monthDate)
    .maybeSingle()

  const payload = { month: monthDate, company_total_points: totalPoints, company_profit_rm: profitRm, note }

  const { error } = existing
    ? await supabase.from('company_statements').update(payload).eq('id', existing.id)
    : await supabase.from('company_statements').insert(payload)

  if (error) fail(month, error.message)

  // Append-only history — company_statements only holds the latest value per
  // month, so log every save here to keep what it used to say and who changed it.
  await supabase.from('company_statement_revisions').insert({
    month: monthDate,
    company_total_points: totalPoints,
    company_profit_rm: profitRm,
    note,
    recorded_by: user.id,
  })

  revalidatePath('/reconcile')
  revalidatePath('/audit')
  redirect(`/reconcile?month=${month}&saved=1`)
}

export async function markReconciled(formData: FormData) {
  const user = await requireUser()
  const month = String(formData.get('month') ?? '')
  if (user.role !== 'accountant' && user.role !== 'master') fail(month, 'Not authorized.')

  const monthDate = `${month}-01`
  const supabase = await createClient()
  const { error } = await supabase.from('company_statements').update({ reconciled: true }).eq('month', monthDate)

  if (error) fail(month, error.message)

  revalidatePath('/reconcile')
  redirect(`/reconcile?month=${month}&saved=1`)
}
