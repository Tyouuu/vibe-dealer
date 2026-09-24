'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createServiceClient } from '@/lib/supabase/service'
import { PACKAGES, type PackageCode } from '@/lib/packages'
import { ALLOWED_TYPES, MAX_BYTES } from '@/lib/vision-extract'
import { todayInMalaysia } from '@/lib/month'
import { reportToSentry } from '@/lib/sentry-report'
import { readSlipForRequest } from '@/lib/read-request-slip'

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
const MAX_PAID_FROM = 120
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

  // Sent once when the form opened and again with every attempt: the same key is the same request pressed
  // twice. Answered as a success, not an error — the dealer's first press DID work, and telling them their
  // second one failed would send them off to send a third.
  const rawKey = String(formData.get('client_key') ?? '')
  const clientKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawKey) ? rawKey : null
  if (clientKey) {
    const { data: already } = await supabase.from('topup_requests').select('id').eq('client_key', clientKey).maybeSingle()
    if (already) back(token, 'sent=1')
  }

  const type = String(formData.get('type') ?? '')
  const note = String(formData.get('note') ?? '').trim().slice(0, MAX_NOTE) || null
  const paidFrom = String(formData.get('paid_from') ?? '').trim().slice(0, MAX_PAID_FROM) || null

  let moneyRm: number | null = null
  let pkg: PackageCode | null = null
  let simType: 'physical' | 'esim' | null = null

  if (type === 'topup') {
    // A missing rate no longer refuses this. It used to, on the reasoning that
    // points cannot be priced without one — true of a transaction, but this is
    // not a transaction. 233 dealers have no package on file because nobody
    // recorded what they bought, and telling a paying dealer their own link
    // will not take their money is the wrong side of that gap to fail on.
    // Whoever accepts the request sets the rate first; /requests says so.
    moneyRm = Number(formData.get('money_rm'))
    if (!Number.isFinite(moneyRm) || moneyRm <= 0) fail(token, 'Please enter how much you transferred.')
    if (moneyRm > 1_000_000) fail(token, 'That amount looks wrong — please check it.')
    moneyRm = Math.round(moneyRm * 100) / 100
  } else if (type === 'package') {
    pkg = formData.get('package') as PackageCode
    if (!pkg || !(pkg in PACKAGES)) fail(token, 'Please choose a package.')
    const rawSimType = String(formData.get('sim_type') ?? '')
    if (rawSimType !== 'physical' && rawSimType !== 'esim') fail(token, 'Please choose physical cards or eSIM.')
    simType = rawSimType
  } else {
    fail(token, 'Please choose what you would like to request.')
  }

  // When the money moved. The form defaults it to today and caps it there;
  // this is the backstop, and it matches how /entry treats tx_date — a bad or
  // missing value falls back to today rather than throwing the whole
  // submission away, because today is what every request meant before this
  // field existed. A future date is the one thing rejected outright, since a
  // transfer that has not happened yet cannot be checked against a statement.
  const today = todayInMalaysia()
  const rawDate = String(formData.get('transfer_date') ?? '')
  const transferDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate <= today ? rawDate : today

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
      // This path has no signed-in user to notice a toast — a dealer just
      // sees "try again" and moves on. If this fails often it needs a human,
      // and the only way one finds out is Sentry.
      await reportToSentry(() =>
        Sentry.captureException(new Error(`[r/submit] slip upload failed: ${uploadError.message}`), { extra: { dealerId: dealer.id } })
      )
      fail(token, "Your image could not be uploaded. Try sending the request without it — we'll still check the bank.")
    }
    slipUrl = path
  }

  const { data: created, error } = await supabase
    .from('topup_requests')
    .insert({
      dealer_id: dealer.id,
      type,
      money_rm: moneyRm,
      package: pkg,
      sim_type: simType,
      transfer_date: transferDate,
      paid_from: paidFrom,
      note,
      slip_url: slipUrl,
      client_key: clientKey,
    })
    .select('id')
    .single()

  // Two presses landing together both passed the check above; the unique index (0059) let one through.
  if (error?.code === '23505' && clientKey) back(token, 'sent=1')

  if (error) {
    if (error.message.includes('too_many_pending_requests')) {
      fail(token, 'You already have 5 requests waiting for us. Please wait for those to be handled first.')
    }
    await reportToSentry(() =>
      Sentry.captureException(new Error(`[r/submit] insert failed: ${error.message}`), { extra: { dealerId: dealer.id } })
    )
    fail(token, "That didn't send. Please try again, or WhatsApp us.")
  }

  // Read the slip now, so whoever opens /requests finds it already checked. After the response: a slow or
  // failing model must never delay or break a dealer's Send.
  if (slipUrl && created?.id) {
    const requestId = created.id as string
    const path = slipUrl
    after(() => readSlipForRequest(requestId, path))
  }

  revalidatePath(`/r/${token}`)
  revalidatePath('/requests')
  back(token, 'sent=1')
}
