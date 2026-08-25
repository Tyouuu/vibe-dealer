import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { describeFailure, isServiceUnavailable, readImages } from '@/lib/vision-extract'
import { SLIP_EXTRACTION_PROMPT, SLIP_EXTRACTION_SCHEMA, SLIP_EXTRACTION_SYSTEM, type ExtractedSlip } from '@/lib/slip-extract'

// Read the slip a dealer attached to a request, and record what it says.
//
// Unlike the other two extract routes, the image does not arrive in the
// request body — it is already in the private `receipts` bucket, put there by
// the dealer at submit time (0042). So this takes an id, fetches the object
// server-side, and writes the answer back onto the row. The reviewer never
// uploads anything and never sees a signed URL they did not ask for.
//
// Staff-triggered rather than automatic on submit. Submitting is a public,
// token-authenticated action with no throttle in front of it, and hanging a
// billed model call off it would let anyone holding one dealer link spend
// money. A reviewer pressing a button is the same shape the other two OCR
// routes already have: role guard, rate limit, key check.
export async function POST(request: NextRequest) {
  const user = await requireUser()
  // Same boundary as the rest of this queue: a slip carries an amount, and cs
  // has no financial visibility. record_slip_reading (0046) enforces this
  // again in the database.
  if (user.role !== 'accountant' && user.role !== 'master') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Receipt reading is not configured yet.' }, { status: 503 })
  }

  const { requestId } = (await request.json().catch(() => ({}))) as { requestId?: string }
  if (!requestId) return NextResponse.json({ error: 'Which request?' }, { status: 400 })

  const supabase = await createClient()

  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `slip:${user.id}`,
    p_max_hits: 40,
    p_window_seconds: 60 * 60,
  })
  if (allowed === false) {
    return NextResponse.json({ error: 'Too many receipt reads this hour — open the image instead, or try again later.' }, { status: 429 })
  }

  const { data: row } = await supabase.from('topup_requests').select('id, slip_url').eq('id', requestId).maybeSingle()
  if (!row) return NextResponse.json({ error: 'That request no longer exists.' }, { status: 404 })
  if (!row.slip_url) return NextResponse.json({ error: 'That request has no receipt attached.' }, { status: 400 })

  const { data: blob, error: downloadError } = await supabase.storage.from('receipts').download(row.slip_url)
  if (downloadError || !blob) {
    console.error('[requests/read-slip] download failed:', downloadError?.message)
    return NextResponse.json({ error: 'The receipt image could not be opened.' }, { status: 502 })
  }

  const buffer = Buffer.from(await blob.arrayBuffer())
  const mediaType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg'

  try {
    const parsed = await readImages<ExtractedSlip>({
      images: [{ media_type: mediaType, data: buffer.toString('base64') }],
      system: SLIP_EXTRACTION_SYSTEM,
      prompt: SLIP_EXTRACTION_PROMPT,
      schema: SLIP_EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
    })

    const { error } = await supabase.rpc('record_slip_reading', {
      p_request_id: requestId,
      p_amount_rm: parsed.amount_rm,
      p_paid_on: parsed.paid_on,
      p_bank: parsed.bank,
      p_reference: parsed.reference,
      p_error: null,
    })
    if (error) {
      console.error('[requests/read-slip] record failed:', error.message)
      return NextResponse.json({ error: 'Read it, but could not save the result.' }, { status: 502 })
    }
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[requests/read-slip] slip read failed:', describeFailure(err))

    // The failure is recorded on the row either way, so the queue can say
    // "we tried and it did not work" rather than looking like nobody has
    // pressed the button yet.
    const unavailable = isServiceUnavailable(err)
    await supabase.rpc('record_slip_reading', {
      p_request_id: requestId,
      p_amount_rm: null,
      p_paid_on: null,
      p_bank: null,
      p_reference: null,
      p_error: unavailable ? 'service unavailable' : 'could not read the image',
    })

    if (unavailable) {
      return NextResponse.json(
        { error: 'Receipt reading is unavailable right now — open the image and check it yourself. (Nothing is wrong with the picture; ask your admin to check the AI service.)' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: "Couldn't read that receipt — open the image and check it yourself." }, { status: 502 })
  }
}
