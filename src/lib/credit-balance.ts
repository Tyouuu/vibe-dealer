import type { SupabaseClient } from '@supabase/supabase-js'
import { PACKAGES } from './packages'

export type CreditBalance = { available: number; totalPurchased: number; totalCommitted: number }

// Below this, the balance can't even cover one more sale of the biggest
// package — pts stops being "fine" and starts being "you will get blocked on
// the next big sale." Derived from PACKAGES rather than a round number so it
// stays correct if package sizes ever change.
export const LOW_BALANCE_THRESHOLD = Math.max(...Object.values(PACKAGES).map((p) => p.reload))

// "Available" = total points ever bought from Vibe Mobile (credit_purchases)
// minus everything already committed to a dealer. A *pending* transaction
// still counts as committed — the dealer has already received that credit in
// practice, it just hasn't been double-checked yet — only flagged (voided)
// transactions are excluded. This is the single definition of balance used
// both to hard-block New Transaction when there isn't enough stock, and to
// display the running balance on /purchases — deliberately the same number
// in both places rather than two subtly different "balance" figures.
export async function getAvailablePointsBalance(supabase: SupabaseClient): Promise<CreditBalance> {
  const [{ data: purchases }, { data: committed }] = await Promise.all([
    supabase.from('credit_purchases').select('points'),
    supabase.from('transactions').select('points').neq('status', 'flagged'),
  ])

  const totalPurchased = (purchases ?? []).reduce((s, p) => s + Number(p.points), 0)
  const totalCommitted = (committed ?? []).reduce((s, t) => s + Number(t.points), 0)

  return { available: totalPurchased - totalCommitted, totalPurchased, totalCommitted }
}
