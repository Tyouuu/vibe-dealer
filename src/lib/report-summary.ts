// Turning the Monthly Report's own numbers into two or three sentences.
//
// The model is never the source of a single figure here — every number in
// the prompt is one the page has already computed from the database, and the
// system message tells it plainly not to introduce any other. This is
// narration, not extraction: the risk profile is completely different from
// vision-extract.ts, where a misread photo can hand a wrong number to a form.
// Here a bad output is a paragraph that reads oddly, never a paragraph that
// is wrong about the business, because it isn't allowed to say a number that
// wasn't handed to it.
//
// Text-only, so this does not go through readImages() — that helper always
// attaches an image and asks for strict-schema JSON, neither of which apply
// to writing a couple of sentences of prose.

import OpenAI from 'openai'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { monthRange, previousMonth, formatMonthLabel } from '@/lib/month'
import { formatMYR } from '@/lib/money'
import { allRows } from '@/lib/fetch-all'

// Same model as vision-extract.ts, for the same reason mini is the pick
// there: on a small, well-constrained task the larger models buy nothing.
// This task is smaller still — a handful of numbers in, two sentences out —
// so there was no case for re-running a bake-off over it.
const TEXT_MODEL = 'gpt-4.1-mini'

// Money and point figures are pre-formatted strings ("RM 2,008.80",
// "97,465"), not raw numbers. Handed a raw 2008.8, the model would happily
// re-render it as "RM 2008.80" or "RM2,009" in prose — technically the same
// number, but not the one printed on the page next to the paragraph, which
// reads as the summary having gotten something wrong even though the value
// was never actually different. Formatting it once, the same way
// formatMYR() does everywhere else in the app, and telling the model to
// reproduce figures exactly removes that whole failure mode.
export type ReportSummaryInputs = {
  monthLabel: string
  prevMonthLabel: string
  totalEarnedRm: string
  prevEarnedRm: string
  totalCommissionRm: string
  simMarginRm: string
  totalPoints: string
  transactionCount: number
  dealerCount: number
  topDealerName: string | null
  topDealerPoints: string | null
  reconcileStatus: 'matched' | 'mismatch' | 'not_checked'
  varianceMagnitudePoints: string | null
  excludedCount: number
}

/** A fingerprint of the numbers a summary was written from — see the comment on report_summaries in migration 0049. */
export function hashSummaryInputs(inputs: ReportSummaryInputs): string {
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex')
}

