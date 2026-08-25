import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { collectImages, describeFailure, isCollectFailure, isServiceUnavailable, readImages } from '@/lib/vision-extract'

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    company_total_points: { type: ['number', 'null'], description: "Vibe's total top-up/reload points figure for the month, if visible" },
    company_profit_rm: { type: ['number', 'null'], description: "Vibe's profit/commission figure in RM for the month, if visible" },
  },
  required: ['company_total_points', 'company_profit_rm'],
  additionalProperties: false,
} as const

type Extracted = { company_total_points: number | null; company_profit_rm: number | null }

// Reads a photo/screenshot of Vibe's monthly statement and pulls out the two
// numbers the reconcile form needs, so staff don't have to retype them by
// hand. Best-effort — the caller still gets an editable number input either
// way, this only pre-fills it.
//
// The shared parts — file validation, the constrained model call, and telling
// a bad photograph apart from a dead service — live in lib/vision-extract.ts,
// alongside the story of why that last distinction exists. What stays here is
// what is specific to reconciliation: who may call it, what to look for, and
// the sentences a person doing month-end should read.
export async function POST(request: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Statement reading is not configured yet.' }, { status: 503 })
  }

  // Every call is real, billed Anthropic spend with no prior throttle —
  // generous enough for normal reconciliation use, tight enough to stop a
  // runaway retry loop or scripted abuse from racking up unbounded cost.
  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `ocr:${user.id}`,
    p_max_hits: 20,
    p_window_seconds: 60 * 60,
  })
  if (allowed === false) {
    return NextResponse.json({ error: 'Too many statement reads this hour — enter the numbers manually, or try again later.' }, { status: 429 })
  }

  const images = await collectImages(await request.formData(), 1)
  if (isCollectFailure(images)) {
    return NextResponse.json({ error: images.error }, { status: images.status })
  }

  try {
    const parsed = await readImages<Extracted>({
      images,
      system:
        "You read monthly reseller statements from a telecom company called Vibe Mobile. Find this month's total top-up/reload points figure and the profit/commission figure in RM. If a figure isn't visible in the image, return null for it rather than guessing.",
      prompt: "Extract this month's total points and profit/commission figure from the statement.",
      schema: EXTRACTION_SCHEMA,
    })
    return NextResponse.json(parsed)
  } catch (err) {
    // Two different sentences because they need two different actions: retake
    // the photo, or go and fix the account. The real reason goes to the server
    // log either way, because a swallowed error is one nobody can ever
    // diagnose from the outside.
    console.error('[reconcile/extract] statement read failed:', describeFailure(err))

    if (isServiceUnavailable(err)) {
      return NextResponse.json(
        { error: 'Statement reading is unavailable right now — type the numbers in below. (Nothing is wrong with your image; ask your admin to check the AI service.)' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: "Couldn't read that image — enter the numbers manually." }, { status: 502 })
  }
}
