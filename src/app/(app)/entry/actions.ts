'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { PACKAGES, type PackageCode } from '@/lib/packages'

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
    points = Number(formData.get('points'))
    if (!points || points <= 0) fail('Please enter a valid top-up amount.')
    rate = dealer.rate
    const money = formData.get('money_rm')
    moneyRm = money ? Number(money) : Math.round(points * (1 - rate / 100) * 100) / 100
  }

  const simType = type === 'package' ? simTypeRaw || null : null

  const { data: insertedTx, error: txError } = await supabase
    .from('transactions')
    .insert({
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
    })
    .select('tx_date')
    .single()

  if (txError) fail(txError.message)

  if (type === 'package' && pkg) {
    // Packages bought the same day count as one batch (e.g. dealer buys A + B + C
    // together) — the dealer's rate should follow the BEST package in that batch,
    // not just whichever one happened to be keyed in last. A package bought on a
    // later day still overrides normally (per PROJECT_SPEC.md 3.3, upgrades and
    // downgrades both apply over time — this only resolves same-day ties).
    const { data: sameDayPkgs } = await supabase
      .from('transactions')
      .select('package')
      .eq('dealer_id', dealerId)
      .eq('type', 'package')
      .eq('tx_date', insertedTx!.tx_date)

    const bestPkg = (sameDayPkgs ?? [])
      .map((t) => t.package as PackageCode)
      .reduce((best, code) => (PACKAGES[code].rate > PACKAGES[best].rate ? code : best), pkg)

    const { error: updateError } = await supabase
      .from('dealers')
      .update({ package: bestPkg, rate: PACKAGES[bestPkg].rate })
      .eq('id', dealerId)

    if (updateError) fail('Transaction recorded, but updating the dealer package failed: ' + updateError.message)
  }

  revalidatePath('/records')
  revalidatePath('/dealers')
  redirect('/records?submitted=1')
}
