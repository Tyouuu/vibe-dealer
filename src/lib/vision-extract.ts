// Reading a photograph into a form, without each caller reinventing the parts
// that are the same every time.
//
// /api/reconcile/extract did all of this inline and got it right, including
// the part that is easy to get wrong: telling "your image is unreadable" apart
// from "the AI service is down or unfunded". That distinction was written after
// an incident where every call was failing on an Anthropic billing error and
// the screen told the operator their photograph was the problem — so they
// retook it, forever. It is preserved here rather than rewritten.
//
// Deliberately not one do-everything function. Each caller keeps its own
// sentences, because the right words depend on what the person was trying to
// do ("enter the numbers manually" means nothing on the onboarding form), and
// its own role guard and rate-limit budget. What is shared is only what is
// genuinely identical: file validation, the model call, and how a failure is
// classified.

import OpenAI from 'openai'

/**
 * Which model reads the pictures. One constant, because all three callers go
 * through readImages() below.
 *
 * Chosen by measurement, not by reputation — qa-model-bakeoff.mjs put the
 * same receipt through six of them twice:
 *
 *   clean screenshot   every model scored 5/5, including gpt-4.1-nano.
 *                      On a legible image the choice makes no difference to
 *                      the answer, only to speed and tokens.
 *   photo of a screen  every model scored 2/5, including gpt-4.1 and gpt-4o.
 *                      Amount right, date and reference confidently invented.
 *                      The limit there is the image; paying for a bigger
 *                      model buys nothing.
 *
 * So the pick is the cheap end of the accurate group. gpt-4o-mini is the trap:
 * its name says mini but it tiled the same image into 37,172 input tokens
 * against this model's 1,957 — twenty-five times the cost for an identical
 * answer. gpt-5-mini took six seconds and spent 374 tokens thinking about a
 * transcription task.
 *
 * The one field that survived every model and both images was the amount,
 * which is the one the comparison in slip-extract.ts turns into a refusal.
 */
const VISION_MODEL = 'gpt-4.1-mini'

export const MAX_BYTES = 10 * 1024 * 1024
export const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
export const ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,image/gif'

export type VisionImage = { media_type: string; data: string }

type CollectFailure = { error: string; status: number }

export function isCollectFailure(v: unknown): v is CollectFailure {
  return typeof v === 'object' && v !== null && 'error' in v
}

/**
 * Pulls every `file` entry out of a multipart body and validates each one.
 *
 * Rejects the whole batch on the first bad file rather than silently reading
 * the good ones: a caller who attached four screenshots and got two read would
 * have no way to tell which two, and would trust a half-filled form.
 */
export async function collectImages(formData: FormData, maxImages: number): Promise<VisionImage[] | CollectFailure> {
  const files = formData.getAll('file').filter((f): f is File => f instanceof File && f.size > 0)

  if (!files.length) return { error: 'Please choose an image file.', status: 400 }
  if (files.length > maxImages) {
    return { error: `That is too many images at once (max ${maxImages}).`, status: 400 }
  }

  const images: VisionImage[] = []
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return { error: `"${file.name}" is too large (max 10MB).`, status: 400 }
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return { error: 'Please upload JPEG, PNG, WEBP, or GIF images.', status: 400 }
    }
    images.push({ media_type: file.type, data: Buffer.from(await file.arrayBuffer()).toString('base64') })
  }
  return images
}

/**
 * One constrained model call. Returns the parsed object, or throws — callers
 * classify the throw with `isServiceUnavailable` and choose their own words.
 *
 * `null` is always a valid value in these schemas: a field that is not visible
 * in the image has to come back empty, because a guessed company number or a
 * guessed month total is worse than a blank one somebody fills in.
 */
export async function readImages<T>(opts: {
  images: VisionImage[]
  system: string
  prompt: string
  schema: Record<string, unknown>
  maxTokens?: number
}): Promise<T> {
  const client = new OpenAI()
  const completion = await client.chat.completions.create({
    model: VISION_MODEL,
    max_completion_tokens: opts.maxTokens ?? 512,
    messages: [
      { role: 'system', content: opts.system },
      {
        role: 'user',
        content: [
          ...opts.images.map((img) => ({
            type: 'image_url' as const,
            image_url: { url: `data:${img.media_type};base64,${img.data}` },
          })),
          { type: 'text' as const, text: opts.prompt },
        ],
      },
    ],
    // strict mode, so the reply is the schema or the request fails — the
    // alternative is parsing prose and hoping. Every schema here therefore
    // lists all its properties in `required` and sets additionalProperties
    // false, which is what strict demands.
    response_format: { type: 'json_schema', json_schema: { name: 'extraction', strict: true, schema: opts.schema } },
  })

  const text = completion.choices[0]?.message?.content
  if (!text) throw new UnreadableImage()
  return JSON.parse(text) as T
}

/** The model answered, but with nothing usable in it. Not a service problem. */
export class UnreadableImage extends Error {
  constructor() {
    super('model returned no text block')
    this.name = 'UnreadableImage'
  }
}

/**
 * True when the failure is the service's, not the picture's — an unfunded or
 * revoked key, a throttle, an outage. The caller must say something different
 * in that case, because retaking the photo will never help.
 */
export function isServiceUnavailable(err: unknown): boolean {
  if (err instanceof UnreadableImage) return false
  const status = (err as { status?: number })?.status
  const detail = String((err as Error)?.message ?? err)
  return (
    status === 401 ||
    status === 403 ||
    status === 429 ||
    (status ?? 0) >= 500 ||
    /credit balance|billing|quota|rate limit/i.test(detail)
  )
}

/** What to put in the server log, whatever the caller decides to show. */
export function describeFailure(err: unknown): string {
  const status = (err as { status?: number })?.status
  const detail = String((err as Error)?.message ?? err)
  return `${status ?? '-'} ${detail.slice(0, 300)}`
}
