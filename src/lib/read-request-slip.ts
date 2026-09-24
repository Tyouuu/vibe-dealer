import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { describeFailure, isServiceUnavailable, readImages } from '@/lib/vision-extract'
import { SLIP_EXTRACTION_PROMPT, SLIP_EXTRACTION_SCHEMA, SLIP_EXTRACTION_SYSTEM, type ExtractedSlip } from '@/lib/slip-extract'

/**
 * Reads the slip on a dealer's request the moment it arrives, and files what it said on the request
 * (0046's slip_* columns) — so the person who opens /requests finds it already checked, not "not checked
 * yet, press to read".
 *
 * This is the reading staff rely on. The one the dealer's own browser did a moment earlier (r/[token]/read)
 * only exists to help them fix a typo; it is never stored and never trusted, because it came through the
 * dealer's own phone. This one is made here, from the image as it sits in the private bucket.
 *
 * Runs after the response has gone (the caller wraps it in after()), so a slow or failing model never
 * delays or breaks a dealer's Send. A failure is recorded on the row, not swallowed: "we tried and the
 * picture was unreadable" and "nobody has tried" are different things for a reviewer to act on, and the
 * Read button on /requests is still there for either.
 *
 * Bounded by what already bounds the request itself: ten sends an hour per link and five waiting per
 * dealer (0042), so this is not a way to run up the bill.
 */
export async function readSlipForRequest(requestId: string, slipPath: string): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return
  const supabase = createServiceClient()

  try {
    const { data: blob, error: downloadError } = await supabase.storage.from('receipts').download(slipPath)
    if (downloadError || !blob) throw new Error(`could not open the slip: ${downloadError?.message ?? 'no file'}`)

    const buffer = Buffer.from(await blob.arrayBuffer())
    const mediaType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
    const slip = await readImages<ExtractedSlip>({
      images: [{ media_type: mediaType, data: buffer.toString('base64') }],
      system: SLIP_EXTRACTION_SYSTEM,
      prompt: SLIP_EXTRACTION_PROMPT,
      schema: SLIP_EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
    })

    // The model returns a string it believes is a date. A string Postgres cannot parse would fail the whole
    // update and lose the amount and reference along with it.
    const paidOn = slip.paid_on && /^\d{4}-\d{2}-\d{2}$/.test(slip.paid_on) && !Number.isNaN(Date.parse(slip.paid_on)) ? slip.paid_on : null

    await supabase
      .from('topup_requests')
      .update({
        slip_amount_rm: slip.amount_rm,
        slip_paid_on: paidOn,
        slip_bank: slip.bank?.trim() || null,
        slip_reference: slip.reference?.trim() || null,
        slip_read_at: new Date().toISOString(),
        slip_read_error: null,
      })
      .eq('id', requestId)
  } catch (err) {
    console.error('[read-request-slip] failed:', describeFailure(err))
    await supabase
      .from('topup_requests')
      .update({
        slip_read_at: new Date().toISOString(),
        slip_read_error: isServiceUnavailable(err) ? 'service unavailable' : 'could not read the image',
      })
      .eq('id', requestId)
  }
}
