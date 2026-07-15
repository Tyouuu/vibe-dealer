import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInMalaysia } from '@/lib/month'

// Thresholds are deliberately simple constants rather than a per-dealer
// config — Tekion's CRM model ("flag stalled deals") is the inspiration,
// but vibe-dealer's scale (242 dealers, 3 staff) doesn't justify a rules
// engine for this.
export const INACTIVE_DAYS_THRESHOLD = 30
export const INACTIVE_SEVERE_DAYS_THRESHOLD = 60
export const DELIVERY_WARN_DAYS_THRESHOLD = 1
export const DELIVERY_STALLED_DAYS_THRESHOLD = 5
export const PENDING_REVIEW_STALE_DAYS = 2

export function daysSince(dateStr: string): number {
  const from = new Date(dateStr + 'T00:00:00Z').getTime()
  const now = new Date(todayInMalaysia() + 'T00:00:00Z').getTime()
  return Math.round((now - from) / (24 * 60 * 60 * 1000))
}

export type DealerActivity = {
  lastVerifiedTxDate: string
  daysSinceLastActivity: number
  isInactive: boolean
  isSeverelyInactive: boolean
}

// Keyed by dealer_id. A dealer with zero verified transactions is simply
// absent from the map — "never purchased yet" is a different state from
// "went quiet after purchasing," and callers should treat missing-from-map
// as the former (render nothing / a neutral state, not an inactivity badge).
export async function getDealerActivityMap(supabase: SupabaseClient): Promise<Map<string, DealerActivity>> {
  const { data } = await supabase.from('dealer_last_verified_activity').select('dealer_id, last_tx_date')

  const map = new Map<string, DealerActivity>()
  for (const row of data ?? []) {
    const days = daysSince(row.last_tx_date)
    map.set(row.dealer_id, {
      lastVerifiedTxDate: row.last_tx_date,
      daysSinceLastActivity: days,
      isInactive: days >= INACTIVE_DAYS_THRESHOLD,
      isSeverelyInactive: days >= INACTIVE_SEVERE_DAYS_THRESHOLD,
    })
  }
  return map
}
