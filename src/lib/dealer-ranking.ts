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
  const { data } = await supabase.from('transactions').select('dealer_id, points').eq('status', 'verified')

  const totalsByDealer = new Map<string, number>()
  for (const t of data ?? []) {
    totalsByDealer.set(t.dealer_id, (totalsByDealer.get(t.dealer_id) ?? 0) + Number(t.points))
  }

  const map = new Map<string, DealerRanking>()
  ;[...totalsByDealer.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([dealerId, totalPoints], i) => map.set(dealerId, { totalPoints, rank: i + 1 }))

  return map
}
