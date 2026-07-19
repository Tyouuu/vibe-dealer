'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { PACKAGES, COUPON_DENOMINATION_RM, type PackageCode } from '@/lib/packages'
import { recomputeDealerRate } from '@/lib/dealer-rate'
import { getAvailablePointsBalance } from '@/lib/credit-balance'
import { todayInMalaysia } from '@/lib/month'

function fail(message: string): never {
  redirect('/entry?error=' + encodeURIComponent(message))
}

export async function createTransaction(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') {
    fail('You do not have permission to enter transactions.')
  }

  const dealerId = String(formData.get('dealer_id') ?? '')
  const type = String(formData.get('type') ?? '') as 'package' | 'topup'
  const simTypeRaw = String(formData.get('sim_type') ?? '') as 'physical' | 'esim' | ''
  const note = String(formData.get('note') ?? '').trim() || null
  const receiptUrl = String(formData.get('receipt_url') ?? '').trim() || null

  if (!dealerId) fail('Please select a dealer.')
  if (type !== 'package' && type !== 'topup') fail('Please select a transaction type.')

  // The form defaults this to today and blocks future dates client-side —
  // that's only a UX nicety, this is the real backstop. Falls back to today
  // rather than rejecting outright if it's ever missing/malformed, since
  // "today" is what every submission used to mean before this field existed.
  const today = todayInMalaysia()
  const txDateRaw = String(formData.get('tx_date') ?? '')
  const txDate = /^\d{4}-\d{2}-\d{2}$/.test(txDateRaw) && txDateRaw <= today ? txDateRaw : today

  const supabase = await createClient()

  const { data: dealer, error: dealerError } = await supabase
    .from('dealers')
    .select('id, rate, package')
    .eq('id', dealerId)
    .single()

  if (dealerError || !dealer) fail('Dealer not found.')

  let points: number
  let moneyRm: number
  let rate: number
  let pkg: PackageCode | null = null

  if (type === 'package') {
    pkg = formData.get('package') as PackageCode
    if (!pkg || !(pkg in PACKAGES)) fail('Please select a package.')
    const def = PACKAGES[pkg]
    points = def.reload
    moneyRm = def.price
    rate = def.rate
  } else {
    if (dealer.rate == null) fail('This dealer has no package/rate yet — buy them a package first.')
    rate = dealer.rate
    // RM collected is the primary figure — that's the real money CS has in
    // hand — points is derived from it unless explicitly overridden, mirror
    // of the client-side calculation in entry-form.tsx.
    moneyRm = Number(formData.get('money_rm'))
    if (!moneyRm || moneyRm <= 0) fail('Please enter the amount collected.')
    const pointsOverride = formData.get('points')
    points = pointsOverride ? Number(pointsOverride) : Math.round(moneyRm / (1 - rate / 100))
  }

  if (!Number.isFinite(moneyRm) || moneyRm < 0) fail('Please enter a valid amount.')
  if (!Number.isFinite(points) || points <= 0) fail('Please enter a valid top-up amount.')

  // Same UX-nicety-vs-real-backstop split as the date field above — the form
  // already blocks a non-multiple/over-total coupon amount client-side.
  // Package purchases don't have this field at all (always direct/eSIM or
  // physical-SIM delivery, never coupon), so it's a no-op for them.
  const couponRmRaw = type === 'topup' ? Number(formData.get('coupon_rm')) : 0
  const couponRm = Number.isFinite(couponRmRaw) && couponRmRaw > 0 ? couponRmRaw : 0
  if (couponRm % COUPON_DENOMINATION_RM !== 0) fail(`Coupon amount must be a multiple of RM${COUPON_DENOMINATION_RM}.`)
  if (couponRm > moneyRm) fail('Coupon amount cannot exceed the total amount collected.')

  // Every point given to a dealer (package or top-up alike) has to come from
  // stock master dealer already bought from Vibe Mobile — block the entry
  // outright if it would oversell what's actually on hand.
  const { available } = await getAvailablePointsBalance(supabase)
  if (points > available) {
    fail(
      `Not enough credit balance: ${available.toLocaleString()} pts available, this needs ${points.toLocaleString()} pts. Log a Credit Purchase first.`
    )
  }

  const simType = type === 'package' ? simTypeRaw || null : null
  const idempotencyKey = String(formData.get('idempotency_key') ?? '').trim() || null

  const { error: txError } = await supabase.from('transactions').insert({
    dealer_id: dealerId,
    type,
    package: pkg,
    points,
    money_rm: moneyRm,
    rate,
    sim_type: simType,
    delivery_status: simType === 'physical' ? 'pending' : 'na',
    receipt_url: receiptUrl,
    note,
    recorded_by: user.id,
    idempotency_key: idempotencyKey,
    tx_date: txDate,
    coupon_rm: couponRm,
  })

  // 23505 = unique_violation. A retry (slow-network resubmit, double-click
  // before the form unmounts) sends the same idempotency_key as an already-
  // successful attempt — that's not a real failure, the transaction already
  // exists, so this falls through to the normal success redirect below
  // instead of showing an error and letting someone resubmit a third time.
  if (txError && txError.code !== '23505') fail(txError.message)

  if (type === 'package' && pkg) {
    // Packages bought the same day count as one batch (e.g. dealer buys A + B + C
    // together) — the dealer's rate should follow the BEST package in that batch,
    // not just whichever one happened to be keyed in last. A package bought on a
    // later day still overrides normally (per PROJECT_SPEC.md 3.3, upgrades and
    // downgrades both apply over time — this only resolves same-day ties).
    const { error: updateError } = await recomputeDealerRate(supabase, dealerId, user.id)

    if (updateError) fail('Transaction recorded, but updating the dealer package failed: ' + updateError.message)
  }

  revalidatePath('/records')
  revalidatePath('/dealers')
  redirect('/records?submitted=1')
}
