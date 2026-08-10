'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { friendlyDbError } from '@/lib/db-error'
import { parseBusinessDate, todayInMalaysia } from '@/lib/month'
import { isPeriodLocked, isPeriodLockError, periodLockedMessage } from '@/lib/period-lock'
import { uploadReceipt } from '@/lib/receipt-upload'

// Errors go back to the page the form is actually on. The form moved to
// /purchases/new when Log Purchase became its own sidebar entry, and this kept
// redirecting to /purchases — so a single bad field threw the operator onto a
// different page and discarded everything they had typed, while the error
// block on /purchases/new could never fire at all.
function fail(message: string): never {
  redirect('/purchases/new?error=' + encodeURIComponent(message))
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

  if (!Number.isFinite(moneyRm) || moneyRm < 0) fail('Please enter a valid amount.')
  if (!Number.isFinite(points) || points <= 0) fail('Please enter a valid points amount.')

  const supabase = await createClient()

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
