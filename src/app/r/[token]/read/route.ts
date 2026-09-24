import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { collectImages, describeFailure, isCollectFailure, isServiceUnavailable, readImages } from '@/lib/vision-extract'
import {
  isComparableReference,
  referenceKey,
  SLIP_EXTRACTION_PROMPT,
  SLIP_EXTRACTION_SCHEMA,
  SLIP_EXTRACTION_SYSTEM,
  type DealerSlipReading,
  type ExtractedSlip,
} from '@/lib/slip-extract'

// Read the transfer slip a dealer has just attached to their own request, so the amount and date on their
// form come from the bank's slip rather than from their thumbs — and so a typo is caught by the dealer, in
// the shop, while they can still fix it, instead of by staff a day later.
//
// This is the one billed model call a person outside the company can cause, which is why it is fenced
// twice and why it sits where it does:
//
//   * The link's token is checked FIRST, before any limit is touched, so a stranger guessing addresses can
//     neither spend the money nor use up the shared allowance that real dealers depend on.
//   * Then two limits: a small one per link (a dealer has one slip, maybe two attempts) and a global one
//     for the whole page. A dealer who runs out simply types the amount — the form works without this.
//
// It is a convenience and never a gate. It saves nothing: the request is only created when the dealer
// presses Send, and staff read the slip again themselves at that point (submitRequest), so nothing a dealer's
// browser says about its own reading is ever trusted. It answers with the four fields the form needs — never
// the recipient's account, never anything about any other dealer. "Already sent" is a yes or a no, not who.
//
// Under /r/ so the session middleware leaves it public, the same as the page it serves.

const PER_LINK_PER_HOUR = 8
const ALL_LINKS_PER_HOUR = 300

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServiceClient()

  const { data: dealer } = await supabase.from('dealers').select('id, status').eq('submit_token', token).maybeSingle()
  // The same answer for a link that never existed and one that has been switched off.
  if (!dealer || dealer.status !== 'active') {
    return NextResponse.json({ error: 'This link is no longer active.' }, { status: 404 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'We cannot read slips right now — please type the amount.' }, { status: 503 })
  }

  const [{ data: linkOk }, { data: allOk }] = await Promise.all([
    supabase.rpc('check_rate_limit', { p_key: `slip-read:${token}`, p_max_hits: PER_LINK_PER_HOUR, p_window_seconds: 3600 }),
    supabase.rpc('check_rate_limit', { p_key: 'slip-read:all', p_max_hits: ALL_LINKS_PER_HOUR, p_window_seconds: 3600 }),
  ])
  if (linkOk === false || allOk === false) {
    return NextResponse.json({ error: 'Too many tries — please type the amount instead.' }, { status: 429 })
  }

  const images = await collectImages(await request.formData(), 1)
  if (isCollectFailure(images)) return NextResponse.json({ error: images.error }, { status: images.status })

  let slip: ExtractedSlip
  try {
    slip = await readImages<ExtractedSlip>({
      images,
      system: SLIP_EXTRACTION_SYSTEM,
      prompt: SLIP_EXTRACTION_PROMPT,
      schema: SLIP_EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
    })
  } catch (err) {
    console.error('[r/read] slip read failed:', describeFailure(err))
    // Told apart, because the dealer's next move differs: a blurry picture is worth retaking, a service that
    // is down is not — and a dealer blamed for a fault that is ours retakes the photo forever.
    return NextResponse.json(
      {
        error: isServiceUnavailable(err)
          ? 'We cannot read slips right now — please type the amount. Nothing is wrong with your picture.'
          : "We couldn't read that picture — please type the amount, or try a clearer photo.",
      },
      { status: isServiceUnavailable(err) ? 503 : 502 },
    )
  }

  let alreadySent = false
  if (isComparableReference(slip.reference)) {
    const key = referenceKey(slip.reference)
    const [{ data: entry }, { data: theirs }] = await Promise.all([
      supabase.from('transactions').select('id').eq('dealer_id', dealer.id).eq('reference_key', key).neq('status', 'flagged').limit(1).maybeSingle(),
      // Only this dealer's own: another dealer's slip is not something this page should confirm exists.
      supabase.from('topup_requests').select('slip_reference, paid_from').eq('dealer_id', dealer.id).order('created_at', { ascending: false }).limit(50),
    ])
    alreadySent =
      Boolean(entry) ||
      (theirs ?? []).some((r) => referenceKey(r.slip_reference as string | null) === key || referenceKey(r.paid_from as string | null).includes(key))
  }

  return NextResponse.json({
    slip: { amount_rm: slip.amount_rm, paid_on: slip.paid_on, bank: slip.bank, reference: slip.reference },
    alreadySent,
  } satisfies DealerSlipReading)
}
