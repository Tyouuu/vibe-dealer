import type { SupabaseClient } from '@supabase/supabase-js'
import { PACKAGES, type PackageCode } from '@/lib/packages'

// Dealer rate follows their most recent package purchase (PROJECT_SPEC.md
// 3.3). Packages bought same-day count as one batch and resolve to the best
// rate in that batch. Called after inserting a package transaction, and
// after flagging one out, so a corrected/voided purchase can't leave a
// stale rate on the dealer.
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

  let newPackage: PackageCode | null = null
  let newRate: number | null = null

  if (pkgTxs?.length) {
    const latestDate = pkgTxs[0].tx_date
    const bestPkg = pkgTxs
      .filter((t) => t.tx_date === latestDate)
      .map((t) => t.package as PackageCode)
      .reduce((best, code) => (PACKAGES[code].rate > PACKAGES[best].rate ? code : best))
    newPackage = bestPkg
    newRate = PACKAGES[bestPkg].rate
  }

  const result = await supabase.from('dealers').update({ package: newPackage, rate: newRate }).eq('id', dealerId)

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
