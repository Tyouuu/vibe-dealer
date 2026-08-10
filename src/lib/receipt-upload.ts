import type { SupabaseClient } from '@supabase/supabase-js'

// Attaching the paper to a money row, server-side.
//
// /entry uploads from the browser and posts the resulting path, which works
// but puts storage code, MIME checks and a size limit in a client component.
// The three forms that gained a receipt in 0044 are plain Server Actions with
// no client logic of their own, and they should not grow any: the file rides
// in the FormData like every other field and is written here, with the same
// session, into the same private bucket.
//
// The limits are the ones the app already enforces elsewhere — see
// lib/vision-extract for the OCR side and entry-form for the sale side. PDF is
// allowed here and is not on those two, because an invoice from a supplier
// routinely arrives as one, while a payment slip photographed on a phone does
// not.

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024
export const RECEIPT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
export const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf'

export type ReceiptResult = { path: string | null; error: string | null }

/**
 * Reads `receipt` out of the form and stores it under `folder`.
 *
 * Returns `{ path: null, error: null }` when no file was attached, which is
 * the normal case: the paperwork often arrives after the payment, and a
 * required receipt would either block the entry or invite a placeholder.
 */
export async function uploadReceipt(
  supabase: SupabaseClient,
  formData: FormData,
  folder: string
): Promise<ReceiptResult> {
  const file = formData.get('receipt')
  if (!(file instanceof File) || file.size === 0) return { path: null, error: null }

  if (file.size > RECEIPT_MAX_BYTES) return { path: null, error: 'That file is too large (max 10MB).' }
  if (!RECEIPT_TYPES.has(file.type)) {
    return { path: null, error: 'Please attach a JPEG, PNG, WEBP, GIF or PDF.' }
  }

  const extension = file.type === 'application/pdf' ? 'pdf' : (file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg')
  // A uuid, not the uploaded filename. Two invoices called `invoice.pdf` must
  // not collide, and a supplier's filename is not something to put in a path.
  const path = `${folder}/${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type })
  if (error) {
    console.error(`[receipt] upload to ${folder} failed:`, error.message)
    return { path: null, error: 'The file could not be uploaded. Save without it and attach it later, or try again.' }
  }
  return { path, error: null }
}
