import type { SupabaseClient } from '@supabase/supabase-js'
import { PACKAGES, type PackageCode } from '@/lib/packages'

// Dealer rate follows their most recent package purchase (PROJECT_SPEC.md
// 3.3). Packages bought same-day count as one batch and resolve to the best
// rate in that batch. Called after inserting a package transaction, and
// after flagging one out, so a corrected/voided purchase can't leave a
// stale rate on the dealer.
export async function recomputeDealerRate(supabase: SupabaseClient, dealerId: string) {
  const { data: pkgTxs } = await supabase
    .from('transactions')
    .select('package, tx_date')
    .eq('dealer_id', dealerId)
    .eq('type', 'package')
    .neq('status', 'flagged')
    .order('tx_date', { ascending: false })
    .limit(50)

  if (!pkgTxs?.length) {
    return supabase.from('dealers').update({ package: null, rate: null }).eq('id', dealerId)
  }

  const latestDate = pkgTxs[0].tx_date
  const bestPkg = pkgTxs
    .filter((t) => t.tx_date === latestDate)
    .map((t) => t.package as PackageCode)
    .reduce((best, code) => (PACKAGES[code].rate > PACKAGES[best].rate ? code : best))

  return supabase.from('dealers').update({ package: bestPkg, rate: PACKAGES[bestPkg].rate }).eq('id', dealerId)
}