// Shared by the page (to decide whether a cached summary is stale) and the
// generate action (to know what to write one from) — computed once here so
// the two can never quietly drift into using different figures for the same
// month. Only a subset of what Monthly Report itself shows: enough for two
// or three honest sentences, not a restatement of the whole page.
export async function computeReportSummaryInputs(supabase: SupabaseClient, month: string): Promise<ReportSummaryInputs> {
  const { start, end } = monthRange(month)
  const prevMonth = previousMonth(month)
  const { start: prevStart, end: prevEnd } = monthRange(prevMonth)

  // Every figure below is added up from rows, so the rows have to be ALL of them: the API
  // returns at most 1,000 per request and stops without an error, and a month passes that.
  const simOrderRows = (a: string, b: string) =>
    allRows((from, to) =>
      supabase
        .from('sim_orders')
        .select('quantity, unit_price_rm, unit_cost_rm, shipping_fee_rm')
        .gte('order_date', a)
        .lte('order_date', b)
        .order('id')
        .range(from, to),
    )
  const [{ data: rows }, { data: prevTotals }, { data: simOrders }, { data: prevSimOrders }, { data: statement }, { count: pendingCount }] = await Promise.all([
    allRows((from, to) =>
      supabase
        .from('transactions')
        .select('dealer_id, points, commission_rm, dealers(company_name)')
        .eq('status', 'verified')
        .gte('tx_date', start)
        .lte('tx_date', end)
        .order('id')
        .range(from, to),
    ),
    // Last month contributes one number, so it is a sum in the database (0054).
    supabase.rpc('verified_month_totals', { p_start: prevStart, p_end: prevEnd }).single(),
    simOrderRows(start, end),
    simOrderRows(prevStart, prevEnd),
    supabase.from('company_statements').select('company_total_points').eq('month', `${month}-01`).maybeSingle(),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending').gte('tx_date', start).lte('tx_date', end),
  ])

  const txRows = (rows ?? []) as { dealer_id: string; points: number; commission_rm: number; dealers: { company_name: string } | { company_name: string }[] | null }[]
  const marginOf = (list: { quantity: number; unit_price_rm: number | string; unit_cost_rm: number | string; shipping_fee_rm: number | string | null }[]) =>
    list.reduce((s, o) => s + o.quantity * (Number(o.unit_price_rm) - Number(o.unit_cost_rm)) - Number(o.shipping_fee_rm ?? 0), 0)

  const totalCommission = txRows.reduce((s, t) => s + Number(t.commission_rm), 0)
  const simMargin = marginOf(simOrders ?? [])
  const totalEarned = totalCommission + simMargin
  const prevCommission = Number((prevTotals as { commission: number | string } | null)?.commission ?? 0)
  const prevSimMargin = marginOf(prevSimOrders ?? [])
  const prevEarned = prevCommission + prevSimMargin
  const totalPoints = txRows.reduce((s, t) => s + Number(t.points), 0)

  const byDealer = new Map<string, { name: string; points: number }>()
  for (const t of txRows) {
    const rel = t.dealers
    const name = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    const prev = byDealer.get(t.dealer_id) ?? { name, points: 0 }
    prev.points += Number(t.points)
    byDealer.set(t.dealer_id, prev)
  }
  const topDealer = [...byDealer.values()].sort((a, b) => b.points - a.points)[0] ?? null

  const companyPoints = statement?.company_total_points != null ? Number(statement.company_total_points) : null
  const diff = companyPoints != null ? Math.round((totalPoints - companyPoints) * 100) / 100 : null

  return {
    monthLabel: formatMonthLabel(month),
    prevMonthLabel: formatMonthLabel(prevMonth),
    totalEarnedRm: formatMYR(totalEarned),
    prevEarnedRm: formatMYR(prevEarned),
    totalCommissionRm: formatMYR(totalCommission),
    simMarginRm: formatMYR(simMargin),
    totalPoints: totalPoints.toLocaleString(),
    transactionCount: txRows.length,
    dealerCount: byDealer.size,
    topDealerName: topDealer?.name ?? null,
    topDealerPoints: topDealer ? topDealer.points.toLocaleString() : null,
    reconcileStatus: companyPoints == null ? 'not_checked' : diff === 0 ? 'matched' : 'mismatch',
    varianceMagnitudePoints: diff != null && diff !== 0 ? Math.abs(diff).toLocaleString() : null,
    excludedCount: pendingCount ?? 0,
  }
}

export async function writeReportSummary(inputs: ReportSummaryInputs): Promise<string> {
  const client = new OpenAI()
  const completion = await client.chat.completions.create({
    model: TEXT_MODEL,
    max_completion_tokens: 200,
    messages: [
      {
        role: 'system',
        content:
          'You write a short, plain-English summary of a monthly business report for a prepaid-SIM reseller. ' +
          'You are given exact figures already computed from the database, pre-formatted as they appear on the ' +
          'page (e.g. "RM 2,008.80", "97,465"). Reproduce every figure exactly as given, digit for digit, comma ' +
          'and all — never reformat, round, abbreviate, or recompute a number, and never introduce a figure that ' +
          'was not provided. Two to three sentences, plain prose, no markdown, no bullet points, no headings. ' +
          'Sound like a colleague giving a quick verbal update, not a report title.',
      },
      { role: 'user', content: JSON.stringify(inputs) },
    ],
  })
  const text = completion.choices[0]?.message?.content?.trim()
  if (!text) throw new Error('model returned no text')
  return text
}

/** Same status classification isServiceUnavailable in vision-extract.ts uses — duplicated rather than shared because importing from a vision-specific module for a text-only caller would be the wrong dependency to draw. */
export function isSummaryServiceUnavailable(err: unknown): boolean {
  const status = (err as { status?: number })?.status
  const detail = String((err as Error)?.message ?? err)
  return status === 401 || status === 403 || status === 429 || (status ?? 0) >= 500 || /credit balance|billing|quota|rate limit/i.test(detail)
}
