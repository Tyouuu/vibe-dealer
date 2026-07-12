import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { yesterdayInMalaysia } from '@/lib/month'

export type DailySummary = {
  date: string
  points: number
  commission: number
  mostActiveDealer: { name: string; points: number } | null
  pendingCount: number
}

export async function getYesterdaySummary(supabase: SupabaseClient): Promise<DailySummary> {
  const yesterday = yesterdayInMalaysia()

  const [{ data: yesterdayTx }, { count: pendingCount }] = await Promise.all([
    supabase
      .from('transactions')
      .select('dealer_id, points, commission_rm, dealers(company_name)')
      .eq('status', 'verified')
      .eq('tx_date', yesterday),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const points = (yesterdayTx ?? []).reduce((s, t) => s + Number(t.points), 0)
  const commission = (yesterdayTx ?? []).reduce((s, t) => s + Number(t.commission_rm), 0)

  const byDealer = new Map<string, { name: string; points: number }>()
  for (const t of yesterdayTx ?? []) {
    const rel = t.dealers as { company_name: string } | { company_name: string }[] | null
    const name = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    const prev = byDealer.get(t.dealer_id) ?? { name, points: 0 }
    prev.points += Number(t.points)
    byDealer.set(t.dealer_id, prev)
  }
  const mostActiveDealer = [...byDealer.values()].sort((a, b) => b.points - a.points)[0] ?? null

  return { date: yesterday, points, commission, mostActiveDealer, pendingCount: pendingCount ?? 0 }
}
