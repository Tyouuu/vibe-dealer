'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { friendlyDbError } from '@/lib/db-error'
import { parseBusinessDate, todayInMalaysia } from '@/lib/month'
import { isPeriodLocked, isPeriodLockError, periodLockedMessage } from '@/lib/period-lock'
import { uploadReceipt } from '@/lib/receipt-upload'
import { findRecordedReference } from '@/lib/reference-duplicate'
import { formatMYR } from '@/lib/money'

// Errors go back to the page the form is actually on. The form moved to
// /purchases/new when Log Purchase became its own sidebar entry, and this kept
// redirecting to /purchases — so a single bad field threw the operator onto a
// different page and discarded everything they had typed, while the error
// block on /purchases/new could never fire at all.
function fail(message: string): never {
  redirect('/purchases/new?error=' + encodeURIComponent(message))
}

// adjustCreditPurchase's modal lives on /purchases itself, not the Log
// Purchase form — same split, different page.
function failOnLedger(message: string): never {
  redirect('/purchases?error=' + encodeURIComponent(message))
}

export async function recordCreditPurchase(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') {
    fail('You do not have permission to log credit purchases.')
  }

  // Was a bare non-empty check, so any text at all reached Postgres and a
  // purchase could be dated in the future. Same backstop createTransaction has
  // always had, now shared — see parseBusinessDate.
  const purchaseDate = parseBusinessDate(formData.get('purchase_date'), todayInMalaysia())
  if (!purchaseDate) fail('Please choose a valid purchase date — it cannot be in the future.')

  const moneyRm = Number(formData.get('money_rm'))
  const points = Number(formData.get('points'))
  const note = String(formData.get('note') ?? '').trim() || null
  const reference = String(formData.get('reference') ?? '').trim().slice(0, 80) || null

  if (!Number.isFinite(moneyRm) || moneyRm < 0) fail('Please enter a valid amount.')
  if (!Number.isFinite(points) || points <= 0) fail('Please enter a valid points amount.')

  const supabase = await createClient()

  // The same invoice logged twice puts credit in the ledger that was only ever bought once — credit that
  // does not exist, which is the one error that lets the business sell what it does not have. So a
  // reference already on a purchase is refused, not warned about.
  if (reference) {
    const same = await findRecordedReference(supabase, 'purchase', reference)
    if (same) {
      fail(
        `That invoice or transfer reference (${reference}) is already on a purchase of ${formatMYR(same.moneyRm)} dated ${same.date}. ` +
          'Logging it again would add the same credit twice. If this is a different purchase, clear the reference and save again.',
      )
    }
  }

  // A purchase carries the month's opening and closing points balance on the
  // Monthly Report, so backdating one into a reconciled month moves a ledger
  // that has already been signed off. Migration 0032 enforces this; checking
  // here first turns the trigger's text into the same sentence a late
  // transaction gets.
  if (await isPeriodLocked(supabase, purchaseDate)) fail(periodLockedMessage(purchaseDate))

  // After the period-lock check, so a purchase that is going to be refused
  // does not leave a stray file behind in the bucket.
  const receipt = await uploadReceipt(supabase, formData, 'credit-purchases')
  if (receipt.error) fail(receipt.error)

  const { error } = await supabase.from('credit_purchases').insert({
    purchase_date: purchaseDate,
    money_rm: moneyRm,
    points,
    note,
    reference,
    receipt_url: receipt.path,
    recorded_by: user.id,
  })

  if (error && isPeriodLockError(error.message)) fail(periodLockedMessage(purchaseDate))
  if (error) fail(friendlyDbError(error.message))

  revalidatePath('/purchases')
  revalidatePath('/purchases/new')
  revalidatePath('/reports')
  // Lands on the ledger, where the new balance and the purchase both appear.
  redirect('/purchases?saved=1')
}

// The correcting-entry counterpart to Transactions' adjustTransaction
// (records/actions.ts) and the same research (docs/research-transaction-
// corrections.md) — a credit purchase has no pending/verified lifecycle to
// flag instead, so this is the only correction path it needs. Posts a new,
// linked row carrying only the delta; the original is never touched.
export async function adjustCreditPurchase(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') {
    failOnLedger('You do not have permission to correct a credit purchase.')
  }

  const originalId = String(formData.get('original_id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  const newPoints = Number(formData.get('new_points'))
  const newMoneyRm = Number(formData.get('new_money_rm'))

  if (!originalId || !reason) failOnLedger('A correction needs a reason.')
  if (!Number.isFinite(newPoints) || newPoints < 0) failOnLedger('Enter a valid points value.')
  if (!Number.isFinite(newMoneyRm) || newMoneyRm < 0) failOnLedger('Enter a valid RM value.')

  const supabase = await createClient()

  const { data: original } = await supabase
    .from('credit_purchases')
    .select('id, points, money_rm, adjusts_id')
    .eq('id', originalId)
    .single()

  if (!original) failOnLedger('Original purchase not found.')
  if (original.adjusts_id) failOnLedger('This is already a correction — correct the original purchase it points to instead.')

  const deltaPoints = Math.round((newPoints - Number(original.points)) * 100) / 100
  const deltaMoneyRm = Math.round((newMoneyRm - Number(original.money_rm)) * 100) / 100
  if (deltaPoints === 0 && deltaMoneyRm === 0) failOnLedger('That matches what is already on record — nothing to adjust.')

  // Same "today, not backdated" rule adjustTransaction follows: a correction
  // to a closed month deliberately posts in the currently-open one, so
  // trg_enforce_period_lock_credit_purchases (0032) normally leaves it alone —
  // this only trips if the current month has itself been reconciled.
  const today = todayInMalaysia()
  const { error } = await supabase.from('credit_purchases').insert({
    purchase_date: today,
    money_rm: deltaMoneyRm,
    points: deltaPoints,
    note: reason,
    adjusts_id: original.id,
    recorded_by: user.id,
  })

  if (error && isPeriodLockError(error.message)) failOnLedger(periodLockedMessage(today))
  if (error) failOnLedger(friendlyDbError(error.message))

  revalidatePath('/purchases')
  revalidatePath('/reports')
  redirect('/purchases?adjusted=1')
}
