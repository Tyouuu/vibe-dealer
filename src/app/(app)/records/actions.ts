'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { recomputeDealerRate } from '@/lib/dealer-rate'
import { getAvailablePointsBalance } from '@/lib/credit-balance'
import { computeAdjustmentDelta } from '@/lib/adjustment'
import { todayInMalaysia } from '@/lib/month'
import { isPeriodLocked, isPeriodLockError, periodLockedMessage } from '@/lib/period-lock'
import { friendlyDbError } from '@/lib/db-error'

function fail(message: string): never {
  redirect('/records?error=' + encodeURIComponent(message))
}

export async function verifyTransaction(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') return

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()

  // Corrections used to be refused here unless a second person signed them —
  // see 0043 for why that rule is gone. Both recorded_by and verified_by are
  // still written, so a row the same person posted and signed says so.
  const { data: tx } = await supabase.from('transactions').select('type, recorded_by, tx_date').eq('id', id).maybeSingle()

  // Verifying a still-pending row inside a reconciled month moves that
  // month's verified total, which is exactly what the reconciliation signed
  // off on. Same gate as a new entry.
  if (tx?.tx_date && (await isPeriodLocked(supabase, tx.tx_date))) fail(periodLockedMessage(tx.tx_date))

  const { error } = await supabase
    .from('transactions')
    .update({ status: 'verified', verified_by: user.id })
    .eq('id', id)
    .eq('status', 'pending')

  if (error && isPeriodLockError(error.message) && tx?.tx_date) fail(periodLockedMessage(tx.tx_date))

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
  // Was a bare `return`: the dialog closed, nothing happened, and nothing said
  // why — the operator had every reason to believe the row was flagged. A
  // reason is required for the audit trail to be worth reading, so say so.
  if (!id) fail('Missing transaction id.')
  if (!reason) fail('A flag needs a reason — the audit log is only useful for tracing a dispute if it says why.')

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
    // Explicit, not the column default — see entry/actions.ts for why a
    // bare current_date (UTC session default) can misfile anything entered
    // roughly 12am-8am Malaysia time into the wrong calendar day.
    tx_date: todayInMalaysia(),
  })

  // A correction to a closed month deliberately posts in *today's* month
  // (prior-period adjustment), so it normally isn't affected by the lock at
  // all — this only trips if the current month has itself been reconciled.
  if (error && isPeriodLockError(error.message)) fail(periodLockedMessage(todayInMalaysia()))
  if (error) fail(friendlyDbError(error.message))

  revalidatePath('/records')
  revalidatePath('/dealers')
  revalidatePath('/reports')
  revalidatePath('/dashboard')
  revalidatePath('/purchases')
  redirect('/records?adjusted=1')
}

// Verify a selection in one go.
//
// A month with 242 dealers trading produces enough pending rows that verifying
// them one at a time is the bulk of an accountant's day: click Verify, answer
// the confirm, repeat. The app already has bulk selection on SIM Delivery, so
// the pattern exists — it just wasn't where the volume is.
//
// Rows in a reconciled month are refused here for the same reason a new entry
// there is, and they are counted and named rather than silently dropped —
// "18 verified" with no mention of the 2 that were not is how a batch action
// quietly loses work.
export async function verifyTransactions(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') fail('You do not have permission to verify transactions.')

  const ids = formData.getAll('ids').map(String).filter(Boolean)
  if (!ids.length) fail('Nothing was selected.')

  const supabase = await createClient()
  const { data: rows } = await supabase.from('transactions').select('id, type, status, recorded_by, tx_date').in('id', ids)

  const pending = (rows ?? []).filter((r) => r.status === 'pending')

  // One lookup per distinct month rather than per row — a batch of 200 rows
  // spans two or three months at most.
  const months = [...new Set(pending.map((r) => String(r.tx_date).slice(0, 7)))]
  const lockedMonths = new Set<string>()
  for (const m of months) {
    if (await isPeriodLocked(supabase, `${m}-01`)) lockedMonths.add(m)
  }

  const blockedIds = new Set(pending.filter((r) => lockedMonths.has(String(r.tx_date).slice(0, 7))).map((r) => r.id))
  const toVerify = pending.filter((r) => !blockedIds.has(r.id)).map((r) => r.id)

  let verified = 0
  if (toVerify.length) {
    // .eq('status','pending') as well as the id list: someone else may have
    // verified one of these between the read above and this write.
    const { data: updated, error } = await supabase
      .from('transactions')
      .update({ status: 'verified', verified_by: user.id })
      .in('id', toVerify)
      .eq('status', 'pending')
      .select('id')

    if (error) fail(friendlyDbError(error.message))
    verified = updated?.length ?? 0
  }

  revalidatePath('/records')
  revalidatePath('/reports')
  revalidatePath('/dashboard')
  redirect(`/records?verified=${verified}` + (lockedMonths.size ? `&locked=${[...lockedMonths].join(',')}` : ''))
}
