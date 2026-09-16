'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { computeReportSummaryInputs, hashSummaryInputs, isSummaryServiceUnavailable, writeReportSummary } from '@/lib/report-summary'

function fail(month: string, message: string): never {
  redirect(`/reports?month=${month}&summaryError=${encodeURIComponent(message)}`)
}

export async function generateReportSummary(formData: FormData) {
  const user = await requireUser()
  const month = String(formData.get('month') ?? '')
  if (user.role !== 'accountant' && user.role !== 'master') fail(month, 'Not authorized.')
  if (!/^\d{4}-\d{2}$/.test(month)) fail(month, 'Pick a month first.')

  if (!process.env.OPENAI_API_KEY) fail(month, 'Report summaries are not configured yet.')

  const supabase = await createClient()
  // Same shape as the OCR routes' ocr:<user> key — a real, billed OpenAI call
  // behind a per-user throttle. Generous for a button someone might press a
  // couple of times while comparing months, tight enough to stop a script
  // from looping it.
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `report-summary:${user.id}`,
    p_max_hits: 10,
    p_window_seconds: 60 * 60,
  })
  if (allowed === false) fail(month, 'Too many summaries generated this hour — try again later.')

  const inputs = await computeReportSummaryInputs(supabase, month)
  const inputsHash = hashSummaryInputs(inputs)

  try {
    const summary = await writeReportSummary(inputs)
    const { error } = await supabase
      .from('report_summaries')
      .upsert({ month: `${month}-01`, summary, inputs_hash: inputsHash, generated_by: user.id, generated_at: new Date().toISOString() })
    if (error) fail(month, 'Wrote the summary but could not save it — try again.')
  } catch (err) {
    if (isSummaryServiceUnavailable(err)) fail(month, 'Summary writing is unavailable right now — try again shortly.')
    fail(month, "Couldn't write a summary this time — try again.")
  }

  redirect(`/reports?month=${month}`)
}
