'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { PACKAGES, COUPON_DENOMINATION_RM, type PackageCode } from '@/lib/packages'
import { recomputeDealerRate } from '@/lib/dealer-rate'
import { getAvailablePointsBalance } from '@/lib/credit-balance'
import { todayInMalaysia } from '@/lib/month'
import { isPeriodLocked, isPeriodLockError, periodLockedMessage } from '@/lib/period-lock'
import { friendlyDbError } from '@/lib/db-error'

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

  // Backdating is normal here (tx_date is when the sale happened, not when
  // it's keyed in), so a submission can legitimately target a month that has
  // since been reconciled — which would silently invalidate that
  // reconciliation. Checked before doing any other work so the operator gets
  // a useful message rather than a raw trigger error from 0031.
  if (await isPeriodLocked(supabase, txDate)) fail(periodLockedMessage(txDate))

  const { data: dealer, error: dealerError } = await supabase
    .from('dealers')
    .select('id, rate, package, status')
    .eq('id', dealerId)
    .single()

  if (dealerError || !dealer) fail('Dealer not found.')
  // Checked here and not only in the picker: the picker is a list of options
  // and this is the record being written. A dealer id can arrive from a
  // bookmarked ?dealer= link, a stale tab, or anything that is not the list.
  if (dealer.status !== 'active') fail('This dealer is switched off — switch them back on before recording anything against them.')

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
  // Lost the race: the month was reconciled between the check above and this
  // insert. The trigger is the authority, so translate its error rather than
  // leaking raw Postgres text.
  // The other thing the database can refuse here is the credit-balance
  // trigger from 0016, when a concurrent sale wins the advisory lock after the
  // app-layer check above already passed. That used to reach the screen as
  // `insufficient_credit_balance: 21501 pts available, 30000 pts requested` —
  // the period-lock case had been given a human sentence and this one hadn't.
  if (txError && isPeriodLockError(txError.message)) fail(periodLockedMessage(txDate))
  if (txError && txError.code !== '23505') fail(friendlyDbError(txError.message))

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
  // Sales arrive in runs — one dealer settles several top-ups at once — and
  // the form already knows how to open on a given dealer with their last
  // amount filled in (`/entry?dealer=`). It just had no way of being told to,
  // so every second entry in a run started from the full 284-name list again.
  // Carrying the dealer through lets the success banner offer the next one.
  // Not `dealer=`: that parameter already filters this page, so reusing it
  // would silently narrow the list to one dealer right after saving and read
  // as "where did everything else go".
  redirect('/records?submitted=1&just=' + dealerId)
}

// Has this sale already been recorded in the last few hours?
//
// The form already carries an idempotency_key, but that only defends against
// one form instance being submitted twice — a slow network, a double click.
// It cannot see the case that actually happens in an office with three people
// on one ledger: the accountant records Ipoh Demo RM 1,128 in the morning and
// CS, not knowing, records it again after lunch. Two form instances, two keys,
// two rows, and the dealer is credited twice.
//
// A warning, not a block. A dealer genuinely can top up twice in a day for the
// same amount, so the only honest thing to do is say what already exists and
// let the person deciding decide.
export type RecentMatch = { recordedByName: string; hoursAgo: number; points: number }

const DUPLICATE_WINDOW_HOURS = 12

export async function findRecentDuplicate(dealerId: string, moneyRm: number): Promise<RecentMatch | null> {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') return null
  if (!dealerId || !Number.isFinite(moneyRm) || moneyRm <= 0) return null

  const supabase = await createClient()
  const since = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 3600_000).toISOString()

  // Flagged rows are excluded: one that has already been marked wrong is not
  // evidence that this one is a duplicate — it may well be the correction.
  const { data } = await supabase
    .from('transactions')
    .select('points, created_at, recorded_by')
    .eq('dealer_id', dealerId)
    .eq('money_rm', moneyRm)
    .neq('status', 'flagged')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  const { data: profile } = await supabase.from('staff_directory').select('display_name').eq('id', data.recorded_by).maybeSingle()

  return {
    recordedByName: profile?.display_name ?? 'someone',
    hoursAgo: Math.max(0, Math.round((Date.now() - new Date(data.created_at).getTime()) / 3600_000)),
    points: Number(data.points),
  }
}
