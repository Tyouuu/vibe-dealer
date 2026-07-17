'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { recomputeDealerRate } from '@/lib/dealer-rate'
import { getAvailablePointsBalance } from '@/lib/credit-balance'
import { computeAdjustmentDelta } from '@/lib/adjustment'

function fail(message: string): never {
  redirect('/records?error=' + encodeURIComponent(message))
}

export async function verifyTransaction(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') return

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase
    .from('transactions')
    .update({ status: 'verified', verified_by: user.id })
    .eq('id', id)
    .eq('status', 'pending')

  revalidatePath('/records')
}

// Flags a mis-entered transaction so it's excluded from reports/reconciliation
// (those only count status='verified'). Scoped to status='pending' only — a
// verified transaction may already be baked into a month's reconciled totals,
// and unwinding that needs a more deliberate correction flow than this.
// Requires a reason — who flagged it was already recorded, but not why, and
// the audit log is only actually useful for tracing a dispute if it says both.
export async function flagTransaction(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') return

  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (!id || !reason) return

  const supabase = await createClient()

  const { data: tx } = await supabase
    .from('transactions')
    // verified_by is repurposed here as "last staff member to change this
    // transaction's status", not strictly "who verified it" — recording it
    // on flag too so the audit trail shows who flagged the transaction.
    .update({ status: 'flagged', verified_by: user.id, flag_reason: reason })
    .eq('id', id)
    .eq('status', 'pending')
    .select('dealer_id, type')
    .maybeSingle()

  // A flagged package purchase may have been the one driving the dealer's
  // current rate — recompute it from whatever package transactions remain.
  if (tx?.type === 'package') {
    await recomputeDealerRate(supabase, tx.dealer_id, user.id)
  }

  revalidatePath('/records')
  revalidatePath('/dealers')
}

// The correcting-entry counterpart to Flag: for a transaction that's already
// verified (locked into a month's reconciliation), post a *new* linked
// transaction carrying only the delta rather than editing the original —
// see docs/research-transaction-corrections.md. The accountant enters what
// the amount *should* have been; the delta against what's on record now is
// computed here, server-side, off a fresh read — never trust a client-sent
// delta or stale original values.
export async function adjustTransaction(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') return

  const originalId = String(formData.get('original_id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  const newPoints = Number(formData.get('new_points'))
  const newMoneyRm = Number(formData.get('new_money_rm'))

  if (!originalId || !reason) fail('An adjustment needs a reason.')
  if (!Number.isFinite(newPoints) || newPoints < 0) fail('Enter a valid points value.')
  if (!Number.isFinite(newMoneyRm) || newMoneyRm < 0) fail('Enter a valid RM value.')

  const supabase = await createClient()

  const { data: original } = await supabase
    .from('transactions')
    .select('id, dealer_id, type, package, rate, status, points, money_rm')
    .eq('id', originalId)
    .single()

  if (!original) fail('Original transaction not found.')
  if (original.status !== 'verified') fail('Only verified transactions can be adjusted — pending ones should be flagged instead.')
  if (original.type === 'adjustment') fail('This is already an adjustment — correct the original transaction it points to instead.')

  const { deltaPoints, deltaMoneyRm } = computeAdjustmentDelta(
    { points: Number(original.points), money_rm: Number(original.money_rm) },
    { points: newPoints, money_rm: newMoneyRm }
  )
  if (deltaPoints === 0 && deltaMoneyRm === 0) fail('That matches what is already on record — nothing to adjust.')

  if (deltaPoints > 0) {
    const { available } = await getAvailablePointsBalance(supabase)
    if (deltaPoints > available) {
      fail(`Not enough credit balance: ${available.toLocaleString()} pts available, this adjustment needs ${deltaPoints.toLocaleString()} more pts.`)
    }
  }

  const { error } = await supabase.from('transactions').insert({
    dealer_id: original.dealer_id,
    type: 'adjustment',
    package: original.package,
    points: deltaPoints,
    money_rm: deltaMoneyRm,
    rate: original.rate,
    adjusts_id: original.id,
    sim_type: null,
    delivery_status: 'na',
    status: 'pending',
    recorded_by: user.id,
    note: reason,
  })

  if (error) fail(error.message)

  revalidatePath('/records')
  revalidatePath('/dealers')
  revalidatePath('/reports')
  revalidatePath('/dashboard')
  revalidatePath('/purchases')
  redirect('/records?adjusted=1')
}
