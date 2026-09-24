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
//
// Split from the data fetch below so this arithmetic — the actual thing that
// decides whether a sale gets blocked — can be unit tested without a live
// database. See credit-balance.test.ts.
export function computeAvailableBalance(totalPurchased: number, totalCommitted: number): number {
  return totalPurchased - totalCommitted
}

// Sourced from a real server-side aggregate (0016), not a pull-every-row-and-
// sum-in-JS — the old approach had no row limit and would silently
// undercount totalCommitted (making available look *bigger* than reality,
// the unsafe direction) once transactions crossed PostgREST's per-request
// row cap. A single-row aggregate is immune to that regardless of table
// size, and it's the same query the DB-level insert trigger enforces the
// hard-block with (0016), so the app's fast-path check and the real backstop
// can never quietly disagree.
//
// A failed read is an ERROR, never a balance of zero. This used to ignore the error and treat
// "no data" as 0 — so when the read timed out under load, the dashboard printed "Credit 0 pts",
// the low-balance alert said "Out of credit — buy from Vibe Mobile", and New Transaction refused
// sales with "Not enough credit balance: 0 pts available": a false and alarming figure standing
// in for one we simply could not read. One retry first (a timeout is usually a busy moment, not a
// broken database), then it throws, which the page's error boundary and Sentry both see.
export async function getAvailablePointsBalance(supabase: SupabaseClient): Promise<CreditBalance> {
  type Row = { total_purchased: number; total_committed: number; available: number }
  let last = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = (await supabase.rpc('get_credit_balance').single()) as {
      data: Row | null
      error: { message: string } | null
    }
    if (!error && data) {
      const totalPurchased = Number(data.total_purchased ?? 0)
      const totalCommitted = Number(data.total_committed ?? 0)
      return { available: computeAvailableBalance(totalPurchased, totalCommitted), totalPurchased, totalCommitted }
    }
    last = error?.message ?? 'no row returned'
  }
  throw new Error(`Could not read the credit balance: ${last}`)
}
