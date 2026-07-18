import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    company_total_points: { type: ['number', 'null'], description: "Vibe's total top-up/reload points figure for the month, if visible" },
    company_profit_rm: { type: ['number', 'null'], description: "Vibe's profit/commission figure in RM for the month, if visible" },
  },
  required: ['company_total_points', 'company_profit_rm'],
  additionalProperties: false,
} as const

// Reads a photo/screenshot of Vibe's monthly statement and pulls out the two
// numbers the reconcile form needs, so staff don't have to retype them by
// hand. Best-effort — the caller still gets an editable number input either
// way, this only pre-fills it.
export async function POST(request: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
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

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Please choose an image file.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is too large (max 10MB).' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Please upload a JPEG, PNG, WEBP, or GIF image.' }, { status: 400 })
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const client = new Anthropic()

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system:
        "You read monthly reseller statements from a telecom company called Vibe Mobile. Find this month's total top-up/reload points figure and the profit/commission figure in RM. If a figure isn't visible in the image, return null for it rather than guessing.",
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: file.type as 'image/jpeg', data: base64 } },
            { type: 'text', text: "Extract this month's total points and profit/commission figure from the statement." },
          ],
        },
      ],
      output_config: {
        format: { type: 'json_schema', schema: EXTRACTION_SCHEMA },
      },
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: "Couldn't read that image — enter the numbers manually." }, { status: 502 })
    }

    const parsed = JSON.parse(textBlock.text) as { company_total_points: number | null; company_profit_rm: number | null }
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: "Couldn't read that image — enter the numbers manually." }, { status: 502 })
  }
}
