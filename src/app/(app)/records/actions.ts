'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { recomputeDealerRate } from '@/lib/dealer-rate'

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
