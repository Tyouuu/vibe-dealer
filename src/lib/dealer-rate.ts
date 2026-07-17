import type { SupabaseClient } from '@supabase/supabase-js'
import { PACKAGES, type PackageCode } from '@/lib/packages'

// Same-day package purchases count as one batch and resolve to the single
// "current" package — the biggest one bought that day, not just whichever
// happened to be recorded last. Split out from the DB-querying function
// below so the tie-break itself can be unit tested. See dealer-rate.test.ts.
//
// Assumes txs is already sorted newest-tx_date-first (recomputeDealerRate's
// own query guarantees this) — this function just reads txs[0] as "latest,"
// it doesn't re-sort.
//
// Compares by `reload` (package size), not `rate`: since the flat-6% rate
// unification (migration 0010) every package has the same rate, so a
// rate-based comparison can no longer tell them apart and would silently
// degrade into "whichever sorts first" — reload is the field that still
// actually varies between A/B/C.
export function pickCurrentPackage(
  txs: { package: PackageCode; tx_date: string }[]
): { package: PackageCode | null; rate: number | null } {
  if (!txs.length) return { package: null, rate: null }
  const latestDate = txs[0].tx_date
  const bestPkg = txs
    .filter((t) => t.tx_date === latestDate)
    .map((t) => t.package)
    .reduce((best, code) => (PACKAGES[code].reload > PACKAGES[best].reload ? code : best))
  return { package: bestPkg, rate: PACKAGES[bestPkg].rate }
}

// Dealer rate follows their most recent package purchase (PROJECT_SPEC.md
// 3.3). Called after inserting a package transaction, and after flagging one
// out, so a corrected/voided purchase can't leave a stale rate on the dealer.
//
// Every actual change is also snapshotted to dealer_rate_history (before ->
// after, and who triggered it) so the dealers table's overwrite-in-place
// update doesn't erase the trail — see 0006_dealer_rate_history.sql.
export async function recomputeDealerRate(supabase: SupabaseClient, dealerId: string, changedBy: string) {
  const { data: before } = await supabase
    .from('dealers')
    .select('package, rate')
    .eq('id', dealerId)
    .single()

  const { data: pkgTxs } = await supabase
    .from('transactions')
    .select('package, tx_date')
    .eq('dealer_id', dealerId)
    .eq('type', 'package')
    .neq('status', 'flagged')
    .order('tx_date', { ascending: false })
    .limit(50)

  const { package: newPackage, rate: newRate } = pickCurrentPackage(
    (pkgTxs ?? []) as { package: PackageCode; tx_date: string }[]
  )

  const result = await supabase.from('dealers').update({ package: newPackage, rate: newRate }).eq('id', dealerId)
  if (result.error) return result // update failed — don't record a history entry claiming it succeeded

  const oldPackage = before?.package ?? null
  const oldRate = before?.rate ?? null
  if (oldPackage !== newPackage || oldRate !== newRate) {
    await supabase.from('dealer_rate_history').insert({
      dealer_id: dealerId,
      old_package: oldPackage,
      old_rate: oldRate,
      new_package: newPackage,
      new_rate: newRate,
      changed_by: changedBy,
    })
  }

  return result
}
