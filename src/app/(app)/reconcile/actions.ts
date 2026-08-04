'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange } from '@/lib/month'
import { friendlyDbError } from '@/lib/db-error'

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
  // isFinite first: NaN fails every comparison, so a non-numeric field slipped
  // past the two range checks below and reached Postgres as NaN.
  if (!Number.isFinite(totalPoints)) fail(month, "Vibe's total top-up could not be read as a number.")
  if (!Number.isFinite(profitRm)) fail(month, "Vibe's profit figure could not be read as a number.")
  if (totalPoints < 0) fail(month, 'Vibe total top-up cannot be negative.')
  if (profitRm < 0) fail(month, "Vibe's profit figure cannot be negative.")
  const monthDate = `${month}-01`

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('company_statements')
    .select('id, reconciled')
    .eq('month', monthDate)
    .maybeSingle()

  // The period lock (0031) stops a transaction moving inside a closed month,
  // but the reconciliation's own reference figure sat outside it: this action
  // could rewrite company_total_points for an already-reconciled month with no
  // gate at all, so the number the closure was checked against could change
  // after the fact while `reconciled` stayed true. reopenMonth exists to be
  // the one traceable way to change a closed month — routing through it makes
  // that true rather than merely intended.
  if (existing?.reconciled) {
    fail(month, 'This month is reconciled — reopen it before changing the statement figures.')
  }

  const payload = { month: monthDate, company_total_points: totalPoints, company_profit_rm: profitRm, note }

  const { error } = existing
    ? await supabase.from('company_statements').update(payload).eq('id', existing.id)
    : await supabase.from('company_statements').insert(payload)

  if (error) fail(month, friendlyDbError(error.message))

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
  const { start, end } = monthRange(month)
  const overrideReason = String(formData.get('override_reason') ?? '').trim()
  const supabase = await createClient()

  const [{ data: existing }, { data: verifiedTx }] = await Promise.all([
    supabase.from('company_statements').select('company_total_points, company_profit_rm').eq('month', monthDate).maybeSingle(),
    supabase.from('transactions').select('points').eq('status', 'verified').gte('tx_date', start).lte('tx_date', end),
  ])

  if (!existing) fail(month, 'No statement found for this month.')

  // Recomputed server-side from a fresh read rather than trusting a diff the
  // client sends — the whole point of this check is to stop a month closing
  // while the numbers disagree, so it can't itself trust client-supplied numbers.
  // Rounded before comparing — see reconcile/page.tsx for why an honestly-
  // reconciled month could otherwise land on a nonzero floating-point dust value.
  const systemPoints = (verifiedTx ?? []).reduce((sum, t) => sum + Number(t.points), 0)
  const diff = Math.round((systemPoints - Number(existing.company_total_points)) * 100) / 100

  if (diff !== 0 && !overrideReason) {
    fail(
      month,
      `System total (${systemPoints.toLocaleString()} pts) doesn't match Vibe's statement (${Number(existing.company_total_points).toLocaleString()} pts) — enter a reason to override and mark reconciled anyway.`
    )
  }

  const { error } = await supabase.from('company_statements').update({ reconciled: true }).eq('month', monthDate)

  if (error) fail(month, friendlyDbError(error.message))

  // A month closed over a gap is a dispute with Vibe, whether or not anyone
  // called it that. The reason used to land only in the revisions log as
  // prose, which answered "who closed it" but never "is this still open, how
  // much is it, and did they ever reply". It now also opens a variance record
  // that stays open until somebody settles it — see 0033.
  if (diff !== 0) {
    await supabase.from('statement_variances').insert({
      month: monthDate,
      gap_points: diff,
      reason: overrideReason,
      opened_by: user.id,
    })
  }

  // Reconciliation itself is a real change of record — log it in the same
  // append-only history saveStatement uses, so audit shows who formally
  // closed the month, not just who last edited the numbers. When there's a
  // mismatch, the override reason is the whole reason this closure is worth
  // being able to trace later, so it goes in the same note real revisions use.
  await supabase.from('company_statement_revisions').insert({
    month: monthDate,
    company_total_points: existing.company_total_points,
    company_profit_rm: existing.company_profit_rm,
    note: diff === 0 ? 'Reconciliation marked complete' : `Reconciliation marked complete despite a ${diff.toLocaleString()} pt mismatch — override reason: ${overrideReason}`,
    recorded_by: user.id,
  })

  revalidatePath('/reconcile')
  revalidatePath('/audit')
  redirect(`/reconcile?month=${month}&saved=1`)
}

// The sanctioned way to change a closed month. The period lock (migration
// 0031) refuses any write that would move a reconciled month's verified
// total, so a genuine late correction needs the month reopened first — make
// the correction, then mark it reconciled again.
//
// Deliberately master-only, and deliberately not a per-transaction override
// flag: reopening is one explicit, traceable act rather than a quiet
// exception attached to whichever row needed it. A reason is required for the
// same purpose the mismatch-override reason serves above — the audit trail is
// only useful for tracing a dispute if it records why, not just who.
export async function reopenMonth(formData: FormData) {
  const user = await requireUser()
  const month = String(formData.get('month') ?? '')
  if (user.role !== 'master') fail(month, 'Only a master can reopen a reconciled month.')

  const reason = String(formData.get('reason') ?? '').trim()
  if (!reason) fail(month, 'Enter a reason for reopening this month.')

  const monthDate = `${month}-01`
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('company_statements')
    .select('company_total_points, company_profit_rm, reconciled')
    .eq('month', monthDate)
    .maybeSingle()

  if (!existing) fail(month, 'No statement found for this month.')
  if (!existing.reconciled) fail(month, 'This month is not currently reconciled.')

  const { error } = await supabase.from('company_statements').update({ reconciled: false }).eq('month', monthDate)
  if (error) fail(month, friendlyDbError(error.message))

  await supabase.from('company_statement_revisions').insert({
    month: monthDate,
    company_total_points: existing.company_total_points,
    company_profit_rm: existing.company_profit_rm,
    note: `Month reopened for correction — reason: ${reason}`,
    recorded_by: user.id,
  })

  revalidatePath('/reconcile')
  revalidatePath('/audit')
  revalidatePath('/records')
  redirect(`/reconcile?month=${month}&reopened=1`)
}

// Settling a variance: what Vibe came back with, or what we found. Update
// rather than delete — 0033 grants no delete policy, so the record that a
// month closed short cannot be made to disappear, only answered.
export async function resolveVariance(formData: FormData) {
  const user = await requireUser()
  const month = String(formData.get('month') ?? '')
  if (user.role !== 'accountant' && user.role !== 'master') fail(month, 'Not authorized.')

  const id = String(formData.get('id') ?? '')
  const resolution = String(formData.get('resolution') ?? '').trim()
  if (!id) fail(month, 'Missing variance id.')
  // Same rule the override itself follows: a record of a dispute is only
  // worth keeping if it says what happened.
  if (!resolution) fail(month, 'Say what the outcome was — a variance with no answer is the thing this is meant to prevent.')

  const supabase = await createClient()
  const { error } = await supabase
    .from('statement_variances')
    .update({ resolution, resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', id)
    .is('resolved_at', null)

  if (error) fail(month, friendlyDbError(error.message))

  revalidatePath('/reconcile')
  revalidatePath('/reports')
  redirect(`/reconcile?month=${month}&resolved=1`)
}
