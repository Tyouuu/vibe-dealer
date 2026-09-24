import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { collectImages, describeFailure, isCollectFailure, isServiceUnavailable, readImages } from '@/lib/vision-extract'
import { findRecordedReference } from '@/lib/reference-duplicate'
import {
  SLIP_EXTRACTION_PROMPT,
  SLIP_EXTRACTION_SCHEMA,
  SLIP_EXTRACTION_SYSTEM,
  type ExtractedSlip,
  type ReadResponse,
} from '@/lib/slip-extract'

// Read the payment slip somebody has just attached to an entry form, so the amount, the date and the
// bank's own reference are taken off the slip rather than typed from it — and so that the number typed
// can be checked against a second, independent source before it becomes a ledger row.
//
// What comes back is a reading, never a decision. The form fills its own empty fields and says what it
// filled; nothing is saved by this route, and a reading the person disagrees with is overwritten by
// them. The model is not trusted with money: the amount is the one field every model got right across
// clean and photographed slips in the bake-off (vision-extract.ts), and it is the field the form
// compares against what was typed, but the date and reference come back confidently wrong on a photo of
// a screen — which is why nothing here is written anywhere without a person pressing Submit.
//
// It also answers the question the person cannot: has this slip already been recorded? A bank prints a
// different reference on every transfer, so the same reference on a second entry is one payment counted
// twice — points handed out twice for money received once. Told at the moment the slip is attached, not
// after four fields have been typed.
//
// Same boundary as the other two read routes: role guard, rate limit, key check. cs is refused — a slip
// carries an amount, and cs has no financial visibility.

export async function POST(request: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Receipt reading is not configured yet.' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `slipfile:${user.id}`,
    p_max_hits: 60,
    p_window_seconds: 60 * 60,
  })
  if (allowed === false) {
    return NextResponse.json({ error: 'Too many receipt reads this hour — type the figures in, or try again later.' }, { status: 429 })
  }

  const formData = await request.formData()
  const target = formData.get('target') === 'purchase' ? 'purchase' : 'entry'
  const images = await collectImages(formData, 1)
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
    console.error('[receipts/read] read failed:', describeFailure(err))
    // Said differently, because the remedy is: retaking the photo will never help when the service is down.
    if (isServiceUnavailable(err)) {
      return NextResponse.json(
        { error: 'Slip reading is unavailable right now — type the figures in. (Nothing is wrong with the picture; ask your admin to check the AI service.)' },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: "Couldn't read that slip — type the figures in." }, { status: 502 })
  }

  return NextResponse.json({ slip, duplicate: await findRecordedReference(supabase, target, slip.reference) } satisfies ReadResponse)
}
