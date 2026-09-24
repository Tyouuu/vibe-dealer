import 'server-only'
import * as Sentry from '@sentry/nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { reportToSentry } from '@/lib/sentry-report'

export type DealerRanking = { totalPoints: number; rank: number }

/**
 * `unavailable` means the database could not be asked — NOT that nobody has topped up. The two look the
 * same in an empty map, which is the whole reason it is returned: a list of dealers with no rank and an
 * "Ever topped up: 0" hero would read as a fact about the business when it is a fact about a failed read.
 */
export type RankingResult = { map: Map<string, DealerRanking>; unavailable: boolean }

// Ranks every dealer with at least one verified top-up by cumulative
// points, highest first — replaces the old manually-toggled Active/Inactive
// status with something that actually reflects who's bringing in volume.
// Global (not scoped to a search/region filter) so a dealer's rank means
// the same thing wherever it's shown. Requires SELECT on transactions
// (accountant/master only, 0001) — callers must not call this for cs.
export async function getDealerRankingMap(supabase: SupabaseClient): Promise<RankingResult> {
  // get_dealer_points_ranking (0051): the database sums and orders, so this
  // no longer pulls one row per verified transaction ever recorded just to
  // add them up in JS — the same fix get_credit_balance() (0016) already
  // applied on the credit-balance side. Already sorted descending; the rank
  // is just this result's own position.
  //
  // One retry, because a timeout is usually a busy moment rather than a broken database — the same call
  // getAvailablePointsBalance makes. After that the failure is reported and returned, never swallowed: this
  // read used to ignore the error and hand back an empty map, so a failed read showed every dealer as never
  // having topped up.
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.rpc('get_dealer_points_ranking')
    if (!error) {
      const map = new Map<string, DealerRanking>()
      ;(data ?? []).forEach((row: { dealer_id: string; total_points: number }, i: number) =>
        map.set(row.dealer_id, { totalPoints: Number(row.total_points), rank: i + 1 })
      )
      return { map, unavailable: false }
    }
    lastError = error.message
  }

  await reportToSentry(() => Sentry.captureException(new Error(`[dealer-ranking] could not read the ranking: ${lastError}`)))
  return { map: new Map(), unavailable: true }
}
