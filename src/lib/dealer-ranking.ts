import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type DealerRanking = { totalPoints: number; rank: number }

// Ranks every dealer with at least one verified top-up by cumulative
// points, highest first — replaces the old manually-toggled Active/Inactive
// status with something that actually reflects who's bringing in volume.
// Global (not scoped to a search/region filter) so a dealer's rank means
// the same thing wherever it's shown. Requires SELECT on transactions
// (accountant/master only, 0001) — callers must not call this for cs.
export async function getDealerRankingMap(supabase: SupabaseClient): Promise<Map<string, DealerRanking>> {
  // get_dealer_points_ranking (0051): the database sums and orders, so this
  // no longer pulls one row per verified transaction ever recorded just to
  // add them up in JS — the same fix get_credit_balance() (0016) already
  // applied on the credit-balance side. Already sorted descending; the rank
  // is just this result's own position.
  const { data } = await supabase.rpc('get_dealer_points_ranking')

  const map = new Map<string, DealerRanking>()
  ;(data ?? []).forEach((row: { dealer_id: string; total_points: number }, i: number) =>
    map.set(row.dealer_id, { totalPoints: Number(row.total_points), rank: i + 1 })
  )

  return map
}
