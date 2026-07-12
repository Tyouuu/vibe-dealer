import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInMalaysia } from '@/lib/month'

// Thresholds are deliberately simple constants rather than a per-dealer
// config — Tekion's CRM model ("flag stalled deals") is the inspiration,
// but vibe-dealer's scale (242 dealers, 3 staff) doesn't justify a rules
// engine for this.
export const INACTIVE_DAYS_THRESHOLD = 30
export const DELIVERY_STALLED_DAYS_THRESHOLD = 5

export function daysSince(dateStr: string): number {
  const from = new Date(dateStr + 'T00:00:00Z').getTime()
  const now = new Date(todayInMalaysia() + 'T00:00:00Z').getTime()
  return Math.round((now - from) / (24 * 60 * 60 * 1000))
}

export type DealerActivity = {
  lastVerifiedTxDate: string
  daysSinceLastActivity: number
  isInactive: boolean
}

// Keyed by dealer_id. A dealer with zero verified transactions is simply
// absent from the map — "never purchased yet" is a different state from
// "went quiet after purchasing," and callers should treat missing-from-map
// as the former (render nothing / a neutral state, not an inactivity badge).
export async function getDealerActivityMap(supabase: SupabaseClient): Promise<Map<string, DealerActivity>> {
  const { data } = await supabase
    .from('transactions')
    .select('dealer_id, tx_date')
    .eq('status', 'verified')
    .order('tx_date', { ascending: false })

  const map = new Map<string, DealerActivity>()
  for (const row of data ?? []) {
    if (map.has(row.dealer_id)) continue // first hit per dealer is the most recent (already sorted desc)
    const days = daysSince(row.tx_date)
    map.set(row.dealer_id, {
      lastVerifiedTxDate: row.tx_date,
      daysSinceLastActivity: days,
      isInactive: days >= INACTIVE_DAYS_THRESHOLD,
    })
  }
  return map
}
