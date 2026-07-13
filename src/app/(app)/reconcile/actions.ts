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
  if (totalPoints < 0) fail(month, 'Vibe total top-up cannot be negative.')
  if (profitRm < 0) fail(month, "Vibe's profit figure cannot be negative.")
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

  const { data: existing } = await supabase
    .from('company_statements')
    .select('company_total_points, company_profit_rm')
    .eq('month', monthDate)
    .maybeSingle()

  if (!existing) fail(month, 'No statement found for this month.')

  const { error } = await supabase.from('company_statements').update({ reconciled: true }).eq('month', monthDate)

  if (error) fail(month, error.message)

  // Reconciliation itself is a real change of record — log it in the same
  // append-only history saveStatement uses, so audit shows who formally
  // closed the month, not just who last edited the numbers.
  await supabase.from('company_statement_revisions').insert({
    month: monthDate,
    company_total_points: existing.company_total_points,
    company_profit_rm: existing.company_profit_rm,
    note: 'Reconciliation marked complete',
    recorded_by: user.id,
  })

  revalidatePath('/reconcile')
  revalidatePath('/audit')
  redirect(`/reconcile?month=${month}&saved=1`)
}
