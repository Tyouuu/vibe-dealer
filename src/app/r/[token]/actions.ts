'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { PACKAGES, type PackageCode } from '@/lib/packages'
import { ALLOWED_TYPES, MAX_BYTES } from '@/lib/vision-extract'

// The one write path a dealer has, and the only place in this app where an
// unauthenticated caller causes a row to exist.
//
// It runs with the service role rather than exposing the table to anon,
// because a table anon cannot address has no PostgREST surface to get wrong —
// see 0042's comment, and 0038 and 0041 for why that matters here. Everything
// this action is allowed to write is fixed in code below: a dealer id resolved
// from the token, a type, an amount, a note. Nothing the caller sends chooses
// a column.
//
// What it cannot do is as important as what it can. It cannot touch
// `transactions`, cannot set a rate, cannot move the credit balance, and
// cannot mark anything accepted. A request is a claim, and it stays a claim
// until a person opens /requests and puts it through /entry.

const MAX_NOTE = 500
const RATE_LIMIT_PER_HOUR = 10

function back(token: string, params: string): never {
  redirect(`/r/${encodeURIComponent(token)}?${params}`)
}

function fail(token: string, message: string): never {
  back(token, 'error=' + encodeURIComponent(message))
}

export async function submitRequest(formData: FormData) {
  const token = String(formData.get('token') ?? '').trim()
  if (!token) redirect('/login')

  const supabase = createServiceClient()

  // Keyed on the token, not on an IP: an IP is shared by every dealer behind
  // one mobile carrier's NAT, and the thing worth limiting is one link, not
  // one network.
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `submit:${token}`,
    p_max_hits: RATE_LIMIT_PER_HOUR,
    p_window_seconds: 60 * 60,
  })
  if (allowed === false) {
    fail(token, 'Too many requests from this link in the last hour. Please WhatsApp us instead.')
  }

  const { data: dealer } = await supabase
    .from('dealers')
    .select('id, company_name, rate, status')
    .eq('submit_token', token)
    .maybeSingle()

  // Same sentence for a token that never existed and one belonging to a dealer
  // who has been switched off. Telling the difference apart out loud would let
  // anyone with a list of guesses learn which ones are real.
  if (!dealer || dealer.status !== 'active') {
    fail(token, 'This link is no longer active. Please contact us.')
  }

  const type = String(formData.get('type') ?? '')
  const note = String(formData.get('note') ?? '').trim().slice(0, MAX_NOTE) || null

  let moneyRm: number | null = null
  let pkg: PackageCode | null = null

  if (type === 'topup') {
    // The same refusal /entry makes, made earlier and in the dealer's own
    // words. Without a rate there is no way to price the points their money
    // buys, so the request could not be accepted even if it were submitted.
    if (dealer.rate == null) {
      fail(token, 'Your account does not have a package yet, so a top-up cannot be requested. Please choose a package below.')
    }
    moneyRm = Number(formData.get('money_rm'))
    if (!Number.isFinite(moneyRm) || moneyRm <= 0) fail(token, 'Please enter how much you transferred.')
    if (moneyRm > 1_000_000) fail(token, 'That amount looks wrong — please check it.')
    moneyRm = Math.round(moneyRm * 100) / 100
  } else if (type === 'package') {
    pkg = formData.get('package') as PackageCode
    if (!pkg || !(pkg in PACKAGES)) fail(token, 'Please choose a package.')
  } else {
    fail(token, 'Please choose what you would like to request.')
  }

  // The payment slip, if they attached one. Optional on purpose: staff check
  // the bank regardless, so a missing slip must never be a reason a request
  // cannot be sent.
  let slipUrl: string | null = null
  const slip = formData.get('slip')
  if (slip instanceof File && slip.size > 0) {
    if (slip.size > MAX_BYTES) fail(token, 'That image is too large (max 10MB).')
    if (!ALLOWED_TYPES.has(slip.type)) fail(token, 'Please attach a JPEG, PNG, WEBP or GIF image.')

    const extension = slip.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
    // Under the dealer's own id, in the same private bucket staff receipts
    // already use (0002, 0019) — so viewing one goes through the existing
    // signed-URL route and nothing new is ever publicly readable.
    const path = `requests/${dealer.id}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('receipts').upload(path, slip, { contentType: slip.type })
    if (uploadError) {
      console.error('[r/submit] slip upload failed:', uploadError.message)
      fail(token, "Your image could not be uploaded. Try sending the request without it — we'll still check the bank.")
    }
    slipUrl = path
  }

  const { error } = await supabase.from('topup_requests').insert({
    dealer_id: dealer.id,
    type,
    money_rm: moneyRm,
    package: pkg,
    note,
    slip_url: slipUrl,
  })

  if (error) {
    if (error.message.includes('too_many_pending_requests')) {
      fail(token, 'You already have 5 requests waiting for us. Please wait for those to be handled first.')
    }
    console.error('[r/submit] insert failed:', error.message)
    fail(token, "That didn't send. Please try again, or WhatsApp us.")
  }

  revalidatePath(`/r/${token}`)
  revalidatePath('/requests')
  back(token, 'sent=1')
}
