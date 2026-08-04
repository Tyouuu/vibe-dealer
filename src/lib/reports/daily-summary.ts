import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReportPeriod } from './report-period'

export type DailySummary = {
  /** The period as it is printed in the subject line and the heading. */
  date: string
  /** Inclusive bounds, so the email can say exactly what it counted. */
  from: string
  to: string
  /** How many days the period spans — 1 for a daily report. */
  days: number
  points: number
  commission: number
  mostActiveDealer: { name: string; points: number } | null
  pendingCount: number
}

// A range rather than a single day. The recipient now chooses daily, weekly or
// monthly (0037), and a monthly email carrying one day's numbers would be
// worse than no email: it would claim to describe a month while showing a
// thirtieth of it, arriving once and too late to act on.
//
// pendingCount deliberately stays a live figure rather than a period one.
// "12 transactions are waiting on you" is true at the moment of reading and is
// the line somebody acts on; scoping it to last month would answer a question
// nobody asked.
export async function getReportSummary(supabase: SupabaseClient, period: ReportPeriod): Promise<DailySummary> {
  const [{ data: tx }, { count: pendingCount }] = await Promise.all([
    supabase
      .from('transactions')
      .select('dealer_id, points, commission_rm, dealers(company_name)')
      .eq('status', 'verified')
      .gte('tx_date', period.from)
      .lte('tx_date', period.to),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const points = (tx ?? []).reduce((s, t) => s + Number(t.points), 0)
  const commission = (tx ?? []).reduce((s, t) => s + Number(t.commission_rm), 0)

  const byDealer = new Map<string, { name: string; points: number }>()
  for (const t of tx ?? []) {
    const rel = t.dealers as { company_name: string } | { company_name: string }[] | null
    const name = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    const prev = byDealer.get(t.dealer_id) ?? { name, points: 0 }
    prev.points += Number(t.points)
    byDealer.set(t.dealer_id, prev)
  }
  const mostActiveDealer = [...byDealer.values()].sort((a, b) => b.points - a.points)[0] ?? null

  const days = Math.round((Date.parse(period.to) - Date.parse(period.from)) / 86_400_000) + 1

  return {
    date: period.label,
    from: period.from,
    to: period.to,
    days,
    points,
    commission,
    mostActiveDealer,
    pendingCount: pendingCount ?? 0,
  }
}
