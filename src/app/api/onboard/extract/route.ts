import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { collectImages, describeFailure, isCollectFailure, isServiceUnavailable, readImages } from '@/lib/vision-extract'
import {
  DEALER_EXTRACTION_PROMPT,
  DEALER_EXTRACTION_SCHEMA,
  DEALER_EXTRACTION_SYSTEM,
  isEmptyExtraction,
  normalizeExtractedDealer,
  type ExtractedDealer,
} from '@/lib/dealer-extract'

// Reads WhatsApp screenshots of a new shop giving its details, and fills in
// the onboarding form. Same idea as /api/reconcile/extract, and the same
// plumbing underneath — this one only differs in who may call it, what it
// looks for, and how many images it takes.
//
// Four images, because a conversation where someone sends their company name,
// then their number, then a photo of their SSM certificate, then the address,
// does not fit on one screen. One image was the reconcile route's answer
// because a statement is one page.
const MAX_IMAGES = 4

export async function POST(request: NextRequest) {
  const user = await requireUser()
  // Whoever may onboard a dealer may read a screenshot into the form — cs and
  // master, matching /onboard and createDealer. An accountant cannot onboard,
  // so filling that form in for them would be a dead end.
  if (user.role !== 'cs' && user.role !== 'master') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Screenshot reading is not configured yet.' }, { status: 503 })
  }

  // A separate budget from `ocr:` on purpose. Onboarding happens in bursts —
  // a run of new shops in one afternoon — and month-end reconciliation must
  // not find its allowance already spent by somebody else's morning.
  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `onboard-ocr:${user.id}`,
    p_max_hits: 20,
    p_window_seconds: 60 * 60,
  })
  if (allowed === false) {
    return NextResponse.json(
      { error: 'Too many screenshot reads this hour — fill the form in by hand, or try again later.' },
      { status: 429 }
    )
  }

  const images = await collectImages(await request.formData(), MAX_IMAGES)
  if (isCollectFailure(images)) {
    return NextResponse.json({ error: images.error }, { status: images.status })
  }

  try {
    const parsed = await readImages<Partial<ExtractedDealer>>({
      images,
      system: DEALER_EXTRACTION_SYSTEM,
      prompt: DEALER_EXTRACTION_PROMPT,
      schema: DEALER_EXTRACTION_SCHEMA,
      // Eight fields including a full address, against 512 for reconcile's two
      // numbers — a truncated answer is unparseable JSON, which surfaces as
      // "couldn't read that" and sends someone back to retake a fine photo.
      maxTokens: 1024,
    })

    const dealer = normalizeExtractedDealer(parsed)
    if (isEmptyExtraction(dealer)) {
      return NextResponse.json(
        { error: "Couldn't find any dealer details in that — check it's the right screenshot, or fill the form in by hand." },
        { status: 422 }
      )
    }
    return NextResponse.json(dealer)
  } catch (err) {
    console.error('[onboard/extract] screenshot read failed:', describeFailure(err))

    if (isServiceUnavailable(err)) {
      return NextResponse.json(
        { error: 'Screenshot reading is unavailable right now — fill the form in below. (Nothing is wrong with your images; ask your admin to check the AI service.)' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: "Couldn't read those images — fill the form in by hand." }, { status: 502 })
  }
}
